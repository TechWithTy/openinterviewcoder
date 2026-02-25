const { ipcRenderer } = require("electron");

let sessions = {
  input: null,
  output: null,
};

const DEFAULT_PAUSE_MS = 2500;
const MIN_PAUSE_MS = 500;
const MAX_PAUSE_MS = 60000;
const DEFAULT_STREAM_SEGMENT_MS = 1800;
const MIN_STREAM_SEGMENT_MS = 900;
const MAX_STREAM_SEGMENT_MS = 6000;
const MONITOR_INTERVAL_MS = 100;
const MIN_SEGMENT_MS = 1200;
const MAX_SEGMENT_MS = 30000;
const SILENCE_RMS_THRESHOLD = 0.008;

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }
  const name = error.name || error.constructor?.name || "Error";
  const message = error.message || String(error);
  const code =
    error.code !== undefined && error.code !== null
      ? ` (code: ${error.code})`
      : "";
  return `${name}: ${message}${code}`;
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

function pickMimeType() {
  const preferred = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mime of preferred) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

function buildDefaultConstraints(type) {
  if (type === "output") {
    return { audio: true };
  }
  return { audio: true };
}

function resolveConstraints(streamOrConstraints, type) {
  if (
    streamOrConstraints &&
    typeof streamOrConstraints === "object" &&
    !("getTracks" in streamOrConstraints)
  ) {
    return streamOrConstraints;
  }
  return buildDefaultConstraints(type);
}

async function acquireOutputStream(recordingConfig, fallbackConstraints) {
  const outputCaptureMode = recordingConfig?.outputCaptureMode || "system";
  if (outputCaptureMode === "microphone") {
    return navigator.mediaDevices.getUserMedia(fallbackConstraints);
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("System audio capture is not available in this environment");
  }

  let displayStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });
  } catch (error) {
    throw new Error(
      `System audio capture failed. ${formatError(
        error
      )}. If prompted, allow screen capture and system audio.`
    );
  }

  const audioTracks = displayStream.getAudioTracks();
  if (!audioTracks.length) {
    displayStream.getTracks().forEach((track) => track.stop());
    throw new Error(
      "No system audio track detected. In the picker, choose a screen/tab/window with audio enabled."
    );
  }

  displayStream.getVideoTracks().forEach((track) => track.stop());
  return new MediaStream(audioTracks);
}

function normalizePauseMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAUSE_MS;
  }
  return Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, Math.round(parsed)));
}

function normalizeStreamSegmentMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STREAM_SEGMENT_MS;
  }
  return Math.min(MAX_STREAM_SEGMENT_MS, Math.max(MIN_STREAM_SEGMENT_MS, Math.round(parsed)));
}

function computeRms(analyser, sampleBuffer) {
  analyser.getByteTimeDomainData(sampleBuffer);
  let sumSquares = 0;
  for (let i = 0; i < sampleBuffer.length; i++) {
    const normalized = (sampleBuffer[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / sampleBuffer.length);
}

async function startTranscription(streamOrConstraints, recordingConfig, type, onTranscript) {
  try {
    stopTranscription(type);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Media capture is not available in this environment");
    }
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not available in this environment");
    }

    const constraints = resolveConstraints(streamOrConstraints, type);
    const pauseMs = normalizePauseMs(recordingConfig?.pauseMs);
    const streamSegmentMs = normalizeStreamSegmentMs(recordingConfig?.streamSegmentMs);
    const stream =
      type === "output"
        ? await acquireOutputStream(recordingConfig, constraints)
        : await navigator.mediaDevices.getUserMedia(constraints);

    const mimeType = pickMimeType();
    const recorderOptions = mimeType ? { mimeType } : undefined;
    const mediaRecorder = new MediaRecorder(stream, recorderOptions);

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const sampleBuffer = new Uint8Array(analyser.fftSize);

    const now = Date.now();
    const session = {
      stream,
      mediaRecorder,
      audioContext,
      source,
      analyser,
      sampleBuffer,
      monitorTimer: null,
      inFlight: false,
      chunkQueue: [],
      stopped: false,
      pauseMs,
      streamSegmentMs,
      segmentStartedAt: now,
      lastSoundAt: now,
      hadSoundSinceSegmentStart: false,
    };
    sessions[type] = session;

    const drainQueue = async () => {
      if (session.inFlight || session.stopped || session.chunkQueue.length === 0) {
        return;
      }
      session.inFlight = true;
      const chunk = session.chunkQueue.shift();
      try {
        const audioBase64 = await blobToBase64(chunk.blob);
        const result = await ipcRenderer.invoke("transcribe-audio-chunk", {
          audioBase64,
          mimeType: chunk.mimeType,
          type,
        });
        if (result?.success && result.text && !session.stopped) {
          onTranscript(result.text, true, type);
        }
      } catch (error) {
        console.error(`[transcription:${type}] chunk transcription failed`, error);
      } finally {
        session.inFlight = false;
        if (!session.stopped) {
          drainQueue();
        }
      }
    };

    mediaRecorder.ondataavailable = (event) => {
      if (session.stopped || !event.data || event.data.size === 0) {
        return;
      }
      console.log(
        `[transcription:${type}] segment captured`,
        event.data.type || mimeType || "audio/webm",
        event.data.size
      );
      session.chunkQueue.push({
        blob: event.data,
        mimeType: event.data.type || mimeType || "audio/webm",
      });
      drainQueue();
    };

    mediaRecorder.onerror = (event) => {
      console.error(`[transcription:${type}] MediaRecorder error`, event.error);
      stopTranscription(type);
    };

    mediaRecorder.onstop = () => {
      if (session.stopped) {
        return;
      }
      try {
        if (mediaRecorder.state === "inactive") {
          const restartAt = Date.now();
          session.segmentStartedAt = restartAt;
          session.lastSoundAt = restartAt;
          session.hadSoundSinceSegmentStart = false;
          mediaRecorder.start();
        }
      } catch (error) {
        console.error(`[transcription:${type}] Failed to restart recorder`, error);
      }
    };

    mediaRecorder.start();

    session.monitorTimer = setInterval(() => {
      if (session.stopped || mediaRecorder.state !== "recording") {
        return;
      }

      const rms = computeRms(session.analyser, session.sampleBuffer);
      const timeNow = Date.now();
      const segmentAge = timeNow - session.segmentStartedAt;

      if (rms >= SILENCE_RMS_THRESHOLD) {
        session.lastSoundAt = timeNow;
        session.hadSoundSinceSegmentStart = true;
      }

      const silenceAge = timeNow - session.lastSoundAt;
      const shouldCutOnSilence =
        session.hadSoundSinceSegmentStart &&
        segmentAge >= MIN_SEGMENT_MS &&
        silenceAge >= session.pauseMs;
      const shouldCutOnRealtimeCadence =
        segmentAge >= session.streamSegmentMs;
      const shouldCutOnMaxAge = segmentAge >= MAX_SEGMENT_MS;
      const hasBacklog = session.inFlight || session.chunkQueue.length >= 2;

      const shouldCut =
        shouldCutOnMaxAge ||
        ((shouldCutOnSilence || shouldCutOnRealtimeCadence) && !hasBacklog);

      if (shouldCut) {
        const reason = shouldCutOnMaxAge
          ? "max-age"
          : shouldCutOnSilence
            ? "silence"
            : "realtime";
        console.log(`[transcription:${type}] closing segment`, {
          reason,
          rms: Number(rms.toFixed(4)),
          silenceAge,
          segmentAge,
          pauseMs: session.pauseMs,
          streamSegmentMs: session.streamSegmentMs,
          hasBacklog,
        });
        try {
          mediaRecorder.stop();
        } catch (error) {
          console.error(`[transcription:${type}] Failed to close segment`, error);
        }
      }
    }, MONITOR_INTERVAL_MS);

    return true;
  } catch (err) {
    const formatted = formatError(err);
    console.error("Transcription error:", formatted, err);
    throw new Error(formatted);
  }
}

function stopTranscription(type) {
  const session = sessions[type];
  if (!session) {
    return;
  }

  sessions[type] = null;
  session.stopped = true;
  session.chunkQueue = [];

  if (session.monitorTimer) {
    clearInterval(session.monitorTimer);
    session.monitorTimer = null;
  }

  try {
    if (session.mediaRecorder && session.mediaRecorder.state !== "inactive") {
      session.mediaRecorder.stop();
    }
  } catch (error) {
    console.error(`[transcription:${type}] Failed to stop media recorder`, error);
  }

  try {
    session.source?.disconnect?.();
  } catch {}
  try {
    session.audioContext?.close?.();
  } catch {}

  try {
    session.stream?.getTracks?.().forEach((track) => track.stop());
  } catch (error) {
    console.error(`[transcription:${type}] Failed to stop media tracks`, error);
  }
}

module.exports = {
  startTranscription,
  stopTranscription,
};

const fs = require("fs/promises");
const path = require("path");
const mammoth = require("mammoth");
const parsePdf = require("pdf-parse");

const MAX_DOCUMENT_CHARS = 250000;

async function extractDocument(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== ".pdf" && extension !== ".docx") {
    throw new Error("Only PDF and DOCX files are supported.");
  }

  let text = "";
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else {
    const data = await fs.readFile(filePath);
    const result = await parsePdf(data);
    text = result.text;
  }

  text = String(text || "").replace(/\u0000/g, "").replace(/\s{3,}/g, " ").trim();
  if (!text) throw new Error("No readable text was found in this document.");

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: path.basename(filePath),
    type: extension.slice(1).toUpperCase(),
    text: text.slice(0, MAX_DOCUMENT_CHARS),
    truncated: text.length > MAX_DOCUMENT_CHARS,
  };
}

module.exports = { extractDocument };

const Store = require("electron-store");

const store = new Store({
  name: "conversation-history",
  defaults: { conversations: [] },
});

const MAX_CONVERSATIONS = 200;

function asTimestamp(value, fallback = Date.now()) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeMessage(message = {}) {
  return {
    id: String(message.id || message.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    messageId: message.messageId ? String(message.messageId) : undefined,
    type: String(message.type || "assistant"),
    content: typeof message.content === "string" ? message.content : "",
    timestamp: asTimestamp(message.timestamp),
    status: message.status ? String(message.status) : undefined,
    source: message.source ? String(message.source) : undefined,
    filePath: message.filePath ? String(message.filePath) : undefined,
  };
}

function getTitle(messages) {
  const firstText = messages.find((message) => message.content?.trim())?.content?.trim() || "New conversation";
  return firstText.replace(/\s+/g, " ").slice(0, 72);
}

function toSummary(conversation) {
  const messageText = conversation.messages
    .map((message) => message.content)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    preview: messageText.slice(0, 180),
    searchText: `${conversation.title} ${messageText}`.toLowerCase(),
  };
}

function getAll() {
  const conversations = store.get("conversations");
  return Array.isArray(conversations) ? conversations : [];
}

function saveConversation(input = {}) {
  const id = String(input.id || "");
  if (!id) throw new Error("A conversation id is required.");

  const conversations = getAll();
  const existing = conversations.find((conversation) => conversation.id === id);
  const messages = Array.isArray(input.messages) ? input.messages.map(normalizeMessage) : existing?.messages || [];
  const now = Date.now();
  const conversation = {
    id,
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : getTitle(messages),
    createdAt: asTimestamp(existing?.createdAt || input.createdAt, now),
    updatedAt: now,
    messages,
  };

  const next = [conversation, ...conversations.filter((item) => item.id !== id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
  store.set("conversations", next);
  return toSummary(conversation);
}

function listConversations() {
  return getAll()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(toSummary);
}

function getConversation(id) {
  const conversation = getAll().find((item) => item.id === id);
  return conversation ? JSON.parse(JSON.stringify(conversation)) : null;
}

module.exports = { getConversation, listConversations, saveConversation };

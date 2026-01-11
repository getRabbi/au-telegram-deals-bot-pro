function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function apiUrl(method) {
  const token = mustEnv("TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/bot${token}/${method}`;
}

function safeString(v) {
  return String(v ?? "");
}

async function postJson(method, payload) {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram ${method} failed (non-JSON). status=${res.status} body=${text}`);
  }

  if (!json?.ok) {
    throw new Error(
      `Telegram ${method} failed. status=${res.status} response=${safeString(JSON.stringify(json))}`
    );
  }
  return json.result;
}

/**
 * Send photo post with inline buttons.
 */
export async function sendPhotoPost({
  imageUrl,
  caption,
  buttons,
  disablePreview = true, // Telegram ignores preview on photo usually, but keep for parity
  messageThreadId,
}) {
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const payload = {
    chat_id: chatId,
    photo: safeString(imageUrl),
    caption: safeString(caption),
    parse_mode: "HTML",
    disable_web_page_preview: Boolean(disablePreview),
    reply_markup: { inline_keyboard: buttons || [] },
  };

  if (messageThreadId) payload.message_thread_id = messageThreadId;

  return postJson("sendPhoto", payload);
}

/**
 * Send normal message with inline buttons.
 */
export async function sendMessage({
  text,
  buttons,
  disablePreview = true,
  messageThreadId,
}) {
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const payload = {
    chat_id: chatId,
    text: safeString(text),
    parse_mode: "HTML",
    disable_web_page_preview: Boolean(disablePreview),
    reply_markup: { inline_keyboard: buttons || [] },
  };

  if (messageThreadId) payload.message_thread_id = messageThreadId;

  return postJson("sendMessage", payload);
}

/**
 * Alias: convenient for fallback text posting
 */
export async function sendTextPost({ text, disablePreview = false }) {
  return sendMessage({ text, disablePreview });
}

/**
 * Pin a message in the chat/channel.
 */
export async function pinMessage({ messageId, disableNotification = true }) {
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: Boolean(disableNotification),
  };

  await postJson("pinChatMessage", payload);
  return true;
}

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function apiUrl(method) {
  const token = mustEnv("TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function sendPhotoPost({ imageUrl, caption, buttons }) {
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const payload = {
    chat_id: chatId,
    photo: imageUrl,
    caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons || [] },
  };

  const res = await fetch(apiUrl("sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${JSON.stringify(json)}`);
  return json.result;
}

export async function sendMessage({ text, buttons, disablePreview = true }) {
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: disablePreview,
    reply_markup: { inline_keyboard: buttons || [] },
  };

  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(json)}`);
  return json.result;
}

export async function pinMessage({ messageId, disableNotification = true }) {
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: disableNotification,
  };

  const res = await fetch(apiUrl("pinChatMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram pinChatMessage failed: ${JSON.stringify(json)}`);
  return true;
}

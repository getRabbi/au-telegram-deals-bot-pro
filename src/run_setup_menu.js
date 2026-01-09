import { sendMessage, pinMessage } from "./telegram.js";

function channelUsername() {
  // TELEGRAM_CHAT_ID যদি @YourChannel হয়, তাহলে username পাওয়া যাবে
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (chat.startsWith("@")) return chat.slice(1);
  // না হলে user কে secret এ @channel দিতে হবে
  return "";
}

function qLink(username, hashtag) {
  const tag = encodeURIComponent(`#${hashtag}`);
  return `https://t.me/${username}?q=${tag}`;
}

const username = channelUsername();
if (!username) {
  throw new Error("TELEGRAM_CHAT_ID অবশ্যই @YourChannel ফরম্যাটে দিতে হবে (MENU search link এর জন্য)");
}

const menuText =
  `📌 <b>DEALS MENU</b>\n` +
  `এখান থেকে Top Deals / Store-wise deals দেখো 👇\n\n` +
  `🔥 <b>Top Deals</b> = শুধু সবচেয়ে ভালো অফার (#TopDeals)\n` +
  `🛒 <b>All Deals</b> = সব পোস্ট\n\n` +
  `✅ <b>Tip:</b> TopDeals এ ক্লিক করলে শুধু best deal গুলাই দেখাবে।`;

const buttons = [
  [{ text: "🔥 Top Deals Only", url: qLink(username, "TopDeals") }],
  [{ text: "🛒 All Deals", url: `https://t.me/${username}` }],

  [{ text: "🛒 Amazon", url: qLink(username, "AmazonAU") },
   { text: "🖥️ JB Hi-Fi", url: qLink(username, "JBHiFi") }],

  [{ text: "🥦 Coles", url: qLink(username, "Coles") },
   { text: "🛍️ Woolworths", url: qLink(username, "Woolworths") }],

  [{ text: "🏠 BIG W", url: qLink(username, "BigW") },
   { text: "🧴 Chemist", url: qLink(username, "ChemistWarehouse") }],
];

const msg = await sendMessage({ text: menuText, buttons });
await pinMessage({ messageId: msg.message_id });

console.log("✅ MENU posted & pinned.");

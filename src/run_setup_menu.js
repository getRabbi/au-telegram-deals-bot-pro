import { sendMessage, pinMessage } from "./telegram.js";

function channelUsername() {
  // If TELEGRAM_CHAT_ID is @YourChannel, we can build Telegram "?q=#hashtag" links.
  const chat = process.env.TELEGRAM_CHAT_ID || "";
  if (chat.startsWith("@")) return chat.slice(1);
  // If it's a numeric chat id, we can't build "?q=..." links.
  return "";
}

function qLink(username, hashtag) {
  const tag = encodeURIComponent(`#${hashtag}`);
  return `https://t.me/${username}?q=${tag}`;
}

const username = channelUsername();
if (!username) {
  throw new Error("TELEGRAM_CHAT_ID must be in @YourChannel format to enable MENU hashtag search links.");
}

const menuText =
  `📌 <b>DEALS MENU</b>\n` +
  `Browse Top Deals and store-wise deals 👇\n\n` +
  `🔥 <b>Top Deals Only</b>: best offers (#TopDeals)\n` +
  `🛒 <b>All Posts</b>: full channel feed\n\n` +
  `Tip: Use store buttons to jump to posts tagged for that store.`;

const buttons = [
  [{ text: "🔥 Top Deals Only", url: qLink(username, "TopDeals") }],
  [{ text: "🛒 All Deals", url: `https://t.me/${username}` }],

  [{ text: "🛒 Amazon", url: qLink(username, "AmazonAU") },
   { text: "🖥️ JB Hi-Fi", url: qLink(username, "JBHiFi") }],

  [{ text: "🥦 Coles", url: qLink(username, "Coles") },
   { text: "🛍️ Woolworths", url: qLink(username, "Woolworths") }],

  [{ text: "🏠 BIG W", url: qLink(username, "BigW") },
   { text: "🧴 Chemist", url: qLink(username, "ChemistWarehouse") }],

  // External quick links (official deal pages)
  [{ text: "Amazon Deals Page", url: "https://www.amazon.com.au/gp/goldbox" }],
  [{ text: "Woolworths Specials", url: "https://www.woolworths.com.au/shop/browse/specials" }],
  [{ text: "Coles Offers", url: "https://www.coles.com.au/offers" }],
  [{ text: "JB Hi-Fi Deals", url: "https://www.jbhifi.com.au/collections/this-weeks-hottest-deals" }],
];

const msg = await sendMessage({ text: menuText, buttons });
await pinMessage({ messageId: msg.message_id });

console.log("✅ MENU posted & pinned.");

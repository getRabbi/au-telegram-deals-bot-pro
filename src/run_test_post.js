import { sendPhotoPost } from "./telegram.js";
import { formatDealCard } from "./formatPost.js";

const channelLink =
  (process.env.TELEGRAM_CHAT_ID || "").startsWith("@")
    ? `https://t.me/${process.env.TELEGRAM_CHAT_ID.slice(1)}`
    : "https://t.me/";

const deal = {
  title: "TEST – Demo Deal Card",
  store: "Amazon AU",
  now: "$19.99",
  was: "$39.99",
  discountPct: 50,
  endsText: "Test post",
  hashtags: ["#TopDeals", "#AmazonAU", "#Today", "#Shopping"]
};

await sendPhotoPost({
  imageUrl: "https://picsum.photos/800/800.jpg",
  caption: formatDealCard(deal),
  buttons: [
    [{ text: "👉 Open", url: "https://www.amazon.com.au/" }],
    [{ text: "🏪 Open Channel", url: channelLink }]
  ]
});

console.log("✅ Test post sent.");

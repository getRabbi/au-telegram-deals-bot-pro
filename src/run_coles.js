import path from "node:path";
import { loadState, saveState, pruneOld, hasPosted, rememberPosted } from "./state.js";
import { sendPhotoPost } from "./telegram.js";
import { formatDealCard } from "./formatPost.js";
import { affiliateUrl } from "./affiliate.js";
import { sleep } from "./utils.js";
import { fetchColes } from "./stores/coles.js";

const MAX_POSTS = Number(process.env.MAX_POSTS_PER_STORE || 4);
const DAYS_TTL = Number(process.env.DAYS_TTL || 7);
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 4500);
const POSTED_PATH = path.join(process.cwd(), "data", "posted.json");

const deals = await fetchColes({ limit: MAX_POSTS * 2 });
const state = loadState(POSTED_PATH);
pruneOld(state, DAYS_TTL);

let posted = 0;
for (const d of deals) {
  if (posted >= MAX_POSTS) break;
  if (!d.now) continue;
  if (hasPosted(state, d)) continue;

  const url = affiliateUrl("COLES", d.url);

  const caption = formatDealCard({
    title: d.title,
    store: d.store,
    now: d.now,
    was: d.was || "",
    discountPct: d.discountPct,
    endsText: "Limited time (check deal page)",
    hashtags: ["#TopDeals", "#Coles", "#Today"]
  });

  await sendPhotoPost({
    imageUrl: d.imageUrl,
    caption,
    buttons: [[{ text: "👉 Get Deal", url }]]
  });

  rememberPosted(state, d);
  posted++;
  await sleep(RATE_LIMIT_MS);
}

saveState(POSTED_PATH, state);
console.log(`✅ Posted coles: ${posted}`);

import path from "node:path";
import { loadState, saveState, pruneOld, hasPosted, rememberPosted } from "./state.js";
import { sendPhotoPost } from "./telegram.js";
import { formatDealCard } from "./formatPost.js";
import { affiliateUrl } from "./affiliate.js";
import { sleep } from "./utils.js";

import { fetchAmazon } from "./stores/amazon.js";
import { fetchWoolworths } from "./stores/woolworths.js";
import { fetchColes } from "./stores/coles.js";
import { fetchBigW } from "./stores/bigw.js";
import { fetchChemistWarehouse } from "./stores/chemistwarehouse.js";
import { fetchJBHiFi } from "./stores/jbhifi.js";

const MAX_TOTAL = Number(process.env.MAX_POSTS_TOTAL || 12);
const MAX_PER_STORE = Number(process.env.MAX_POSTS_PER_STORE || 4);
const DAYS_TTL = Number(process.env.DAYS_TTL || 7);
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 4500);

const POSTED_PATH = path.join(process.cwd(), "data", "posted.json");

const state = loadState(POSTED_PATH);
pruneOld(state, DAYS_TTL);

const storeFetchers = [
  { tag: "AMAZONAU", name: "Amazon AU", hashtag: "#AmazonAU", fn: fetchAmazon },
  { tag: "WOOLWORTHS", name: "Woolworths", hashtag: "#Woolworths", fn: fetchWoolworths },
  { tag: "COLES", name: "Coles", hashtag: "#Coles", fn: fetchColes },
  { tag: "BIGW", name: "BIG W", hashtag: "#BigW", fn: fetchBigW },
  { tag: "CHEMISTWAREHOUSE", name: "Chemist Warehouse", hashtag: "#ChemistWarehouse", fn: fetchChemistWarehouse },
  { tag: "JBHIFI", name: "JB Hi-Fi", hashtag: "#JBHiFi", fn: fetchJBHiFi }
];

// Fetch in sequence to avoid heavy parallel load on Actions runners
const all = [];
for (const s of storeFetchers) {
  try {
    const deals = await s.fn({ limit: Math.max(10, MAX_PER_STORE * 2) });
    for (const d of deals) {
      all.push({ ...d, storeTag: s.tag, _hashtag: s.hashtag });
    }
    console.log(`Fetched ${s.tag}: ${deals.length}`);
  } catch (e) {
    console.log(`⚠️ Fetch failed ${s.tag}: ${String(e)}`);
  }
}

// Filter: must have now price, and not duplicate
const filtered = all.filter(d => d.now && !hasPosted(state, d));

// Rank: higher discount first; if missing discount, push down.
filtered.sort((a, b) => {
  const da = Number.isFinite(a.discountPct) ? a.discountPct : -1;
  const db = Number.isFinite(b.discountPct) ? b.discountPct : -1;
  if (db !== da) return db - da;
  return (b.now || "").length - (a.now || "").length;
});

// Enforce per-store caps
const perStoreCount = new Map();
const selected = [];
for (const d of filtered) {
  if (selected.length >= MAX_TOTAL) break;
  const k = d.storeTag || "UNKNOWN";
  const c = perStoreCount.get(k) || 0;
  if (c >= MAX_PER_STORE) continue;
  perStoreCount.set(k, c + 1);
  selected.push(d);
}

console.log(`Selected to post: ${selected.length}`);

let posted = 0;
for (let i = 0; i < selected.length; i++) {
  const d = selected[i];

  const rankTag = posted < Math.min(4, MAX_TOTAL) ? "#TopDeals" : "#GoodDeal";
  const url = affiliateUrl(d.storeTag || "", d.url);

  const caption = formatDealCard({
    title: d.title,
    store: d.store,
    now: d.now,
    was: d.was || "",
    discountPct: d.discountPct,
    endsText: "Limited time (check deal page)",
    hashtags: [rankTag, d._hashtag || "", "#Today", "#AustraliaDeals"].filter(Boolean)
  });

  await sendPhotoPost({
    imageUrl: d.imageUrl,
    caption,
    buttons: [
      [{ text: "👉 Get Deal", url }],
      [{ text: "📌 Browse More", url: browseMoreUrl(d.storeTag || "") }]
    ]
  });

  rememberPosted(state, d);
  posted++;
  await sleep(RATE_LIMIT_MS);
}

saveState(POSTED_PATH, state);
console.log(`✅ Done. Posted ${posted}/${MAX_TOTAL} deals.`);

function browseMoreUrl(tag) {
  switch (tag) {
    case "AMAZONAU": return "https://www.amazon.com.au/gp/goldbox";
    case "WOOLWORTHS": return "https://www.woolworths.com.au/shop/browse/specials";
    case "COLES": return "https://www.coles.com.au/offers";
    case "BIGW": return "https://www.bigw.com.au/deals";
    case "CHEMISTWAREHOUSE": return "https://www.chemistwarehouse.com.au/catalogue";
    case "JBHIFI": return "https://www.jbhifi.com.au/collections/this-weeks-hottest-deals";
    default: return "https://www.google.com";
  }
}

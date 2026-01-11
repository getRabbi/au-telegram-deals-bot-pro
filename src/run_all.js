import path from "node:path";
import { loadState, saveState, pruneOld, hasPosted, rememberPosted } from "./state.js";
import { sendPhotoPost, sendTextPost } from "./telegram.js";
import { formatDealCard } from "./formatPost.js";
import { affiliateUrl } from "./affiliate.js";
import { sleep, sanitizePrices, calcDiscountPct, scoreDeal } from "./utils.js";

import { fetchAmazon } from "./stores/amazon.js";
import { fetchWoolworths } from "./stores/woolworths.js";
import { fetchColes } from "./stores/coles.js";
import { fetchBigW } from "./stores/bigw.js";
import { fetchChemistWarehouse } from "./stores/chemistwarehouse.js";
import { fetchJBHiFi } from "./stores/jbhifi.js";

const MAX_TOTAL = Number(process.env.MAX_POSTS_TOTAL || 12);
const MAX_PER_STORE = Number(process.env.MAX_POSTS_PER_STORE || 4);
const DAYS_TTL = Number(process.env.DAYS_TTL || 3);
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 4500);

// strict filter (high value + good discount) then fallback
const MIN_DAILY = Number(process.env.MIN_POSTS_DAILY || 8);
const FALLBACK_MODE = String(process.env.FALLBACK_MODE || "1") === "1";

// strict knobs (tune-able)
const STRICT_MIN_DISCOUNT = Number(process.env.STRICT_MIN_DISCOUNT || 20); // 20%
const STRICT_MIN_PRICE = Number(process.env.STRICT_MIN_PRICE || 150);      // $150+

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

// Fetch in sequence
const all = [];
for (const s of storeFetchers) {
  try {
    const deals = await s.fn({ limit: Math.max(12, MAX_PER_STORE * 5) });

    for (const d of deals) {
      // sanitize prices to fix "now > was" bug
      const cleaned = sanitizePrices({ now: d.now, was: d.was });
      const discountPct = calcDiscountPct(cleaned.now, cleaned.was);

      all.push({
        ...d,
        storeTag: s.tag,
        store: d.store || s.name,
        _hashtag: s.hashtag,
        now: cleaned.now,
        was: cleaned.was,
        discountPct: discountPct ?? d.discountPct
      });
    }

    console.log(`Fetched ${s.tag}: ${deals.length}`);
  } catch (e) {
    console.log(`⚠️ Fetch failed ${s.tag}: ${String(e)}`);
  }
}

// must have title + url + now and not duplicate
const baseFiltered = all.filter(d =>
  d.title && d.url && d.now && !hasPosted(state, d)
);

// strict filter (preference)
function strictFilter(d) {
  const pct = Number(d.discountPct || 0);
  const nowNum = Number(String(d.now).replace(/[^\d.]/g, "")) || 0;
  return pct >= STRICT_MIN_DISCOUNT && nowNum >= STRICT_MIN_PRICE;
}

function pickDeals(deals) {
  // rank high discount first + score
  const sorted = [...deals].sort((a, b) => scoreDeal(b) - scoreDeal(a));

  const perStoreCount = new Map();
  const out = [];

  for (const d of sorted) {
    if (out.length >= MAX_TOTAL) break;

    const k = d.storeTag || "UNKNOWN";
    const c = perStoreCount.get(k) || 0;
    if (c >= MAX_PER_STORE) continue;

    perStoreCount.set(k, c + 1);
    out.push(d);
  }
  return out;
}

// 1) strict selection
let selected = pickDeals(baseFiltered.filter(strictFilter));

// 2) fallback if not enough
if (FALLBACK_MODE && selected.length < MIN_DAILY) {
  selected = pickDeals(baseFiltered);
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

  // Post strategy:
  // - Try photo post
  // - If photo fails (bad URL / blocked), fall back to text message so daily posting never stops
  try {
    await sendPhotoPost({
      imageUrl: d.imageUrl,
      caption,
      buttons: [
        [{ text: "👉 Get Deal", url }],
        [{ text: "📌 Browse More", url: browseMoreUrl(d.storeTag || "") }]
      ]
    });
  } catch (e) {
    console.log(`⚠️ sendPhoto failed. Falling back to text. Reason: ${String(e)}`);
    await sendTextPost({
      text: `${caption}\n\n👉 Get Deal: ${url}\n📌 Browse More: ${browseMoreUrl(d.storeTag || "")}`
    });
  }

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

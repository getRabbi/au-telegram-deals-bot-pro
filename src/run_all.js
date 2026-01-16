import path from "node:path";
import { loadState, saveState, pruneOld, hasPosted, rememberPosted } from "./state.js";
import { sendPhotoPost, sendTextPost } from "./telegram.js";
import { formatDealCard } from "./formatPost.js";
import { affiliateUrl } from "./affiliate.js";
import { sleep, normalizeSpace, normalizePriceText, calcDiscountPct, priceToNumber, stripQuery } from "./utils.js";

import { fetchAmazon } from "./stores/amazon.js";
import { fetchWoolworths } from "./stores/woolworths.js";
import { fetchColes } from "./stores/coles.js";
import { fetchBigW } from "./stores/bigw.js";
import { fetchChemistWarehouse } from "./stores/chemistwarehouse.js";
import { fetchJBHiFi } from "./stores/jbhifi.js";

const MAX_TOTAL = Number(process.env.MAX_POSTS_TOTAL || 15);
const MAX_PER_STORE = Number(process.env.MAX_POSTS_PER_STORE || 4);
const MIN_DAILY = Number(process.env.MIN_POSTS_DAILY || 10);

const DAYS_TTL = Number(process.env.DAYS_TTL || 7);
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 4500);

// strict preference (but fallback guaranteed)
const STRICT_MIN_DISCOUNT = Number(process.env.STRICT_MIN_DISCOUNT || 20);
const STRICT_MIN_PRICE = Number(process.env.STRICT_MIN_PRICE || 120);
const FALLBACK_MODE = String(process.env.FALLBACK_MODE || "1") === "1";

const POSTED_PATH = path.join(process.cwd(), "data", "posted.json");

const state = loadState(POSTED_PATH);
pruneOld(state, DAYS_TTL);

// ---------- helpers ----------
function sanitizePrices({ now, was }) {
  const n = normalizePriceText(now || "");
  const w = normalizePriceText(was || "");
  // if was < now, swap or drop was
  const nn = priceToNumber(n);
  const ww = priceToNumber(w);
  if (nn && ww && ww < nn) {
    // better to drop was than show wrong
    return { now: n, was: "" };
  }
  return { now: n, was: w };
}

function scoreDeal(d) {
  const pct = Number.isFinite(d.discountPct) ? d.discountPct : 0;
  const nowNum = priceToNumber(d.now);
  // prefer higher discount, and not super cheap junk
  return pct * 1000 + Math.min(nowNum, 2000);
}

function strictOk(d) {
  const pct = Number(d.discountPct || 0);
  const nowNum = priceToNumber(d.now);
  return pct >= STRICT_MIN_DISCOUNT && nowNum >= STRICT_MIN_PRICE;
}

function browseMoreUrl(tag) {
  switch (tag) {
    case "AMAZONAU": return "https://www.amazon.com.au/gp/goldbox";
    case "WOOLWORTHS": return "https://www.woolworths.com.au/shop/browse/specials";
    case "COLES": return "https://www.coles.com.au/offers";
    case "BIGW": return "https://www.bigw.com.au/deals";
    case "CHEMISTWAREHOUSE": return "https://www.chemistwarehouse.com.au/catalogue";
    case "JBHIFI": return "https://www.jbhifi.com.au/collections/this-weeks-hottest-deals";
    default: return "https://www.ozbargain.com.au/";
  }
}

async function fetchOzbargainFallback({ limit = 20, storeTag = "LOCAL", storeName = "Local Deals", hashtag = "#AustraliaDeals" } = {}) {
  // safe, no API keys, works in Actions
  // RSS has title + link; we parse % from title if present
  const rss = "https://www.ozbargain.com.au/deals/feed";
  const text = await fetch(rss).then(r => r.text());

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(text))) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1]
      || (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    if (!title || !link) continue;

    const cleanTitle = normalizeSpace(title).replace(/&amp;/g, "&");
    const pctMatch = cleanTitle.match(/(\d{1,2})%\s*off/i) || cleanTitle.match(/save\s*(\d{1,2})%/i);
    const pct = pctMatch ? Number(pctMatch[1]) : undefined;

    items.push({
      store: storeName,
      storeTag,
      id: stripQuery(link),
      title: cleanTitle.slice(0, 140),
      now: "",     // unknown
      was: "",
      discountPct: pct,
      imageUrl: "", // no image => will send text fallback
      url: stripQuery(link),
      _hashtag: hashtag,
      extraLine: "Local deal source (check page for full price & coupon)"
    });

    if (items.length >= limit) break;
  }

  return items;
}

// ---------- stores ----------
const storeFetchers = [
  { tag: "AMAZONAU", name: "Amazon AU", hashtag: "#AmazonAU", fn: fetchAmazon },
  { tag: "WOOLWORTHS", name: "Woolworths", hashtag: "#Woolworths", fn: fetchWoolworths },
  { tag: "COLES", name: "Coles", hashtag: "#Coles", fn: fetchColes },
  { tag: "BIGW", name: "BIG W", hashtag: "#BigW", fn: fetchBigW },
  { tag: "CHEMISTWAREHOUSE", name: "Chemist Warehouse", hashtag: "#ChemistWarehouse", fn: fetchChemistWarehouse },
  { tag: "JBHIFI", name: "JB Hi-Fi", hashtag: "#JBHiFi", fn: fetchJBHiFi },
];

// Fetch in sequence (stable on Actions)
const all = [];
for (const s of storeFetchers) {
  try {
    const deals = await s.fn({ limit: Math.max(12, MAX_PER_STORE * 5) });

    for (const d of deals) {
      const cleaned = sanitizePrices({ now: d.now, was: d.was });
      const pct = calcDiscountPct(cleaned.now, cleaned.was);

      all.push({
        ...d,
        storeTag: s.tag,
        store: d.store || s.name,
        _hashtag: s.hashtag,
        now: cleaned.now,
        was: cleaned.was,
        discountPct: (pct ?? d.discountPct),
        url: stripQuery(d.url || ""),
        imageUrl: d.imageUrl || ""
      });
    }

    console.log(`Fetched ${s.tag}: ${deals.length}`);
  } catch (e) {
    console.log(`⚠️ Fetch failed ${s.tag}: ${String(e)}`);
  }
}

// if most stores are 0 => inject local fallback deals
let baseFiltered = all.filter(d => d.title && d.url && !hasPosted(state, d));

const totalFromStores = baseFiltered.length;
if (FALLBACK_MODE && totalFromStores < MIN_DAILY) {
  const fallbackDeals = await fetchOzbargainFallback({ limit: 40 });
  for (const d of fallbackDeals) {
    if (!hasPosted(state, d)) baseFiltered.push(d);
  }
  console.log(`Fallback injected. total now: ${baseFiltered.length}`);
}

// rank + pick
function pickDeals(deals) {
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

// 1) strict first
let selected = pickDeals(baseFiltered.filter(strictOk));

// 2) fallback fill
if (FALLBACK_MODE && selected.length < MIN_DAILY) {
  selected = pickDeals(baseFiltered);
}

console.log(`Selected to post: ${selected.length}`);

// post
let posted = 0;
for (const d of selected) {
  const rankTag = posted < Math.min(4, MAX_TOTAL) ? "#TopDeals" : "#GoodDeal";
  const url = affiliateUrl(d.storeTag || "", d.url || "");

  const caption = formatDealCard({
    title: d.title,
    store: d.store,
    now: d.now || "",
    was: d.was || "",
    discountPct: d.discountPct,
    extraLine: d.extraLine || "",
    endsText: "Limited time (check deal page)",
    hashtags: [rankTag, d._hashtag || "", "#Today", "#AustraliaDeals"].filter(Boolean),
  });

  // Photo first if we have a real image; else text.
  try {
    if (d.imageUrl) {
      await sendPhotoPost({
        imageUrl: d.imageUrl,
        caption,
        buttons: [
          [{ text: "👉 Get Deal", url }],
          [{ text: "📌 Browse More", url: browseMoreUrl(d.storeTag || "") }],
        ],
      });
    } else {
      throw new Error("No imageUrl");
    }
  } catch (e) {
    console.log(`⚠️ Photo skipped/fail -> text fallback. reason=${String(e)}`);
    await sendTextPost({
      text: `${caption}\n\n👉 Get Deal: ${url}\n📌 Browse More: ${browseMoreUrl(d.storeTag || "")}`,
      disablePreview: false,
    });
  }

  rememberPosted(state, d);
  posted++;
  await sleep(RATE_LIMIT_MS);
}

saveState(POSTED_PATH, state);
console.log(`✅ Done. Posted ${posted}/${MAX_TOTAL} deals.`);

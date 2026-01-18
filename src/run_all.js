import path from "node:path";
import {
  loadState,
  saveState,
  pruneOld,
  hasPosted,
  rememberPosted
} from "./state.js";
import { sendPhotoPost, sendTextPost } from "./telegram.js";
import { formatDealCard } from "./formatPost.js";
import { affiliateUrl } from "./affiliate.js";
import {
  sleep,
  normalizeSpace,
  normalizePriceText,
  calcDiscountPct,
  priceToNumber,
  stripQuery,
  sanitizePrices,
  scoreDeal,
  extractPricesFromText
} from "./utils.js";

import { fetchAmazon } from "./stores/amazon.js";
import { fetchWoolworths } from "./stores/woolworths.js";
import { fetchColes } from "./stores/coles.js";
import { fetchBigW } from "./stores/bigw.js";
import { fetchChemistWarehouse } from "./stores/chemistwarehouse.js";
import { fetchJBHiFi } from "./stores/jbhifi.js";
import { fetchLocalFallback } from "./stores/localFallback.js";
import { fetchCatch } from "./stores/catch.js";
import { fetchKogan } from "./stores/kogan.js";
import { fetchMyDeal } from "./stores/mydeal.js";
import { fetchOfficeworks } from "./stores/officeworks.js";
import { fetchOzBargain } from "./stores/ozbargain.js";

// ---------------- config ----------------

const MAX_TOTAL = Number(process.env.MAX_POSTS_TOTAL || 15);
const MAX_PER_STORE = Number(process.env.MAX_POSTS_PER_STORE || 4);
const MIN_DAILY = Number(process.env.MIN_POSTS_DAILY || 10);

const DAYS_TTL = Number(process.env.DAYS_TTL || 7);
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 4500);

// strict preference (but never blocks daily posting)
const STRICT_MIN_DISCOUNT = Number(process.env.STRICT_MIN_DISCOUNT || 20);
const STRICT_MIN_PRICE = Number(process.env.STRICT_MIN_PRICE || 120);
const FALLBACK_MODE = String(process.env.FALLBACK_MODE || "1") === "1";

const POSTED_PATH = path.join(process.cwd(), "data", "posted.json");

// ---------------- helpers ----------------

function strictOk(d) {
  const pct = Number(d.discountPct || 0);
  const nowNum = priceToNumber(d.now);
  return pct >= STRICT_MIN_DISCOUNT && nowNum >= STRICT_MIN_PRICE;
}

function browseMoreUrl(tag) {
  switch (tag) {
    case "AMAZONAU":
      return "https://www.amazon.com.au/gp/goldbox";
    case "WOOLWORTHS":
      return "https://www.woolworths.com.au/shop/browse/specials";
    case "COLES":
      return "https://www.coles.com.au/offers";
    case "BIGW":
      return "https://www.bigw.com.au/deals";
    case "CHEMISTWAREHOUSE":
      return "https://www.chemistwarehouse.com.au/catalogue";
    case "JBHIFI":
      return "https://www.jbhifi.com.au/collections/this-weeks-hottest-deals";
    default:
      return "https://www.ozbargain.com.au/";
  }
}

function classifyByUrl(u) {
  const s = String(u || "").toLowerCase();
  if (s.includes("amazon.com.au")) {
    return { tag: "AMAZONAU", store: "Amazon AU", hashtag: "#AmazonAU" };
  }
  if (s.includes("jbhifi.com.au")) {
    return { tag: "JBHIFI", store: "JB Hi-Fi", hashtag: "#JBHiFi" };
  }
  if (s.includes("coles.com.au")) {
    return { tag: "COLES", store: "Coles", hashtag: "#Coles" };
  }
  if (s.includes("woolworths.com.au")) {
    return { tag: "WOOLWORTHS", store: "Woolworths", hashtag: "#Woolworths" };
  }
  if (s.includes("bigw.com.au")) {
    return { tag: "BIGW", store: "BIG W", hashtag: "#BigW" };
  }
  if (s.includes("chemistwarehouse.com.au")) {
    return {
      tag: "CHEMISTWAREHOUSE",
      store: "Chemist Warehouse",
      hashtag: "#ChemistWarehouse"
    };
  }

  // additional local marketplaces
  if (s.includes("catch.com.au")) return { tag: "CATCH", store: "Catch", hashtag: "#Catch" };
  if (s.includes("kogan.com")) return { tag: "KOGAN", store: "Kogan", hashtag: "#Kogan" };
  if (s.includes("mydeal.com.au")) return { tag: "MYDEAL", store: "MyDeal", hashtag: "#MyDeal" };
  if (s.includes("ebay.com.au")) return { tag: "EBAYAU", store: "eBay AU", hashtag: "#eBayAU" };

  return { tag: "LOCAL", store: "Local Deals", hashtag: "#AustraliaDeals" };
}

async function fetchOzbargainFallback({ limit = 80 } = {}) {
  // RSS: stable + no API keys
  const rss = "https://www.ozbargain.com.au/deals/feed";
  const text = await fetch(rss).then((r) => r.text());

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(text))) {
    const block = m[1];
    const title =
      (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1] ||
      (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ||
      "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    const desc =
      (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || [])[1] ||
      (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] ||
      "";

    if (!title || !link) continue;

    const cleanTitle = normalizeSpace(title).replace(/&amp;/g, "&");
    const cleanLink = stripQuery(link);

    // Extract prices if present
    const prices = extractPricesFromText(`${cleanTitle} ${desc}`);
    const cleaned = sanitizePrices(prices);
    const pct = calcDiscountPct(cleaned.now, cleaned.was);

    // Extract % from title like "30% off"
    const pctMatch = cleanTitle.match(/\b(\d{1,2})%\s*off\b/i) || cleanTitle.match(/\bsave\s*(\d{1,2})%\b/i);
    const pctFromTitle = pctMatch ? Number(pctMatch[1]) : undefined;

    const cls = classifyByUrl(cleanLink);

    items.push({
      store: cls.store,
      storeTag: cls.tag,
      id: cleanLink,
      title: cleanTitle.slice(0, 140),
      now: cleaned.now,
      was: cleaned.was,
      discountPct: pct ?? pctFromTitle,
      imageUrl: "", // RSS images are inconsistent; post as text fallback
      url: cleanLink,
      _hashtag: cls.hashtag,
      extraLine: "(Fallback source) Check the page for full details/coupons."
    });

    if (items.length >= limit) break;
  }

  return items;
}

function pickDealsWithFairness(deals, storeOrder) {
  // Sort first by score
  const sorted = [...deals].sort((a, b) => scoreDeal(b) - scoreDeal(a));

  const perStoreCount = new Map();
  const out = [];

  // Pass 1: try to pick at least 1 per store (if available)
  for (const tag of storeOrder) {
    const first = sorted.find((d) => (d.storeTag || "") === tag);
    if (!first) continue;
    if (out.length >= MAX_TOTAL) break;
    out.push(first);
    perStoreCount.set(tag, 1);
  }

  // Pass 2: fill by score with per-store cap
  for (const d of sorted) {
    if (out.length >= MAX_TOTAL) break;
    if (out.some((x) => x.id === d.id)) continue;

    const k = d.storeTag || "UNKNOWN";
    const c = perStoreCount.get(k) || 0;
    if (c >= MAX_PER_STORE) continue;
    perStoreCount.set(k, c + 1);
    out.push(d);
  }

  return out;
}

// ---------------- main ----------------

const state = loadState(POSTED_PATH);
pruneOld(state, DAYS_TTL);

const storeFetchers = [
  { tag: "AMAZONAU", name: "Amazon AU", hashtag: "#AmazonAU", fn: fetchAmazon },
  { tag: "WOOLWORTHS", name: "Woolworths", hashtag: "#Woolworths", fn: fetchWoolworths },
  { tag: "COLES", name: "Coles", hashtag: "#Coles", fn: fetchColes },
  { tag: "BIGW", name: "BIG W", hashtag: "#BigW", fn: fetchBigW },
  {
    tag: "CHEMISTWAREHOUSE",
    name: "Chemist Warehouse",
    hashtag: "#ChemistWarehouse",
    fn: fetchChemistWarehouse
  },
  { tag: "JBHIFI", name: "JB Hi-Fi", hashtag: "#JBHiFi", fn: fetchJBHiFi },
  { tag: "CATCH", name: "Catch", hashtag: "#CatchAU", fn: fetchCatch },
  { tag: "KOGAN", name: "Kogan", hashtag: "#KoganAU", fn: fetchKogan },
  { tag: "MYDEAL", name: "MyDeal", hashtag: "#MyDealAU", fn: fetchMyDeal },
  { tag: "OFFICEWORKS", name: "Officeworks", hashtag: "#Officeworks", fn: fetchOfficeworks },
  { tag: "OZBARGAIN", name: "Local Deals", hashtag: "#Ozbargain", fn: fetchOzBargain }
];

// Fetch in sequence (stable on GitHub Actions)
const all = [];
for (const s of storeFetchers) {
  try {
    const deals = await s.fn({ limit: Math.max(15, MAX_PER_STORE * 6) });
    for (const d of deals) {
      const cleaned = sanitizePrices({ now: d.now, was: d.was });
      const pct = calcDiscountPct(cleaned.now, cleaned.was);
      all.push({
        ...d,
        storeTag: s.tag,
        store: d.store || s.name,
        _hashtag: s.hashtag,
        url: stripQuery(d.url || ""),
        now: cleaned.now,
        was: cleaned.was,
        discountPct: pct ?? d.discountPct
      });
    }
    console.log(`Fetched ${s.tag}: ${deals.length}`);
  } catch (e) {
    console.log(`⚠️ Fetch failed ${s.tag}: ${String(e)}`);
  }
}

// Base filter (allow empty price for fallbacks; store scrapers usually provide now)
let base = all.filter((d) => d.title && d.url && !hasPosted(state, d));

// If stores are dry, inject RSS fallback (classified to store tags)
if (FALLBACK_MODE && base.length < MIN_DAILY) {
  try {
    const rssDeals = await fetchOzbargainFallback({ limit: 120 });
    for (const d of rssDeals) {
      // allow empty now for fallback, but still avoid duplicates
      if (!hasPosted(state, d)) base.push(d);
    }
    console.log(`Fallback injected (Ozbargain). total now: ${base.length}`);
  } catch (e) {
    console.log(`⚠️ Ozbargain fallback failed: ${String(e)}`);
  }
}

// Hard fallback list (never fail)
if (FALLBACK_MODE && base.length < MIN_DAILY) {
  const local = await fetchLocalFallback();
  for (const d of local) {
    const cls = classifyByUrl(d.url);
    base.push({
      ...d,
      store: d.store || cls.store,
      storeTag: cls.tag,
      _hashtag: cls.hashtag,
      id: stripQuery(d.url)
    });
  }
  console.log(`Fallback injected (static). total now: ${base.length}`);
}

// Selection strategy:
// 1) strict picks first
// 2) if not enough, fill with best available
const storeOrder = storeFetchers.map((s) => s.tag);

let selected = pickDealsWithFairness(base.filter(strictOk), storeOrder);
if (FALLBACK_MODE && selected.length < MIN_DAILY) {
  selected = pickDealsWithFairness(base, storeOrder);
}

// If still not enough (rare), just take what we have
selected = selected.slice(0, MAX_TOTAL);

console.log(`Selected to post: ${selected.length}`);

let posted = 0;
for (const d of selected) {
  const rankTag = posted < Math.min(4, MAX_TOTAL) ? "#TopDeals" : "#GoodDeal";
  const dealUrl = affiliateUrl(d.storeTag || "", d.url || "");

  const caption = formatDealCard({
    title: d.title,
    store: d.store,
    now: d.now || "",
    was: d.was || "",
    discountPct: d.discountPct,
    extraLine: d.extraLine || "",
    endsText: "Limited time (check deal page)",
    hashtags: [rankTag, d._hashtag || "", "#Today", "#AustraliaDeals"].filter(Boolean)
  });

  try {
    if (d.imageUrl) {
      await sendPhotoPost({
        imageUrl: d.imageUrl,
        caption,
        buttons: [
          [{ text: "👉 Get Deal", url: dealUrl }],
          [{ text: "📌 Browse More", url: browseMoreUrl(d.storeTag || "") }]
        ]
      });
    } else {
      throw new Error("No imageUrl");
    }
  } catch (e) {
    console.log(`⚠️ Photo skipped/fail -> text fallback. reason=${String(e)}`);
    await sendTextPost({
      text: `${caption}\n\n👉 Get Deal: ${dealUrl}\n📌 Browse More: ${browseMoreUrl(d.storeTag || "")}`,
      disablePreview: false
    });
  }

  rememberPosted(state, d);
  posted++;
  await sleep(RATE_LIMIT_MS);
}

saveState(POSTED_PATH, state);
console.log(`✅ Done. Posted ${posted}/${MAX_TOTAL} deals.`);

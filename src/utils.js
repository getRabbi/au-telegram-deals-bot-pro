export function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function stripQuery(u) {
  try {
    const url = new URL(u);
    url.search = "";
    return url.toString();
  } catch {
    return String(u || "");
  }
}

export function normalizeSpace(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function normalizePriceText(s) {
  // keep first $xx.xx
  const m = String(s || "").match(/\$\s*\d+(?:\.\d{2})?/);
  return m ? m[0].replace(/\s+/g, "") : "";
}

export function priceToNumber(priceText) {
  const m = String(priceText || "").match(/\d+(?:\.\d{2})?/);
  return m ? Number(m[0]) : 0;
}

export function calcDiscountPct(now, was) {
  const n = priceToNumber(now);
  const w = priceToNumber(was);
  if (!n || !w || w <= n) return undefined;
  return Math.round(((w - n) / w) * 100);
}

export function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Fix common pricing mistakes:
 * - if now/was swapped (now > was), swap them
 * - if one is missing, keep the other
 */
export function sanitizePrices({ now, was }) {
  const n = priceToNumber(now);
  const w = priceToNumber(was);

  if (!n && !w) return { now: "", was: "" };
  if (n && !w) return { now: normalizePriceText(now), was: "" };
  if (!n && w) return { now: normalizePriceText(was), was: "" };

  // if now is bigger than was => swapped
  if (n > w) {
    return { now: normalizePriceText(was), was: normalizePriceText(now) };
  }

  return { now: normalizePriceText(now), was: normalizePriceText(was) };
}

/**
 * Score deal for ranking:
 * - discountPct matters most
 * - higher price gives slight boost for "high ticket preference"
 */
export function scoreDeal(d) {
  const pct = Number.isFinite(d.discountPct) ? d.discountPct : 0;
  const now = priceToNumber(d.now);
  return pct * 10 + Math.min(now, 2000) / 100;
}

// ---------------- Image helpers (avoid blur) ----------------

// Common thumbnail patterns: _32x32, -32x32, 32x32.jpg, ?width=32, etc.
export function isLowResImageUrl(u) {
  const s = String(u || "");
  if (!s) return true;
  if (/\bwidth=(?:\d{1,2}|1\d{2})\b/i.test(s)) return true;
  if (/\b(?:w|h)=(?:\d{1,2}|1\d{2})\b/i.test(s)) return true;
  if (/(?:_|-)(?:\d{2}|\d{2,3})x(?:\d{2}|\d{2,3})(?=\.)/i.test(s)) return true;
  if (/\b(?:\d{2}|\d{2,3})x(?:\d{2}|\d{2,3})\.(?:jpg|jpeg|png|webp)\b/i.test(s)) return true;
  return false;
}

// Try to upgrade known CDN thumbnail URLs to a larger size.
export function ensureHighResImageUrl(u, target = 1200) {
  const s = String(u || "");
  if (!s) return "";

  // Shopify CDN: ..._32x32.jpg -> ..._1200x1200.jpg
  let out = s.replace(/([_-])(\d{2,3})x(\d{2,3})(?=\.)/i, `$1${target}x${target}`);

  // Some CDNs use .../32x32.jpg
  out = out.replace(/\/(\d{2,3})x(\d{2,3})(?=\.)/i, `/${target}x${target}`);

  // Query-based resizing
  try {
    const url = new URL(out);
    if (url.searchParams.has("width")) url.searchParams.set("width", String(target));
    if (url.searchParams.has("w")) url.searchParams.set("w", String(target));
    if (url.searchParams.has("h")) url.searchParams.set("h", String(target));
    out = url.toString();
  } catch {
    // ignore
  }

  return out;
}

// ---------------- Price parsing helpers (fallback) ----------------

export function extractPricesFromText(text) {
  const t = String(text || "");
  const prices = t.match(/\$\s*\d+(?:\.\d{2})?/g) || [];
  const cleaned = prices.map((p) => p.replace(/\s+/g, ""));
  return {
    now: cleaned[0] || "",
    was: cleaned[1] || "",
  };
}


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

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
  // Ensure it's a valid absolute URL string
  try {
    const url = new URL(u);
    return url.toString();
  } catch {
    return "";
  }
}

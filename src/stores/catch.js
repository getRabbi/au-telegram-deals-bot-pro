import { normalizeSpace, stripQuery } from "../utils.js";

export async function fetchCatch({ limit = 10 } = {}) {
  const url = "https://www.catch.com.au/deals";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  const items = [];
  const re = /href="(\/product\/[^"]+)"[\s\S]*?data-testid="product-title">([^<]+)<[\s\S]*?\$([\d.]+)/g;
  let m;
  while ((m = re.exec(html)) && items.length < limit) {
    items.push({
      store: "Catch",
      title: normalizeSpace(m[2]),
      now: `$${m[3]}`,
      was: "",
      discountPct: undefined,
      imageUrl: "https://www.catch.com.au/favicon.ico",
      url: stripQuery(`https://www.catch.com.au${m[1]}`),
    });
  }
  return items;
}

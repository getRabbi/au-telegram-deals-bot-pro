import { normalizeSpace, stripQuery } from "../utils.js";

export async function fetchOfficeworks({ limit = 6 } = {}) {
  const url = "https://www.officeworks.com.au/shop/officeworks/c/deals";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  const items = [];
  const re = /href="(\/shop\/officeworks\/p\/[^"]+)"[\s\S]*?aria-label="([^"]+)"[\s\S]*?\$([\d.]+)/g;
  let m;
  while ((m = re.exec(html)) && items.length < limit) {
    items.push({
      store: "Officeworks",
      title: normalizeSpace(m[2]),
      now: `$${m[3]}`,
      was: "",
      discountPct: undefined,
      imageUrl: "https://www.officeworks.com.au/favicon.ico",
      url: stripQuery(`https://www.officeworks.com.au${m[1]}`),
    });
  }
  return items;
}

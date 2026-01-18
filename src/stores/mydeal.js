import { normalizeSpace, stripQuery } from "../utils.js";

export async function fetchMyDeal({ limit = 10 } = {}) {
  const url = "https://www.mydeal.com.au/deals";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  const items = [];
  const re = /href="(\/[^"]+)"[\s\S]*?class="product-name">([^<]+)<[\s\S]*?\$([\d.]+)/g;
  let m;
  while ((m = re.exec(html)) && items.length < limit) {
    items.push({
      store: "MyDeal",
      title: normalizeSpace(m[2]),
      now: `$${m[3]}`,
      was: "",
      discountPct: undefined,
      imageUrl: "https://www.mydeal.com.au/favicon.ico",
      url: stripQuery(`https://www.mydeal.com.au${m[1]}`),
    });
  }
  return items;
}

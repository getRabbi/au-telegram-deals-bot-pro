import { normalizeSpace, stripQuery } from "../utils.js";

export async function fetchOzBargain({ limit = 10 } = {}) {
  const rss = "https://www.ozbargain.com.au/deals/feed";
  const res = await fetch(rss);
  const xml = await res.text();

  const items = [];
  const re = /<item>[\s\S]*?<title>(<!\[CDATA\[)?([^<]+)(\]\]>)?<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    items.push({
      store: "Local Deals",
      title: normalizeSpace(m[2]),
      now: "",
      was: "",
      discountPct: undefined,
      imageUrl: "",
      url: stripQuery(m[4]),
    });
  }
  return items;
}

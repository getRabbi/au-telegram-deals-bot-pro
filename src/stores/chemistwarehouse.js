import { withBrowser } from "../browser.js";
import { normalizeSpace, normalizePriceText, calcDiscountPct, stripQuery } from "../utils.js";

/**
 * Chemist Warehouse clearance:
 * https://www.chemistwarehouse.com.au/shop-online/3240/clearance
 */
export async function fetchChemistWarehouse({ limit = 6 } = {}) {
  const url = "https://www.chemistwarehouse.com.au/shop-online/3240/clearance";

  return withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6500);

    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(1200);
    }

    const items = await page.evaluate(() => {
      const out = [];
      // Product cards often contain anchors with /product/ or numeric IDs; we use broad
      const cards = Array.from(document.querySelectorAll("a[href]"));
      for (const a of cards) {
        const href = a.getAttribute("href") || "";
        const isProd = /\/buy\//i.test(href) || /\/product\//i.test(href) || /\/\d+\//.test(href);
        if (!isProd) continue;

        const link = href.startsWith("http") ? href : `https://www.chemistwarehouse.com.au${href}`;
        const img = a.querySelector("img") || a.closest("div")?.querySelector("img");
        const imgSrc = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
        const title = (img?.getAttribute("alt") || "").trim() || (a.textContent || "").trim();

        const container = a.closest("article") || a.closest("div") || a;
        const txt = container?.textContent || "";

        out.push({ link, title, imgSrc, txt });
        if (out.length >= 200) break;
      }
      return out;
    });

    const deals = [];
    const seen = new Set();

    for (const it of items) {
      if (deals.length >= limit) break;

      const link = stripQuery(it.link || "");
      if (!link || seen.has(link)) continue;
      seen.add(link);

      const title = normalizeSpace(it.title).slice(0, 140);
      if (!title || title.length < 4) continue;

      const prices = String(it.txt || "").match(/\$\s*\d+(?:\.\d{2})?/g) || [];
      const now = prices[0] ? prices[0].replace(/\s+/g, "") : normalizePriceText(it.txt);
      const was = prices[1] ? prices[1].replace(/\s+/g, "") : "";
      const discountPct = calcDiscountPct(now, was);

      if (!now) continue;

      const img = (it.imgSrc || "").includes(".svg") || (it.imgSrc || "").startsWith("data:") ? "" : it.imgSrc;

      deals.push({
        store: "Chemist Warehouse",
        storeTag: "CHEMISTWAREHOUSE",
        id: link,
        title,
        now,
        was,
        discountPct,
        imageUrl: img || "https://picsum.photos/800/800.jpg",
        url: link
      });
    }

    return deals;
  });
}

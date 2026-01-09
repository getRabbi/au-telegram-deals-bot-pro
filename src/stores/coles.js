import { withBrowser } from "../browser.js";
import { normalizeSpace, normalizePriceText, calcDiscountPct, stripQuery } from "../utils.js";

/**
 * Coles:
 * Primary sources:
 * - Catalogues landing: https://www.coles.com.au/catalogues
 * - Offers: https://www.coles.com.au/offers/big-deals
 *
 * We scrape offer tiles when present.
 */
export async function fetchColes({ limit = 6 } = {}) {
  const url = "https://www.coles.com.au/offers/big-deals";

  return withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(1200);
    }

    const items = await page.evaluate(() => {
      const out = [];
      // Broad selectors: cards/tiles with links
      const cards = Array.from(document.querySelectorAll("a[href]"));
      for (const a of cards) {
        const href = a.getAttribute("href") || "";
        // prefer product links if present
        const isProduct = href.includes("/product/") || href.includes("/shop/product/");
        if (!isProduct && !href.includes("/offers/")) continue;

        const link = href.startsWith("http") ? href : `https://www.coles.com.au${href}`;

        const img =
          a.querySelector("img") ||
          a.closest("div")?.querySelector("img") ||
          null;

        const imgSrc = img?.getAttribute("src") || img?.getAttribute("data-src") || "";

        const title =
          (img?.getAttribute("alt") || "").trim() ||
          (a.textContent || "").trim();

        // price text might be in nearby elements
        const container = a.closest("article") || a.closest("div") || a;
        const txt = container?.textContent || "";

        out.push({ link, title, imgSrc, txt });
        if (out.length >= 120) break;
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

      // Try to extract prices from surrounding text
      const now = normalizePriceText(it.txt);
      // Was price is harder; if two prices exist, we'll approximate by taking first two matches
      const prices = String(it.txt || "").match(/\$\s*\d+(?:\.\d{2})?/g) || [];
      const now2 = prices[0] ? prices[0].replace(/\s+/g, "") : now;
      const was2 = prices[1] ? prices[1].replace(/\s+/g, "") : "";

      const discountPct = calcDiscountPct(now2, was2);
      const img = (it.imgSrc || "").includes(".svg") || (it.imgSrc || "").startsWith("data:") ? "" : it.imgSrc;

      // Keep quality: require now price
      if (!now2) continue;

      deals.push({
        store: "Coles",
        storeTag: "COLES",
        id: link,
        title,
        now: now2,
        was: was2,
        discountPct,
        imageUrl: img || "https://picsum.photos/800/800.jpg",
        url: link
      });
    }

    return deals;
  });
}

import { withBrowser } from "../browser.js";
import { normalizeSpace, normalizePriceText, calcDiscountPct, stripQuery } from "../utils.js";

/**
 * Woolworths specials page.
 * Tries to parse product tiles + JSON-LD / embedded data defensively.
 */
export async function fetchWoolworths({ limit = 6 } = {}) {
  const url = "https://www.woolworths.com.au/shop/browse/specials";

  return withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);

    // Scroll to load a few products
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(1200);
    }

    const items = await page.evaluate(() => {
      const out = [];
      // Woolies uses product tiles; attempt broad selection
      const tiles = Array.from(document.querySelectorAll('[data-testid*="product-tile"], article, li'));
      for (const t of tiles) {
        const a = t.querySelector('a[href*="/shop/productdetails/"]') || t.querySelector('a[href*="/shop/productdetails"]');
        if (!a) continue;
        const href = a.getAttribute("href") || "";
        const link = href.startsWith("http") ? href : `https://www.woolworths.com.au${href}`;

        const img = t.querySelector("img");
        const imgSrc = img?.getAttribute("src") || img?.getAttribute("data-src") || "";

        const title =
          (t.querySelector('[data-testid="product-tile-title"]')?.textContent || "").trim() ||
          img?.getAttribute("alt")?.trim() ||
          (t.textContent || "").trim().slice(0, 120);

        // price: try common patterns
        const now =
          (t.querySelector('[data-testid="product-price"]')?.textContent || "").trim() ||
          (t.querySelector('span[class*="price"]')?.textContent || "").trim();

        // was price sometimes appears as "was" text or strike
        const was =
          (t.querySelector('span[class*="was"]')?.textContent || "").trim() ||
          (t.querySelector('span[class*="strike"]')?.textContent || "").trim();

        out.push({ link, title, imgSrc, now, was });
        if (out.length >= 60) break;
      }
      return out;
    });

    const seen = new Set();
    const deals = [];
    for (const it of items) {
      if (deals.length >= limit) break;

      const link = stripQuery(it.link || "");
      if (!link || seen.has(link)) continue;
      seen.add(link);

      const title = normalizeSpace(it.title).slice(0, 140);
      const now = normalizePriceText(it.now);
      const was = normalizePriceText(it.was);
      const discountPct = calcDiscountPct(now, was);

      const img = (it.imgSrc || "").includes(".svg") || (it.imgSrc || "").startsWith("data:") ? "" : it.imgSrc;

      // Keep quality: must have title and now price
      if (!title || !now) continue;

      deals.push({
        store: "Woolworths",
        storeTag: "WOOLWORTHS",
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

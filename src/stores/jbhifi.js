import { withBrowser } from "../browser.js";
import { normalizeSpace, normalizePriceText, calcDiscountPct, stripQuery, ensureHighResImageUrl } from "../utils.js";

/**
 * JB Hi-Fi weekly deals:
 * https://www.jbhifi.com.au/collections/this-weeks-hottest-deals
 */
export async function fetchJBHiFi({ limit = 6 } = {}) {
  const url = "https://www.jbhifi.com.au/collections/this-weeks-hottest-deals";

  return withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);

    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(1200);
    }

    const items = await page.evaluate(() => {
      const out = [];
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        // product pages often contain /products/ on Shopify-like structure
        const isProd = href.includes("/products/");
        if (!isProd) continue;

        const link = href.startsWith("http") ? href : `https://www.jbhifi.com.au${href}`;

        const img = a.querySelector("img") || a.closest("div")?.querySelector("img");
        const imgSrc = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
        const title = (img?.getAttribute("alt") || "").trim() || (a.textContent || "").trim();

        const container = a.closest("article") || a.closest("div") || a;
        const txt = container?.textContent || "";

        // Extract handle for Shopify JSON enrichment
        const m = link.match(/\/products\/([^/?#]+)/);
        const handle = m ? m[1] : "";

        out.push({ link, handle, title, imgSrc, txt });
        if (out.length >= 150) break;
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

      // Prefer Shopify JSON (accurate price + compare_at_price + high-res image)
      const enriched = await enrichShopifyProduct(it.handle);

      const prices = String(it.txt || "").match(/\$\s*\d+(?:\.\d{2})?/g) || [];
      const fallbackNow = prices[0] ? prices[0].replace(/\s+/g, "") : normalizePriceText(it.txt);
      const fallbackWas = prices[1] ? prices[1].replace(/\s+/g, "") : "";

      const now = normalizePriceText(enriched.now || fallbackNow);
      const was = normalizePriceText(enriched.was || fallbackWas);
      const discountPct = calcDiscountPct(now, was);

      if (!now) continue;

      const imgRaw = enriched.imageUrl || it.imgSrc || "";
      const img = (imgRaw.includes(".svg") || imgRaw.startsWith("data:")) ? "" : ensureHighResImageUrl(imgRaw, 1200);

      deals.push({
        store: "JB Hi-Fi",
        storeTag: "JBHIFI",
        id: link,
        title,
        now,
        was,
        discountPct,
        imageUrl: img || "https://picsum.photos/1200/1200.jpg",
        url: link
      });
    }

    return deals;
  });
}

async function enrichShopifyProduct(handle) {
  try {
    if (!handle) return { now: "", was: "", imageUrl: "" };

    const url = `https://www.jbhifi.com.au/products/${handle}.js`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept-Language": "en-AU,en;q=0.9",
      }
    });
    if (!res.ok) return { now: "", was: "", imageUrl: "" };
    const p = await res.json();
    const v = (p.variants && p.variants[0]) ? p.variants[0] : null;

    // Shopify .js uses cents
    const centsNow = Number(v?.price || 0);
    const centsWas = Number(v?.compare_at_price || 0);

    const now = centsNow ? `$${(centsNow / 100).toFixed(2)}` : "";
    const was = (centsWas && centsWas > centsNow) ? `$${(centsWas / 100).toFixed(2)}` : "";

    const imageUrl = p?.featured_image || (p?.images && p.images[0]) || "";
    return { now, was, imageUrl };
  } catch {
    return { now: "", was: "", imageUrl: "" };
  }
}

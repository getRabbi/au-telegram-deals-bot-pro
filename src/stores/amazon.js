import { withBrowser } from "../browser.js";
import { normalizeSpace, normalizePriceText, calcDiscountPct, stripQuery } from "../utils.js";

/**
 * Amazon AU: discover from Goldbox then enrich each product page.
 */
export async function fetchAmazon({ limit = 6 } = {}) {
  const dealsHub = "https://www.amazon.com.au/gp/goldbox";

  return withBrowser(async (page) => {
    await page.goto(dealsHub, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(1200);
    }

    const hrefs = await page.evaluate(() => {
      const out = [];
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (href.includes("/dp/") || href.includes("/gp/goldbox/deal/")) out.push(href);
        if (out.length >= 250) break;
      }
      return out;
    });

    const seen = new Set();
    const urls = [];
    for (const h of hrefs) {
      const abs = toAbs(h);
      if (!abs) continue;
      const dp = normalizeDp(abs);
      const clean = stripQuery(dp);
      if (seen.has(clean)) continue;
      seen.add(clean);
      urls.push(clean);
      if (urls.length >= 60) break;
    }

    const deals = [];
    for (const url of urls) {
      if (deals.length >= limit) break;

      const info = await enrichAmazon(page, url);
      if (!info.title || !info.imageUrl || !info.now) continue;

      deals.push({
        store: "Amazon AU",
        storeTag: "AMAZONAU",
        id: info.asin || url,
        asin: info.asin,
        title: info.title,
        now: info.now,
        was: info.was,
        discountPct: info.discountPct,
        imageUrl: info.imageUrl,
        url
      });

      await page.waitForTimeout(700);
    }

    return deals;
  });
}

async function enrichAmazon(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);

    const data = await page.evaluate(() => {
      const t = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
      const a = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || "";

      const title =
        t("#productTitle") ||
        t("h1#title span") ||
        document.title?.replace(/\s*-\s*Amazon.*$/i, "").trim() ||
        "";

      const now =
        t("#corePriceDisplay_desktop_feature_div span.a-price span.a-offscreen") ||
        t("#corePriceDisplay_mobile_feature_div span.a-price span.a-offscreen") ||
        t("span.a-price span.a-offscreen") ||
        "";

      const was =
        t("#corePriceDisplay_desktop_feature_div span.a-price.a-text-price span.a-offscreen") ||
        t("#corePriceDisplay_mobile_feature_div span.a-price.a-text-price span.a-offscreen") ||
        t("span.a-price.a-text-price span.a-offscreen") ||
        "";

      const img =
        a("#imgTagWrapperId img", "data-old-hires") ||
        a("#landingImage", "data-old-hires") ||
        a("#landingImage", "src") ||
        a("#imgTagWrapperId img", "src") ||
        a('meta[property="og:image"]', "content") ||
        "";

      const m = location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
      const asin = m ? m[1] : "";

      return { title, now, was, img, asin };
    });

    const title = normalizeSpace(data.title).slice(0, 140);
    const now = normalizePriceText(data.now);
    const was = normalizePriceText(data.was);
    const discountPct = calcDiscountPct(now, was);

    const img = (data.img || "").includes(".svg") || (data.img || "").startsWith("data:")
      ? ""
      : data.img;

    return {
      asin: data.asin || "",
      title,
      now,
      was,
      discountPct,
      imageUrl: img || "https://picsum.photos/800/800.jpg"
    };
  } catch {
    return { asin: "", title: "", now: "", was: "", discountPct: undefined, imageUrl: "" };
  }
}

function toAbs(href) {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://www.amazon.com.au${href}`;
  return "";
}

function normalizeDp(u) {
  try {
    const url = new URL(u);
    const m = url.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    if (m) return `https://www.amazon.com.au/dp/${m[1]}`;
    return u;
  } catch {
    return u;
  }
}

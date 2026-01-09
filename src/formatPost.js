import { escHtml } from "./utils.js";

export function formatDealCard(deal) {
  const lines = [
    "🛒 <b>TODAY’S DEAL 🇦🇺</b>",
    "",
    `<b>${escHtml(deal.title)}</b>`,
    `🏪 ${escHtml(deal.store)}`
  ];

  if (deal.was && deal.now) {
    lines.push(`💲 Was: ${escHtml(deal.was)} → <b>Now: ${escHtml(deal.now)}</b>`);
  } else if (deal.now) {
    lines.push(`💲 <b>Now: ${escHtml(deal.now)}</b>`);
  }

  if (typeof deal.discountPct === "number" && Number.isFinite(deal.discountPct)) {
    lines.push(`🔻 Save: ${deal.discountPct}%`);
  }

  if (deal.extraLine) {
    lines.push(escHtml(deal.extraLine));
  }

  if (deal.endsText) {
    lines.push("");
    lines.push(`⏳ ${escHtml(deal.endsText)}`);
  }

  if (deal.hashtags?.length) {
    lines.push("");
    lines.push(deal.hashtags.join(" "));
  }

  return lines.join("\n").trim();
}

export function formatDeal(deal){
  return formatDealCard(deal);
}
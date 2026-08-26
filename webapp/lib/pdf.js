/**
 * lib/pdf.js — generates Quote and Invoice PDFs with pdf-lib.
 * Shared layout engine so quotes and invoices look consistent; only the
 * labels, numbering prefix, and expiry/due-date framing differ.
 *
 * Line items can be either an exact amount ({ amount }) or an estimate
 * range ({ amountLow, amountHigh }). Quotes generated from the public
 * "Get a PDF Quote" flow use ranges (since real pricing depends on scope
 * that hasn't been agreed yet); invoices created in the admin panel for
 * completed work use an exact amount. The total automatically becomes an
 * "ESTIMATED TOTAL" range if any line item is a range, or a plain "TOTAL"
 * if every line item is exact.
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const LOGO_PATH = path.join(__dirname, "..", "public", "assets", "logo_full_dark.png");
const WATERMARK_PATH = path.join(__dirname, "..", "public", "assets", "favicon.png");

const NAVY = rgb(0.039, 0.122, 0.239); // #0A1F3D
const SKY = rgb(0.11, 0.463, 0.616); // darker sky for print legibility
const AMBER = rgb(0.8, 0.32, 0.05);
const SLATE = rgb(0.357, 0.42, 0.51);
const LIGHT_LINE = rgb(0.863, 0.898, 0.941);
const INK = rgb(0.04, 0.07, 0.13);
const PAPER_TINT = rgb(0.957, 0.969, 0.984);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const WATERMARK_OPACITY = 0.055; // subtle — visible but never competes with text

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return "";
  return "KSh " + Number(n).toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

/** Formats either a single exact amount or a low-high estimate range. */
function fmtAmount(item) {
  const hasRange = item.amountLow != null && item.amountHigh != null;
  if (hasRange) {
    const low = Number(item.amountLow) || 0;
    const high = Number(item.amountHigh) || 0;
    if (low === high) return fmtMoney(low);
    return `${fmtMoney(low)} - ${fmtMoney(high)}`;
  }
  return fmtMoney(item.amount);
}

function itemIsRange(item) {
  return item.amountLow != null && item.amountHigh != null && Number(item.amountLow) !== Number(item.amountHigh);
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Builds a Quote or Invoice PDF.
 * @param {Object} opts
 * @param {"QUOTE"|"INVOICE"} opts.type
 * @param {string} opts.number - e.g. "Q-20260824-0007"
 * @param {string} opts.generatedAt - ISO timestamp
 * @param {string} opts.expiresOrDueAt - ISO timestamp (valid-until for quotes, due date for invoices)
 * @param {Object} opts.client - { name, phone, email, county, address }
 * @param {Array}  opts.items - [{ description, detail, amount }] or [{ description, detail, amountLow, amountHigh }]
 * @param {Object} opts.settings - site settings (payment details, contact info)
 * @param {string} [opts.notes] - optional extra note/terms line
 * @returns {Promise<{buffer: Buffer, totalLow: number, totalHigh: number, isEstimate: boolean}>}
 */
async function generateDocumentPDF(opts) {
  const { type, number, generatedAt, expiresOrDueAt, client, items, settings, notes } = opts;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`TheHubVisionary ${type === "QUOTE" ? "Quote" : "Invoice"} ${number}`);
  pdfDoc.setProducer("TheHubVisionary");
  pdfDoc.setCreationDate(new Date(generatedAt));

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Embed the watermark image once, reused on every page.
  let watermarkImage = null;
  try {
    watermarkImage = await pdfDoc.embedPng(fs.readFileSync(WATERMARK_PATH));
  } catch (e) {
    // no watermark asset available — documents still generate fine without it
  }

  function drawWatermark(targetPage) {
    if (!watermarkImage) return;
    const size = PAGE_W * 0.62; // large, but margins keep it from touching edges
    const scale = Math.min(size / watermarkImage.width, size / watermarkImage.height);
    const w = watermarkImage.width * scale;
    const h = watermarkImage.height * scale;
    targetPage.drawImage(watermarkImage, {
      x: (PAGE_W - w) / 2,
      y: (PAGE_H - h) / 2,
      width: w,
      height: h,
      opacity: WATERMARK_OPACITY,
    });
  }

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawWatermark(page);
  let y = PAGE_H - MARGIN;

  // ---------- header: logo + document type/number ----------
  try {
    const logoBytes = fs.readFileSync(LOGO_PATH);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoW = 150;
    const logoH = (logoImage.height / logoImage.width) * logoW;
    page.drawImage(logoImage, { x: MARGIN, y: y - logoH + 6, width: logoW, height: logoH });
  } catch (e) {
    // logo missing — fall back to text wordmark so the PDF still generates
    page.drawText("TheHubVisionary", { x: MARGIN, y: y - 16, size: 18, font: fontBold, color: NAVY });
  }

  const docLabel = type === "QUOTE" ? "QUOTE" : "INVOICE";
  const labelWidth = fontBold.widthOfTextAtSize(docLabel, 22);
  page.drawText(docLabel, { x: PAGE_W - MARGIN - labelWidth, y: y - 14, size: 22, font: fontBold, color: NAVY });
  const numWidth = font.widthOfTextAtSize(number, 11);
  page.drawText(number, { x: PAGE_W - MARGIN - numWidth, y: y - 32, size: 11, font, color: SLATE });

  y -= 62;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: LIGHT_LINE });
  y -= 26;

  // ---------- two-column info block ----------
  const colGap = 24;
  const colWidth = (PAGE_W - MARGIN * 2 - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + colGap;
  let leftY = y;
  let rightY = y;

  const label = (text, x, yy) => {
    page.drawText(text.toUpperCase(), { x, y: yy, size: 9, font: fontBold, color: SLATE });
    return yy - 14;
  };
  const value = (text, x, yy, opts2 = {}) => {
    const size = opts2.size || 11;
    const lines = wrapText(text, font, size, colWidth);
    lines.forEach((line) => {
      page.drawText(line, { x, y: yy, size, font, color: INK });
      yy -= size + 5;
    });
    return yy;
  };

  leftY = label(type === "QUOTE" ? "Quote For" : "Bill To", leftX, leftY);
  leftY = value(client.name || "-", leftX, leftY, { size: 12 });
  if (client.phone) leftY = value(client.phone, leftX, leftY);
  if (client.email) leftY = value(client.email, leftX, leftY);
  if (client.county || client.address) {
    const locLine = [client.address, client.county].filter(Boolean).join(", ");
    leftY = value(locLine, leftX, leftY);
  }

  rightY = label("Details", rightX, rightY);
  rightY = value(`Generated: ${fmtDateTime(generatedAt)}`, rightX, rightY);
  rightY = value(
    `${type === "QUOTE" ? "Valid until" : "Due date"}: ${fmtDate(expiresOrDueAt)}`,
    rightX,
    rightY,
    { size: 11 }
  );
  rightY = value("Prepared by: TheHubVisionary", rightX, rightY);

  y = Math.min(leftY, rightY) - 10;

  // ---------- estimate banner (quotes only) ----------
  const anyRange = type === "QUOTE" && items.some(itemIsRange);
  if (anyRange) {
    if (y - 40 < 60) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawWatermark(page);
      y = PAGE_H - MARGIN;
    }
    y -= 4;
    const bannerH = 26;
    page.drawRectangle({
      x: MARGIN,
      y: y - bannerH,
      width: PAGE_W - MARGIN * 2,
      height: bannerH,
      color: rgb(1, 0.965, 0.933),
      borderColor: rgb(1, 0.863, 0.761),
      borderWidth: 1,
    });
    page.drawText(
      "Prices below are estimates. Your final, confirmed figure follows once we've agreed the exact scope.",
      { x: MARGIN + 12, y: y - bannerH + 9, size: 9.5, font: fontOblique, color: AMBER }
    );
    y -= bannerH + 14;
  } else {
    y -= 6;
  }

  // ---------- line items table ----------
  const tableTop = y;
  const col1X = MARGIN;
  const col1W = 195;
  const col2X = col1X + col1W;
  const col2W = 155;
  const col3X = col2X + col2W;
  const col3W = PAGE_W - MARGIN - col3X;

  page.drawRectangle({ x: MARGIN, y: tableTop - 22, width: PAGE_W - MARGIN * 2, height: 22, color: NAVY });
  page.drawText("Description", { x: col1X + 8, y: tableTop - 16, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Detail", { x: col2X + 8, y: tableTop - 16, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  const amtHeaderText = anyRange ? "Estimate" : "Amount";
  const amtHeaderW = fontBold.widthOfTextAtSize(amtHeaderText, 10);
  page.drawText(amtHeaderText, { x: col3X + col3W - amtHeaderW - 8, y: tableTop - 16, size: 10, font: fontBold, color: rgb(1, 1, 1) });

  let rowY = tableTop - 22;
  let totalLow = 0;
  let totalHigh = 0;
  let stripe = false;

  const ensureSpace = (needed) => {
    if (rowY - needed < 60) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawWatermark(page);
      rowY = PAGE_H - MARGIN;
      stripe = false;
      return true;
    }
    return false;
  };

  /**
   * Plans how to render an amount cell so it NEVER overflows into the
   * Detail column, no matter how wide the number gets (six-figure
   * ranges, "KSh " prefixes, etc.): try smaller font sizes first, and
   * only if it still doesn't fit, split "X - Y" onto two lines.
   */
  function planAmountCell(text, maxWidth) {
    for (const size of [10, 9, 8.5]) {
      if (fontBold.widthOfTextAtSize(text, size) <= maxWidth) {
        return { lines: [text], size, lineHeight: size + 3 };
      }
    }
    if (text.includes(" - ")) {
      const idx = text.indexOf(" - ");
      const line1 = text.slice(0, idx) + " -";
      const line2 = text.slice(idx + 3);
      const size = fontBold.widthOfTextAtSize(line1, 9) <= maxWidth && fontBold.widthOfTextAtSize(line2, 9) <= maxWidth ? 9 : 8;
      return { lines: [line1, line2], size, lineHeight: size + 3 };
    }
    return { lines: [text], size: 8, lineHeight: 11 };
  }

  function drawAmountCell(plan, rightEdgeX, topY) {
    plan.lines.forEach((line, i) => {
      const w = fontBold.widthOfTextAtSize(line, plan.size);
      page.drawText(line, { x: rightEdgeX - w, y: topY - i * plan.lineHeight, size: plan.size, font: fontBold, color: NAVY });
    });
  }

  for (const item of items) {
    const descLines = wrapText(item.description, font, 10, col1W - 16);
    const detailLines = wrapText(item.detail || "", font, 9, col2W - 16);
    const amtText = fmtAmount(item);
    const amtPlan = planAmountCell(amtText, col3W - 16);
    const lineCount = Math.max(descLines.length, detailLines.length, amtPlan.lines.length, 1);
    const rowHeight = lineCount * 13 + 12;

    ensureSpace(rowHeight);

    if (stripe) {
      page.drawRectangle({ x: MARGIN, y: rowY - rowHeight, width: PAGE_W - MARGIN * 2, height: rowHeight, color: PAPER_TINT });
    }
    stripe = !stripe;

    let ty = rowY - 14;
    descLines.forEach((line) => {
      page.drawText(line, { x: col1X + 8, y: ty, size: 10, font, color: INK });
      ty -= 13;
    });
    ty = rowY - 14;
    detailLines.forEach((line) => {
      page.drawText(line, { x: col2X + 8, y: ty, size: 9, font, color: SLATE });
      ty -= 13;
    });

    if (item.amountLow != null && item.amountHigh != null) {
      totalLow += Number(item.amountLow) || 0;
      totalHigh += Number(item.amountHigh) || 0;
    } else {
      const amt = Number(item.amount) || 0;
      totalLow += amt;
      totalHigh += amt;
    }
    drawAmountCell(amtPlan, col3X + col3W - 8, rowY - 14);

    rowY -= rowHeight;
    page.drawLine({ start: { x: MARGIN, y: rowY }, end: { x: PAGE_W - MARGIN, y: rowY }, thickness: 0.5, color: LIGHT_LINE });
  }

  // ---------- total ----------
  ensureSpace(64);
  rowY -= 8;
  page.drawLine({ start: { x: col2X, y: rowY }, end: { x: PAGE_W - MARGIN, y: rowY }, thickness: 1, color: NAVY });
  rowY -= 20;
  const totalLabel = anyRange ? "ESTIMATED TOTAL" : "TOTAL";
  const totalText = anyRange && totalLow !== totalHigh ? `${fmtMoney(totalLow)} - ${fmtMoney(totalHigh)}` : fmtMoney(totalHigh);
  const labelW = fontBold.widthOfTextAtSize(totalLabel, 12);
  const availableForAmount = PAGE_W - MARGIN - 8 - (col2X + 8 + labelW + 16);
  const totalTextW14 = fontBold.widthOfTextAtSize(totalText, 14);

  page.drawText(totalLabel, { x: col2X + 8, y: rowY, size: 12, font: fontBold, color: NAVY });

  if (totalTextW14 > availableForAmount) {
    // range is too wide to fit beside the label — put it on its own line,
    // right-aligned across the full row width, so nothing overlaps
    rowY -= 20;
    const w = fontBold.widthOfTextAtSize(totalText, 13);
    page.drawText(totalText, { x: PAGE_W - MARGIN - w - 8, y: rowY, size: 13, font: fontBold, color: NAVY });
    rowY -= 30;
  } else {
    page.drawText(totalText, { x: PAGE_W - MARGIN - totalTextW14 - 8, y: rowY - 1, size: 14, font: fontBold, color: NAVY });
    rowY -= 34;
  }

  // ---------- payment details box ----------
  ensureSpace(110);
  const payBoxH = 92;
  page.drawRectangle({
    x: MARGIN,
    y: rowY - payBoxH,
    width: PAGE_W - MARGIN * 2,
    height: payBoxH,
    color: PAPER_TINT,
    borderColor: LIGHT_LINE,
    borderWidth: 1,
  });
  let payY = rowY - 18;
  page.drawText("PAYMENT DETAILS", { x: MARGIN + 14, y: payY, size: 10, font: fontBold, color: AMBER });
  payY -= 18;
  const pay = settings.payment || {};
  const payLines = [
    `M-Pesa Till Number: ${pay.mpesaTill || "-"}`,
    `M-Pesa Paybill: ${pay.mpesaPaybill || "-"}   Account: ${pay.mpesaAccount || "-"}`,
    `Cheques payable to: ${pay.chequePayable || "The Hub Visionary"}`,
  ];
  payLines.forEach((line) => {
    page.drawText(line, { x: MARGIN + 14, y: payY, size: 10.5, font, color: INK });
    payY -= 16;
  });

  rowY -= payBoxH + 22;

  // ---------- notes / terms ----------
  ensureSpace(60);
  const defaultNote =
    type === "QUOTE"
      ? anyRange
        ? `This quote shows estimated pricing, valid until ${fmtDate(
            expiresOrDueAt
          )}. Once we've discussed your exact requirements, we'll confirm a final figure before any work begins.`
        : `This quote is valid until ${fmtDate(expiresOrDueAt)}. Prices may change after this date. Final scope confirmed before work begins.`
      : `Payment due by ${fmtDate(expiresOrDueAt)}. Thank you for choosing TheHubVisionary.`;
  const noteText = notes ? `${notes} ${defaultNote}` : defaultNote;
  const noteLines = wrapText(noteText, fontOblique, 9.5, PAGE_W - MARGIN * 2);
  noteLines.forEach((line) => {
    page.drawText(line, { x: MARGIN, y: rowY, size: 9.5, font: fontOblique, color: SLATE });
    rowY -= 14;
  });

  // ---------- footer on every page ----------
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    const footY = 34;
    p.drawLine({ start: { x: MARGIN, y: footY + 16 }, end: { x: PAGE_W - MARGIN, y: footY + 16 }, thickness: 0.5, color: LIGHT_LINE });
    const contactLine = [settings.phone1, settings.phone2, settings.email].filter(Boolean).join("   .   ");
    p.drawText(contactLine, { x: MARGIN, y: footY, size: 8, font, color: SLATE });
    const pageLabel = `Page ${i + 1} of ${pages.length}`;
    const pw = font.widthOfTextAtSize(pageLabel, 8);
    p.drawText(pageLabel, { x: PAGE_W - MARGIN - pw, y: footY, size: 8, font, color: SLATE });
  });

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), totalLow, totalHigh, isEstimate: anyRange };
}

module.exports = { generateDocumentPDF };

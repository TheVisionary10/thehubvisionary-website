/**
 * lib/upload.js — validates and saves a base64 data-URI image (used for
 * partner logo uploads from the admin panel). No image-processing
 * dependency needed — just enough validation to stop obviously wrong or
 * oversized input: real magic-byte check (not just trusting the data URI
 * prefix, which a client could lie about) plus a size cap.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PARTNER_LOGOS_DIR } = require("./store");

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

const SIGNATURES = [
  { ext: ".png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ".jpg", bytes: [0xff, 0xd8, 0xff] },
];

function detectImageType(buffer) {
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) return sig.ext;
  }
  return null;
}

/**
 * @param {string} dataUri - e.g. "data:image/png;base64,iVBOR..."
 * @returns {{ ok: true, relativePath: string } | { ok: false, error: string }}
 */
function saveUploadedImage(dataUri) {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:image/")) {
    return { ok: false, error: "Expected an image file." };
  }
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) return { ok: false, error: "Malformed image data." };

  const base64 = dataUri.slice(commaIdx + 1);
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch (e) {
    return { ok: false, error: "Could not decode image data." };
  }

  if (buffer.length === 0) return { ok: false, error: "Image file is empty." };
  if (buffer.length > MAX_BYTES) return { ok: false, error: "Image is too large (max 2MB)." };

  const ext = detectImageType(buffer);
  if (!ext) return { ok: false, error: "Only PNG or JPEG images are supported." };

  const filename = crypto.randomBytes(12).toString("hex") + ext;
  const fullPath = path.join(PARTNER_LOGOS_DIR, filename);
  fs.writeFileSync(fullPath, buffer);

  return { ok: true, relativePath: `/assets/partners/${filename}` };
}

/** Removes a previously-uploaded partner logo file, ignoring errors. */
function deleteUploadedImage(relativePath) {
  if (!relativePath || !relativePath.startsWith("/assets/partners/")) return;
  try {
    const filePath = path.join(PARTNER_LOGOS_DIR, path.basename(relativePath));
    fs.unlinkSync(filePath);
  } catch (e) {
    // fine if it's already gone
  }
}

module.exports = { saveUploadedImage, deleteUploadedImage };

/**
 * lib/static.js — minimal static file server for /public, with a couple
 * of extras: path-traversal protection and an SPA fallback to index.html
 * so client-side routes (#/services etc.) work on a hard refresh too.
 */
const fs = require("fs");
const path = require("path");
const { PUBLIC_DIR, PERSIST_DIR } = require("./store");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
};

// HTML/CSS/JS change whenever you edit the site — never cache these, so a
// visitor always gets the current version instead of needing a hard
// refresh. Images/PDFs rarely change once generated, so a short cache is
// fine for those (and harmless either way).
const NO_CACHE_EXTENSIONS = new Set([".html", ".js", ".css"]);

function cacheHeaderFor(ext) {
  return NO_CACHE_EXTENSIONS.has(ext) ? "no-cache" : "public, max-age=300";
}

// Generated quote/invoice PDFs and uploaded partner logos may live outside
// the deployed public/ folder (under PERSIST_DIR) when STORAGE_DIR is set,
// so they survive a redeploy on hosts that only allow one persistent disk.
// When STORAGE_DIR isn't set, PERSIST_DIR === PUBLIC_DIR, so this changes
// nothing for local development.
const PERSISTED_PREFIXES = ["/quotes/", "/invoices/", "/assets/partners/"];

function serveStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  rel = rel.split("?")[0];

  const base = PERSISTED_PREFIXES.some((p) => rel.startsWith(p)) ? PERSIST_DIR : PUBLIC_DIR;
  const filePath = path.normalize(path.join(base, rel));

  // prevent path traversal outside the intended base directory
  if (!filePath.startsWith(base)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fall back to index.html for client-side routes (SPA) — but only
      // for paths that look like a page, not a missing asset/API call
      if (rel.startsWith("/api/") || path.extname(rel)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found");
      }
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (err2, data2) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheHeaderFor(ext),
    });
    res.end(data);
  });
}

module.exports = { serveStatic, MIME };

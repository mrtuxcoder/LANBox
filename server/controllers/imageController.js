const {
  fs,
  fsp,
  getSafePath,
  isImageFile,
  isVideoFile,
  getImageContentType,
} = require("./storage");

async function getImage(req, res) {
  try {
    const requestedPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
    if (!requestedPath) return res.status(400).json({ error: "Media path is required" });
    if (!isImageFile(requestedPath) && !isVideoFile(requestedPath)) return res.status(400).json({ error: "Requested file is not supported media" });

    const targetPath = getSafePath(requestedPath);
    const stats = await fsp.stat(targetPath);
    if (!stats.isFile()) return res.status(400).json({ error: "Requested path is not a file" });

    const contentType = getImageContentType(targetPath);
    if (!contentType) return res.status(400).json({ error: "Unsupported image type" });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const range = req.headers.range;
    if (range && isVideoFile(targetPath)) {
      const [startText, endText] = range.replace(/bytes=/, "").split("-");
      const start = Number(startText);
      const end = endText ? Number(endText) : stats.size - 1;

      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= stats.size || start > end) {
        return res.status(416).setHeader("Content-Range", `bytes */${stats.size}`).end();
      }

      res.status(206);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
      res.setHeader("Content-Length", end - start + 1);
      return fs.createReadStream(targetPath, { start, end }).pipe(res);
    }

    res.setHeader("Content-Length", stats.size);
    res.setHeader("Accept-Ranges", "bytes");

    const stream = fs.createReadStream(targetPath);
    stream.on("error", (error) => {
      console.error("Image stream error:", error);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    console.error("Image error:", error);
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (error.code === "ENOENT") return res.status(404).json({ error: "Image not found" });
    return res.status(500).json({ error: "Could not load image" });
  }
}

module.exports = { getImage };

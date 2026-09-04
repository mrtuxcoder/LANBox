const {
  fsp,
  path,
  ROOT_PATH,
  getSafePath,
  isImageFile,
  isVideoFile,
  isMediaFile,
  isSupportedFile,
  getImageContentType,
} = require("./storage");

async function listFiles(req, res) {
  try {
    const relativePath = typeof req.query.path === "string"
      ? req.query.path.trim()
      : "";
    const targetPath = getSafePath(relativePath);
    const entries = await fsp.readdir(targetPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(targetPath, entry.name);
      const stats = await fsp.stat(fullPath);
      const isDirectory = entry.isDirectory();
      const isImage = !isDirectory && isImageFile(entry.name);
      const isVideo = !isDirectory && isVideoFile(entry.name);
      const isMedia = !isDirectory && isMediaFile(entry.name);
      const isSupported = !isDirectory && isSupportedFile(entry.name);

      return {
        name: entry.name,
        path: path.relative(ROOT_PATH, fullPath),
        type: isDirectory ? "folder" : "file",
        size: isDirectory ? null : stats.size,
        modified: stats.mtime,
        isImage,
        isVideo,
        isMedia,
        isSupported,
        contentType: isMedia ? getImageContentType(entry.name) : null,
      };
    }));

    files.sort((first, second) => {
      if (first.type === "folder" && second.type !== "folder") return -1;
      if (first.type !== "folder" && second.type === "folder") return 1;
      if (first.isMedia && !second.isMedia) return -1;
      if (!first.isMedia && second.isMedia) return 1;
      return first.name.localeCompare(second.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    res.json({ path: relativePath, files });
  } catch (error) {
    console.error("Files error:", error);
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (error.code === "ENOENT") return res.status(404).json({ error: "Folder not found" });
    return res.status(500).json({ error: "Could not read storage" });
  }
}

module.exports = { listFiles };

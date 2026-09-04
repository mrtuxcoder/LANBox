const { ZipArchive } = require("archiver");
const {
  fsp,
  path,
  ROOT_PATH,
  MAX_FILE_SIZE,
  MAX_BATCH_FILES,
  MAX_BATCH_SIZE,
  getSafePath,
  isSupportedFile,
} = require("./storage");

async function downloadImage(req, res) {
  try {
    const requestedPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
    if (!requestedPath) return res.status(400).json({ error: "File path is required" });
    if (!isSupportedFile(requestedPath)) return res.status(400).json({ error: "Only files with valid extensions can be downloaded" });

    const targetPath = getSafePath(requestedPath);
    const stats = await fsp.stat(targetPath);
    if (!stats.isFile()) return res.status(400).json({ error: "Requested path is not a file" });
    if (stats.size > MAX_FILE_SIZE) return res.status(413).json({ error: "A single file cannot exceed 5 GB" });

    console.log("Downloading:", requestedPath);
    return res.download(targetPath, path.basename(targetPath));
  } catch (error) {
    console.error("Download error:", error);
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (error.code === "ENOENT") return res.status(404).json({ error: "File not found" });
    return res.status(500).json({ error: "Could not download file" });
  }
}

async function downloadMultipleImages(req, res) {
  try {
    const files = req.body?.files;
    const format = req.body?.format || "zip";
    console.log("Multiple download request:", files);

    if (!Array.isArray(files)) return res.status(400).json({ error: "files must be an array" });
    if (files.length === 0) return res.status(400).json({ error: "No files selected" });
    if (files.length > MAX_BATCH_FILES) return res.status(400).json({ error: `Maximum ${MAX_BATCH_FILES} files can be downloaded at once` });

    const cleanedFiles = [...new Set(files
      .filter((file) => typeof file === "string")
      .map((file) => file.trim().replace(/^[/\\]+/, ""))
      .filter(Boolean))];

    if (cleanedFiles.length === 0) return res.status(400).json({ error: "No valid files selected" });
    if (cleanedFiles.length > MAX_BATCH_FILES) return res.status(400).json({ error: `Maximum ${MAX_BATCH_FILES} files can be downloaded at once` });
    if (format !== "zip" && format !== "normal") {
      return res.status(400).json({ error: "format must be zip or normal" });
    }

    const validatedFiles = [];
    let totalSize = 0;
    for (const requestedPath of cleanedFiles) {
      console.log("Validating:", requestedPath);
      if (!isSupportedFile(requestedPath)) return res.status(400).json({ error: `File has no valid extension: ${requestedPath}` });

      let targetPath;
      try {
        targetPath = getSafePath(requestedPath);
      } catch (error) {
        console.error("Path validation error:", requestedPath, error);
        return res.status(403).json({ error: `Access denied: ${requestedPath}` });
      }

      let stats;
      try {
        stats = await fsp.stat(targetPath);
      } catch (error) {
        console.error("File stat error:", targetPath, error);
        if (error.code === "ENOENT") return res.status(404).json({ error: `File not found: ${requestedPath}` });
        throw error;
      }

      if (!stats.isFile()) return res.status(400).json({ error: `Not a file: ${requestedPath}` });
      totalSize += stats.size;
      if (totalSize > MAX_BATCH_SIZE) {
        return res.status(413).json({ error: "Selected files cannot exceed 5 GB in total" });
      }
      validatedFiles.push({ path: targetPath, name: path.basename(targetPath) });
    }

    if (format === "normal") {
      return res.status(200).json({
        format: "normal",
        files: validatedFiles.map((file) => ({
          name: file.name,
          downloadUrl: `/api/download?path=${encodeURIComponent(
            path.relative(ROOT_PATH, file.path)
          )}`,
        })),
      });
    }

    console.log(`Creating ZIP for ${validatedFiles.length} image(s)`);
    res.status(200);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="LANBox-Photos.zip"');
    res.setHeader("Cache-Control", "no-cache");

    const archive = new ZipArchive({ zlib: { level: 0 } });
    archive.on("warning", (error) => console.warn("ZIP warning:", error));
    archive.on("error", (error) => {
      console.error("ZIP archive error:", error);
      if (!res.destroyed) res.destroy(error);
    });
    res.on("error", (error) => {
      console.error("ZIP response error:", error);
      if (!archive.destroyed) archive.destroy();
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of validatedFiles) {
      let zipName = file.name;
      if (usedNames.has(zipName)) {
        const extension = path.extname(zipName);
        const baseName = path.basename(zipName, extension);
        let counter = 1;
        while (usedNames.has(`${baseName} (${counter})${extension}`)) counter++;
        zipName = `${baseName} (${counter})${extension}`;
      }
      usedNames.add(zipName);
      console.log("Adding to ZIP:", file.path, "as", zipName);
      archive.file(file.path, { name: zipName });
    }

    console.log("Finalizing ZIP...");
    await archive.finalize();
    console.log("ZIP finalized successfully.");
  } catch (error) {
    console.error("Multiple download error:", error);
    if (error.message === "Access denied") {
      if (!res.headersSent) return res.status(403).json({ error: "Access denied" });
      return res.destroy(error);
    }
    if (error.code === "ENOENT") {
      if (!res.headersSent) return res.status(404).json({ error: "One or more images were not found" });
      return res.destroy(error);
    }
    if (!res.headersSent) return res.status(500).json({ error: error.message || "Could not download selected images" });
    res.destroy(error);
  }
}

module.exports = { downloadImage, downloadMultipleImages };

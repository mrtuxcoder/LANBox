const { fsp, path, ROOT_PATH, getSafePath } = require("./storage");

async function createFolder(req, res) {
  try {
    const relativePath = typeof req.body?.path === "string" ? req.body.path.trim() : "";
    if (!relativePath) return res.status(400).json({ error: "Folder path is required" });

    const folderPath = getSafePath(relativePath);
    await fsp.mkdir(folderPath, { recursive: true });
    return res.status(201).json({
      message: "Folder created successfully",
      path: path.relative(ROOT_PATH, folderPath),
    });
  } catch (error) {
    console.error("Folder error:", error);
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    return res.status(500).json({ error: "Could not create folder" });
  }
}

module.exports = { createFolder };

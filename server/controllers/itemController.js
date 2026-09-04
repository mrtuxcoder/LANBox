const {
  fsp,
  path,
  ROOT_PATH,
  getSafePath,
  cleanFileName,
  isSupportedFile,
} = require("./storage");

function getRequestedPath(body) {
  return typeof body?.path === "string" ? body.path.trim() : "";
}

async function getExistingItem(relativePath) {
  if (!relativePath) throw Object.assign(new Error("File path is required"), { status: 400 });

  const targetPath = getSafePath(relativePath);
  if (targetPath === ROOT_PATH) {
    throw Object.assign(new Error("The storage root cannot be changed"), { status: 400 });
  }

  const stats = await fsp.stat(targetPath);
  if (!stats.isDirectory() && !isSupportedFile(targetPath)) {
    throw Object.assign(new Error("Only folders and image files can be changed"), { status: 400 });
  }

  return { targetPath, stats };
}

async function deleteItem(req, res) {
  try {
    const relativePath = getRequestedPath(req.body);
    const { targetPath, stats } = await getExistingItem(relativePath);

    await fsp.rm(targetPath, { recursive: stats.isDirectory(), force: false });
    return res.json({ message: "Item deleted successfully", path: relativePath });
  } catch (error) {
    console.error("Delete item error:", error);
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (error.code === "ENOENT") return res.status(404).json({ error: "Item not found" });
    return res.status(error.status || 500).json({ error: error.message || "Could not delete item" });
  }
}

async function renameItem(req, res) {
  try {
    const relativePath = getRequestedPath(req.body);
    const newName = cleanFileName(req.body?.name);
    const { targetPath, stats } = await getExistingItem(relativePath);

    if (stats.isFile() && !isSupportedFile(newName)) {
      return res.status(400).json({ error: "Files must have a valid extension" });
    }

    const destinationPath = path.join(path.dirname(targetPath), newName);
    getSafePath(path.relative(ROOT_PATH, destinationPath));

    if (destinationPath === targetPath) {
      return res.status(400).json({ error: "New name is the same as the current name" });
    }

    try {
      await fsp.access(destinationPath);
      return res.status(409).json({ error: "An item with that name already exists" });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await fsp.rename(targetPath, destinationPath);
    return res.json({
      message: "Item renamed successfully",
      path: path.relative(ROOT_PATH, destinationPath),
      name: newName,
    });
  } catch (error) {
    console.error("Rename item error:", error);
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (error.code === "ENOENT") return res.status(404).json({ error: "Item not found" });
    return res.status(error.status || 500).json({ error: error.message || "Could not rename item" });
  }
}

module.exports = { deleteItem, renameItem };

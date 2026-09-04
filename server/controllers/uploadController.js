const {
  fs,
  fsp,
  path,
  ROOT_PATH,
  TEMP_UPLOAD_DIR,
  MAX_FILE_SIZE,
  getSafePath,
  cleanFileName,
  isSupportedFile,
  isImageFile,
  isVideoFile,
  getImageContentType,
  getUniqueFilePath,
  createTempFilePath,
  safeUnlink,
} = require("./storage");

const MAX_CHUNK_SIZE = 16 * 1024 * 1024;

async function uploadPhotoChunk(req, res) {
  let temporaryPath = null;
  let fileHandle = null;

  try {
    const uploadId = req.headers["x-upload-id"];
    const originalName = req.headers["x-file-name"];
    const uploadPath = req.headers["x-upload-path"] || "";
    const fileSize = Number(req.headers["x-file-size"]);
    const chunkIndex = Number(req.headers["x-chunk-index"]);
    const totalChunks = Number(req.headers["x-total-chunks"]);
    const chunkSize = Number(req.headers["x-chunk-size"]);

    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(String(uploadId || ""))) {
      return res.status(400).json({ error: "Invalid upload ID" });
    }

    if (typeof originalName !== "string" || !originalName) {
      return res.status(400).json({ error: "X-File-Name header is required" });
    }

    const fileName = cleanFileName(decodeURIComponent(originalName));
    if (!isSupportedFile(fileName)) {
      return res.status(400).json({ error: "Files must have a valid extension" });
    }

    if (!Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > MAX_FILE_SIZE) {
      return res.status(413).json({ error: "A single file cannot exceed 5 GB" });
    }

    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 ||
      !Number.isSafeInteger(totalChunks) || totalChunks < 1 ||
      !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE ||
      chunkIndex >= totalChunks) {
      return res.status(400).json({ error: "Invalid upload chunk metadata" });
    }

    const chunks = [];
    let bodySize = 0;
    for await (const chunk of req) {
      bodySize += chunk.length;
      if (bodySize > MAX_CHUNK_SIZE) {
        return res.status(413).json({ error: "Upload chunk is too large" });
      }
      chunks.push(chunk);
    }

    const body = Buffer.concat(chunks);
    const offset = chunkIndex * chunkSize;
    const expectedChunkSize = Math.min(chunkSize, fileSize - offset);

    if (expectedChunkSize < 0 || body.length !== expectedChunkSize) {
      return res.status(400).json({ error: "Upload chunk size mismatch" });
    }

    temporaryPath = path.join(TEMP_UPLOAD_DIR, `chunked-${uploadId}.part`);
    fileHandle = await fsp.open(temporaryPath, "a+");
    const currentSize = (await fileHandle.stat()).size;

    if (currentSize !== offset) {
      if (currentSize === offset + body.length) {
        await fileHandle.close();
        fileHandle = null;
        return res.json({ complete: offset + body.length === fileSize, receivedBytes: currentSize });
      }
      await fileHandle.close();
      fileHandle = null;
      return res.status(409).json({ error: "Unexpected upload offset", receivedBytes: currentSize });
    }

    await fileHandle.write(body, 0, body.length, offset);
    await fileHandle.close();
    fileHandle = null;

    const receivedBytes = offset + body.length;
    if (receivedBytes < fileSize) {
      return res.json({ complete: false, receivedBytes });
    }

    const destinationFolder = getSafePath(uploadPath);
    await fsp.mkdir(destinationFolder, { recursive: true });
    const finalPath = await getUniqueFilePath(destinationFolder, fileName);
    getSafePath(path.relative(ROOT_PATH, finalPath));
    try {
      await fsp.rename(temporaryPath, finalPath);
      temporaryPath = null;
    } catch (error) {
      if (error.code !== "EXDEV") throw error;

      await fsp.copyFile(temporaryPath, finalPath);
      await fsp.unlink(temporaryPath);
      temporaryPath = null;
    }

    return res.status(201).json({
      complete: true,
      receivedBytes,
      message: "Photo uploaded successfully",
      file: {
        name: path.basename(finalPath),
        path: path.relative(ROOT_PATH, finalPath),
        size: receivedBytes,
        type: getImageContentType(finalPath),
        isImage: isImageFile(finalPath),
        isVideo: isVideoFile(finalPath),
        isMedia: isImageFile(finalPath) || isVideoFile(finalPath),
      },
    });
  } catch (error) {
    console.error("Chunk upload error:", error);
    if (fileHandle) await fileHandle.close().catch(() => {});
    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (!res.headersSent) return res.status(500).json({ error: error.message || "Could not upload chunk" });
  }
}

async function uploadPhoto(req, res) {
  let tempPath = null;
  let writeStream = null;
  let requestAborted = false;
  let receivedBytes = 0;

  try {
    console.log("\n=== PHOTO UPLOAD REQUEST ===");

    const originalName = req.headers["x-file-name"];
    const expectedSizeHeader = req.headers["x-file-size"];
    const uploadPath = req.headers["x-upload-path"] || "";

    if (typeof originalName !== "string" || !originalName) {
      return res.status(400).json({ error: "X-File-Name header is required" });
    }

    const fileName = cleanFileName(originalName);
    if (!isSupportedFile(fileName)) {
      return res.status(400).json({ error: "Files must have a valid extension" });
    }

    const expectedSize = Number(expectedSizeHeader);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_FILE_SIZE) {
      return res.status(413).json({ error: "A single file cannot exceed 5 GB" });
    }

    const destinationFolder = getSafePath(uploadPath);
    await fsp.mkdir(destinationFolder, { recursive: true });
    const finalPath = await getUniqueFilePath(destinationFolder, fileName);
    getSafePath(path.relative(ROOT_PATH, finalPath));

    tempPath = createTempFilePath();
    console.log("Receiving:", fileName);
    console.log("Expected size:", expectedSize, "bytes");
    console.log("Destination:", finalPath);
    console.log("Temporary:", tempPath);

    req.on("aborted", () => {
      requestAborted = true;
      console.warn("Upload request aborted:", fileName);
      if (writeStream) writeStream.destroy();
    });

    req.on("error", (error) => {
      console.warn("Upload request error:", error);
      requestAborted = true;
      if (writeStream) writeStream.destroy(error);
    });

    writeStream = fs.createWriteStream(tempPath, { flags: "wx" });
    req.on("data", (chunk) => {
      receivedBytes += chunk.length;
    });

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      writeStream.on("finish", () => finish());
      writeStream.on("error", (error) => finish(error));
      req.on("error", (error) => finish(error));
      req.on("aborted", () => finish(new Error("Upload aborted")));
      req.pipe(writeStream);
    });

    if (requestAborted || !req.complete) throw new Error("Upload aborted");

    const tempStats = await fsp.stat(tempPath);
    if (tempStats.size !== expectedSize) {
      console.error(`Size mismatch: received ${tempStats.size}, expected ${expectedSize}`);
      throw new Error(`Upload incomplete: received ${tempStats.size} of ${expectedSize} bytes`);
    }

    try {
      await fsp.rename(tempPath, finalPath);
      tempPath = null;
    } catch (error) {
      if (error.code !== "EXDEV") throw error;
      await fsp.copyFile(tempPath, finalPath);
      await fsp.unlink(tempPath);
      tempPath = null;
    }

    console.log("Photo saved:", finalPath);
    return res.status(201).json({
      message: "Photo uploaded successfully",
      file: {
        name: path.basename(finalPath),
        path: path.relative(ROOT_PATH, finalPath),
        size: tempStats.size,
        type: getImageContentType(finalPath),
            isImage: isImageFile(finalPath),
            isVideo: isVideoFile(finalPath),
            isMedia: isImageFile(finalPath) || isVideoFile(finalPath),
      },
    });
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    if (writeStream) writeStream.destroy();
    await safeUnlink(tempPath);

    if (requestAborted || error.message === "Upload aborted" || error.code === "ECONNRESET") {
      console.warn("Upload interrupted by client.");
      return;
    }

    if (error.message === "Access denied") return res.status(403).json({ error: "Access denied" });
    if (!res.headersSent) return res.status(500).json({ error: error.message || "Could not upload photo" });
  }
}

module.exports = { uploadPhoto, uploadPhotoChunk };

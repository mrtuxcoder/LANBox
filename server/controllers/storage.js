const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const configuredStoragePath = process.env.STORAGE_PATH;
const ROOT_PATH = path.resolve(
  configuredStoragePath || path.resolve(process.cwd(), "storage")
);
const TEMP_UPLOAD_DIR = "/tmp/lanbox-photo-uploads";
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const MAX_BATCH_FILES = 50;
const MAX_BATCH_SIZE = 5 * 1024 * 1024 * 1024;

const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const VIDEO_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};

const MEDIA_TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES };
const ALLOWED_EXTENSIONS = new Set(Object.keys(MEDIA_TYPES));

fs.mkdirSync(ROOT_PATH, { recursive: true });
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

console.log("LANBox storage:", ROOT_PATH);

function getSafePath(relativePath = "") {
  const cleanedPath = typeof relativePath === "string"
    ? relativePath.trim().replace(/^[/\\]+/, "")
    : "";
  const targetPath = path.resolve(ROOT_PATH, cleanedPath || "");
  const isRoot = targetPath === ROOT_PATH;
  const isInsideRoot = targetPath.startsWith(ROOT_PATH + path.sep);

  if (!isRoot && !isInsideRoot) throw new Error("Access denied");
  return targetPath;
}

function cleanFileName(filename) {
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("Invalid filename");
  }

  let name = path.basename(filename).replace(/\0/g, "");
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();

  if (!name || name === "." || name === "..") {
    throw new Error("Invalid filename");
  }

  return name;
}

function isImageFile(filename) {
  return Object.prototype.hasOwnProperty.call(
    IMAGE_TYPES,
    path.extname(filename).toLowerCase()
  );
}

function isVideoFile(filename) {
  return Object.prototype.hasOwnProperty.call(
    VIDEO_TYPES,
    path.extname(filename).toLowerCase()
  );
}

function isMediaFile(filename) {
  return ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isSupportedFile(filename) {
  const extension = path.extname(filename).toLowerCase();
  return extension.length > 1 && !/[\0\x00-\x1F]/.test(extension);
}

function getImageContentType(filename) {
  return MEDIA_TYPES[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

async function getUniqueFilePath(folder, filename) {
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);
  let candidate = path.join(folder, filename);
  let counter = 1;

  while (true) {
    try {
      await fsp.access(candidate);
      candidate = path.join(folder, `${baseName} (${counter})${extension}`);
      counter++;
    } catch (error) {
      if (error.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

function createTempFilePath() {
  return path.join(
    TEMP_UPLOAD_DIR,
    `upload-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.part`
  );
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Cleanup error:", error);
  }
}

module.exports = {
  ROOT_PATH,
  TEMP_UPLOAD_DIR,
  MAX_FILE_SIZE,
  MAX_BATCH_FILES,
  MAX_BATCH_SIZE,
  fsp,
  fs,
  path,
  getSafePath,
  cleanFileName,
  isImageFile,
  isVideoFile,
  isMediaFile,
  isSupportedFile,
  getImageContentType,
  getUniqueFilePath,
  createTempFilePath,
  safeUnlink,
};

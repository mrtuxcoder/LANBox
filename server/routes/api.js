const express = require("express");

const { getApiStatus } = require("../controllers/rootController");
const { listFiles } = require("../controllers/filesController");
const { getImage } = require("../controllers/imageController");
const {
  downloadImage,
  downloadMultipleImages,
} = require("../controllers/downloadController");
const {
  uploadPhoto,
  uploadPhotoChunk,
} = require("../controllers/uploadController");
const { createFolder } = require("../controllers/folderController");
const {
  deleteItem,
  renameItem,
} = require("../controllers/itemController");

const router = express.Router();

// JSON is used by folder creation and multiple-download requests.
// Raw photo uploads use application/octet-stream and remain streamed.
router.use(express.json({ limit: "1mb" }));

router.get("/", getApiStatus);
router.get("/files", listFiles);
router.get("/image", getImage);
router.get("/download", downloadImage);
router.post("/download/multiple", downloadMultipleImages);
router.post("/upload", uploadPhoto);
router.post("/upload/chunk", uploadPhotoChunk);
router.post("/folder", createFolder);
router.delete("/item", deleteItem);
router.patch("/item", renameItem);

module.exports = router;

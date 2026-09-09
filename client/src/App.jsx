import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { API_URL } from "./config.js";

const MAX_SELECTED = 50;
const MAX_TRANSFER_SIZE = 5 * 1024 * 1024 * 1024;
const FILE_CACHE_TTL = 15000;
const GRID_BATCH_SIZE = 40;
const DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "csv", "xls",
  "xlsx", "ods", "ppt", "pptx", "odp", "json", "xml",
]);
const MUSIC_EXTENSIONS = new Set([
  "mp3", "wav", "flac", "aac", "m4a", "ogg", "oga", "wma", "opus",
]);

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSpeed(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function getFileBadge(name) {
  const extension = String(name || "")
    .split(".")
    .pop()
    .toUpperCase();
  const badges = {
    PDF: "PDF",
    DOC: "DOC",
    DOCX: "DOC",
    XLS: "XLS",
    XLSX: "XLS",
    PPT: "PPT",
    PPTX: "PPT",
    ISO: "ISO",
    ZIP: "ZIP",
    RAR: "RAR",
    TAR: "TAR",
    GZ: "GZ",
    TXT: "TXT",
    CSV: "CSV",
    JSON: "JSON",
    APK: "APK",
  };

  return badges[extension] || extension.slice(0, 5) || "FILE";
}

function cleanPath(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

function getFileCategory(file) {
  if (file.type === "folder") return "folders";
  if (file.isImage) return "images";
  if (file.isVideo) return "videos";

  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (MUSIC_EXTENSIONS.has(extension)) return "music";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "documents";
  return "others";
}

function App() {
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadingFileNames, setUploadingFileNames] = useState([]);

  const [selectedImages, setSelectedImages] = useState([]);
  const [openedImage, setOpenedImage] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [workspaceTipOpen, setWorkspaceTipOpen] = useState(false);
  const [browseMode, setBrowseMode] = useState("files");
  const [fileFilter, setFileFilter] = useState("all");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [pendingDownloads, setPendingDownloads] = useState([]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [mutatingItem, setMutatingItem] = useState(false);
  const [openItemMenu, setOpenItemMenu] = useState(null);
  const [normalDownloadQueue, setNormalDownloadQueue] = useState([]);
  const [normalDownloadIndex, setNormalDownloadIndex] = useState(0);
  const [normalDownloadDialogOpen, setNormalDownloadDialogOpen] = useState(false);
  const [visibleFileCount, setVisibleFileCount] = useState(GRID_BATCH_SIZE);

  const fileInputRef = useRef(null);
  const requestIdRef = useRef(0);
  const errorTimerRef = useRef(null);
  const uploadStartedAtRef = useRef(0);
  const activeUploadRequestRef = useRef(new Set());
  const uploadProgressMapRef = useRef(new Map());
  const uploadCancelledRef = useRef(false);
  const filesCacheRef = useRef(new Map());
  const activeFileRequestRef = useRef(null);

  // =========================================================
  // Error helper
  // =========================================================

  const showError = useCallback((message) => {
    setError(message);

    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }

    errorTimerRef.current = setTimeout(() => {
      setError("");
    }, 3000);
  }, []);

  // =========================================================
  // Load folder contents
  // =========================================================

  const loadFiles = useCallback(async (folderPath = "") => {
    const path = cleanPath(folderPath);
    const requestId = ++requestIdRef.current;
    const cached = filesCacheRef.current.get(path);
    const hasFreshCache = cached && Date.now() - cached.timestamp < FILE_CACHE_TTL;

    if (activeFileRequestRef.current) {
      activeFileRequestRef.current.abort();
    }

    const controller = new AbortController();
    activeFileRequestRef.current = controller;

    try {
      setVisibleFileCount(GRID_BATCH_SIZE);
      if (!hasFreshCache) setLoading(true);
      setError("");

      if (cached) {
        setItems(cached.files);
        setCurrentPath(cached.path);
      }

      if (hasFreshCache) return;

      const response = await fetch(
        `${API_URL}/files?path=${encodeURIComponent(path)}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        throw new Error(`Could not load files (${response.status})`);
      }

      const data = await response.json();

      // Ignore an older request if a newer navigation happened.
      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextFiles = Array.isArray(data.files) ? data.files : [];
      const nextPath = cleanPath(data.path ?? path);
      filesCacheRef.current.set(path, {
        files: nextFiles,
        path: nextPath,
        timestamp: Date.now(),
      });
      setItems(nextFiles);
      setCurrentPath(nextPath);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error("Load files error:", err);
      setItems([]);
      showError("Could not connect to LANBox server.");
    } finally {
      if (activeFileRequestRef.current === controller) {
        activeFileRequestRef.current = null;
      }
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [showError]);

  function invalidateFilesCache() {
    filesCacheRef.current.clear();
  }

  // Initial load only.
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        void loadFiles("");
      }
    });

    return () => {
      cancelled = true;

      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }

      requestIdRef.current += 1;
      activeFileRequestRef.current?.abort();
    };
  }, [loadFiles]);

  // =========================================================
  // Folder navigation
  // =========================================================

  function openFolder(folder) {
    if (!folder || folder.type !== "folder") return;

    const nextPath = cleanPath(folder.path);

    setSelectedImages([]);
    setOpenedImage(null);
    setBrowseMode("files");
    setFileFilter("all");

    loadFiles(nextPath);
  }

  function goBack() {
    const path = cleanPath(currentPath);

    if (!path) return;

    const parts = path.split("/").filter(Boolean);
    parts.pop();

    const parentPath = parts.join("/");

    setSelectedImages([]);
    setOpenedImage(null);

    loadFiles(parentPath);
  }

  async function createFolder(event) {
    event.preventDefault();

    const name = folderName.trim();

    if (!name) {
      showError("Enter a folder name.");
      return;
    }

    if (/[\\/]/.test(name)) {
      showError("Folder names cannot contain slashes.");
      return;
    }

    const folderPath = currentPath
      ? `${currentPath}/${name}`
      : name;

    try {
      setCreatingFolder(true);

      const response = await fetch(`${API_URL}/folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: folderPath }),
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data?.error || `Could not create folder (${response.status})`);
      }

      setFolderName("");
      setFolderDialogOpen(false);
      invalidateFilesCache();
      await loadFiles(currentPath);
    } catch (err) {
      console.error("Create folder error:", err);
      showError(err?.message || "Could not create folder.");
    } finally {
      setCreatingFolder(false);
    }
  }

  function openRenameDialog(item) {
    if (!item?.path) return;
    setOpenItemMenu(null);
    setItemToRename(item);
    setRenameName(item.name || "");
    setRenameDialogOpen(true);
  }

  function closeRenameDialog() {
    setRenameDialogOpen(false);
    setItemToRename(null);
    setRenameName("");
  }

  async function renameItem(event) {
    event.preventDefault();
    const name = renameName.trim();

    if (!name || !itemToRename?.path) {
      showError("Enter a new name.");
      return;
    }

    try {
      setMutatingItem(true);
      const response = await fetch(`${API_URL}/item`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: itemToRename.path, name }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Could not rename item (${response.status})`);
      }

      closeRenameDialog();
      setOpenedImage(null);
      invalidateFilesCache();
      await loadFiles(currentPath);
    } catch (err) {
      console.error("Rename item error:", err);
      showError(err?.message || "Could not rename item.");
    } finally {
      setMutatingItem(false);
    }
  }

  async function deleteItem(item) {
    if (!item?.path) return;

    setOpenItemMenu(null);

    const confirmed = window.confirm(`Delete "${item.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      setMutatingItem(true);
      const response = await fetch(`${API_URL}/item`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Could not delete item (${response.status})`);
      }

      setSelectedImages((current) =>
        current.filter((selected) => cleanPath(selected.path) !== cleanPath(item.path))
      );
      setOpenedImage(null);
      invalidateFilesCache();
      await loadFiles(currentPath);
    } catch (err) {
      console.error("Delete item error:", err);
      showError(err?.message || "Could not delete item.");
    } finally {
      setMutatingItem(false);
    }
  }

  // =========================================================
  // Image URL
  // =========================================================

  function getImageUrl(image) {
    const imagePath = cleanPath(image?.path);

    if (!imagePath || (!image?.isImage && !image?.isVideo)) {
      return "";
    }

    return `${API_URL}/image?path=${encodeURIComponent(imagePath)}`;
  }

  // =========================================================
  // Open / close image
  // =========================================================

  function openImage(image) {
    if (!image?.path) {
      showError("Image path is missing.");
      return;
    }

    setOpenedImage(image);
  }

  function closeImage() {
    setOpenedImage(null);
  }

  // =========================================================
  // Selection
  // =========================================================

  function selectImage(image) {
    if (!image?.path) return;

    setOpenItemMenu(null);

    const imagePath = cleanPath(image.path);

    setSelectedImages((current) => {
      const alreadySelected = current.some(
        (item) => cleanPath(item.path) === imagePath
      );

      if (alreadySelected) {
        return current.filter(
          (item) => cleanPath(item.path) !== imagePath
        );
      }

      if (current.length >= MAX_SELECTED) {
        showError(
          `You can select a maximum of ${MAX_SELECTED} files.`
        );

        return current;
      }

      return [...current, image];
    });
  }

  function isSelected(image) {
    const imagePath = cleanPath(image?.path);

    return selectedImages.some(
      (item) => cleanPath(item.path) === imagePath
    );
  }

  function clearSelection() {
    setSelectedImages([]);
  }

  // =========================================================
  // Download one image
  // =========================================================

  function downloadImage(image) {
    if (!image || !image.path) {
      console.error("Invalid image:", image);
      showError("Image path is missing.");
      return;
    }

    const imagePath = cleanPath(image.path);

    if (!imagePath) {
      showError("Image path is empty.");
      return;
    }

    // Your backend exposes /api/download.
    const url = `${API_URL}/download?path=${encodeURIComponent(
      imagePath
    )}`;

    const link = document.createElement("a");

    link.href = url;
    link.download = image.name || "image";
    link.target = "_self";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function prepareNormalDownload(images) {
    try {
      if (images.length > MAX_SELECTED) {
        throw new Error(`You can download a maximum of ${MAX_SELECTED} files.`);
      }

      if (images.reduce((total, image) => total + (image.size || 0), 0) > MAX_TRANSFER_SIZE) {
        throw new Error("Selected files cannot exceed 5 GB in total.");
      }

      const response = await fetch(`${API_URL}/download/multiple`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          files: images.map((image) => image.path),
          format: "normal",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Download failed (${response.status})`);
      }

      if (!Array.isArray(data.files) || data.files.length === 0) {
        throw new Error("No downloadable images were returned.");
      }

      setNormalDownloadQueue(Array.isArray(data.files) ? data.files : []);
      setNormalDownloadIndex(0);
      setNormalDownloadDialogOpen(true);
    } catch (err) {
      console.error("Normal image download error:", err);
      showError(err?.message || "Could not download selected images.");
    }
  }

  function downloadNextNormally() {
    const file = normalDownloadQueue[normalDownloadIndex];
    if (!file) return;

    const link = document.createElement("a");
    link.href = `${API_URL.replace(/\/api$/, "")}${file.downloadUrl}`;
    link.download = file.name || "image";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    if (normalDownloadIndex + 1 >= normalDownloadQueue.length) {
      setNormalDownloadDialogOpen(false);
      setNormalDownloadQueue([]);
      setNormalDownloadIndex(0);
      return;
    }

    setNormalDownloadIndex((current) => current + 1);
  }

  function closeNormalDownloadDialog() {
    setNormalDownloadDialogOpen(false);
    setNormalDownloadQueue([]);
    setNormalDownloadIndex(0);
  }

  // =========================================================
  // Download selected images
  //
  // Multiple images are downloaded as ONE ZIP file. This avoids
  // the browser blocking the second/later automatic downloads.
  // =========================================================

  async function downloadSelectedImages(imagesToDownload = selectedImages) {
    if (!imagesToDownload.length || uploading) return;

    const images = imagesToDownload
      .map((image) => ({
        name: image?.name || "image",
        path: cleanPath(image?.path),
      }))
      .filter((image) => image.path);

    if (!images.length) {
      showError("No valid images selected.");
      return;
    }

    if (images.length === 1) {
      downloadImage(images[0]);
      setSelectedImages([]);
      return;
    }

    if (images.length > MAX_SELECTED) {
      showError(`You can download a maximum of ${MAX_SELECTED} files.`);
      return;
    }

    if (images.reduce((total, image) => total + (image.size || 0), 0) > MAX_TRANSFER_SIZE) {
      showError("Selected files cannot exceed 5 GB in total.");
      return;
    }

    try {
      setError("");

      const response = await fetch(`${API_URL}/download/multiple`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/zip",
        },
        body: JSON.stringify({
          files: images.map((image) => image.path),
          format: "zip",
        }),
      });

      if (!response.ok) {
        let message = `Download failed (${response.status})`;

        try {
          const data = await response.json();
          if (data?.error) message = data.error;
        } catch {
          // Response was not JSON. Keep the status message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("The ZIP file is empty.");
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = blobUrl;
      link.download = "LANBox-Photos.zip";
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      // Give the browser time to start the download before releasing it.
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);

      setSelectedImages([]);
    } catch (err) {
      console.error("Multiple image download error:", err);
      showError(err?.message || "Could not download selected images.");
    }
  }

  function openDownloadDialog(images) {
    const validImages = images
      .filter((image) => image?.path)
      .map((image) => ({
        name: image.name || "image",
        path: cleanPath(image.path),
      }));

    if (!validImages.length) {
      showError("No valid images selected.");
      return;
    }

    setPendingDownloads(validImages);
    setDownloadDialogOpen(true);
  }

  function closeDownloadDialog() {
    setDownloadDialogOpen(false);
    setPendingDownloads([]);
  }

  function handleNormalDownload() {
    prepareNormalDownload(pendingDownloads);
    closeDownloadDialog();
    setSelectedImages([]);
  }

  function handleZipDownload() {
    const images = pendingDownloads;

    closeDownloadDialog();
    setSelectedImages([]);

    if (images.length === 1) {
      downloadImage(images[0]);
      return;
    }

    downloadSelectedImages(images);
  }

  // =========================================================
  // Upload file picker
  // =========================================================

  function selectFiles() {
    if (uploading) return;

    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    const files = Array.from(event.target.files || []);

    // Reset input so the same file can be selected again.
    event.target.value = "";

    if (!files.length) return;

    uploadFiles(files);
  }

  // =========================================================
  // Upload images
  // Uses your backend:
  // POST /api/upload
  //
  // Headers:
  // X-File-Name
  // X-File-Size
  // X-Upload-Path
  // =========================================================

  async function uploadFiles(files) {
    if (!files.length || uploading) return;

    let imageFiles = files.filter((file) => file.name.includes("."));

    if (!imageFiles.length) {
      showError("Please select files with a valid extension.");
      return;
    }

    const existingNames = new Set(items.map((item) => item.name));
    const duplicateNames = [...new Set(
      imageFiles
        .filter((file) => existingNames.has(file.name))
        .map((file) => file.name)
    )];

    if (duplicateNames.length > 0) {
      const duplicateSummary = duplicateNames.length === 1
        ? duplicateNames[0]
        : `${duplicateNames[0]} and ${duplicateNames.length - 1} more`;
      const uploadAgain = window.confirm(
        `${duplicateSummary} already exists in this folder. Upload again?`
      );

      if (!uploadAgain) {
        imageFiles = imageFiles.filter((file) => !existingNames.has(file.name));
      }
    }

    if (!imageFiles.length) {
      showError("No new files selected.");
      return;
    }

    if (imageFiles.length > MAX_SELECTED) {
      showError(`You can upload a maximum of ${MAX_SELECTED} files at once.`);
      return;
    }

    const totalSize = imageFiles.reduce((total, file) => total + file.size, 0);
    if (totalSize > MAX_TRANSFER_SIZE) {
      showError("Selected files cannot exceed 5 GB in total.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadingFileNames([]);
    uploadProgressMapRef.current.clear();
    uploadCancelledRef.current = false;
    uploadStartedAtRef.current = Date.now();
    setError("");

    try {
      let nextFileIndex = 0;
      const uploadWorker = async () => {
        while (nextFileIndex < imageFiles.length) {
          if (uploadCancelledRef.current) {
            throw new DOMException("Upload was cancelled.", "AbortError");
          }
          const fileIndex = nextFileIndex++;
          const file = imageFiles[fileIndex];
          setUploadingFileNames((current) => [...new Set([...current, file.name])]);
          try {
            await uploadSingleFile(file, fileIndex, imageFiles.length, totalSize);
          } finally {
            setUploadingFileNames((current) => current.filter((name) => name !== file.name));
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(2, imageFiles.length) }, uploadWorker)
      );

      setUploadProgress(100);

      // Refresh the current folder after all uploads.
      invalidateFilesCache();
      await loadFiles(currentPath);

      setTimeout(() => {
        setUploadProgress(0);
      }, 800);
    } catch (err) {
      console.error("Upload error:", err);

      if (err?.name === "AbortError") {
        showError("Upload was cancelled.");
      } else {
        showError(err?.message || "Upload failed.");
      }

      setUploadProgress(0);
      setUploadSpeed(0);
      setUploadingFileNames([]);
    } finally {
      setUploading(false);
      activeUploadRequestRef.current.clear();
    }
  }

  function cancelUpload() {
    uploadCancelledRef.current = true;
    activeUploadRequestRef.current.forEach((request) => request.abort());
  }

  async function uploadSingleFile(file, fileIndex, totalFiles, totalSize) {
    const chunkSize = 8 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const uploadId = globalThis.crypto?.randomUUID?.() ||
      `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const uploadPath = cleanPath(currentPath);
    let offset = 0;

    function sendChunk(chunk, chunkIndex) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeUploadRequestRef.current.add(xhr);
        xhr.open("POST", `${API_URL}/upload/chunk`, true);
        xhr.timeout = 10 * 60 * 1000;
        xhr.setRequestHeader("X-Upload-Id", uploadId);
        xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
        xhr.setRequestHeader("X-File-Size", String(file.size));
        xhr.setRequestHeader("X-Upload-Path", uploadPath);
        xhr.setRequestHeader("X-Chunk-Index", String(chunkIndex));
        xhr.setRequestHeader("X-Total-Chunks", String(totalChunks));
        xhr.setRequestHeader("X-Chunk-Size", String(chunkSize));
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const uploaded = offset + event.loaded;
          uploadProgressMapRef.current.set(fileIndex, uploaded);
          const totalUploaded = [...uploadProgressMapRef.current.values()]
            .reduce((total, value) => total + value, 0);
          setUploadProgress(Math.round((totalUploaded / totalSize) * 100));
          const elapsedSeconds = Math.max(
            (Date.now() - uploadStartedAtRef.current) / 1000,
            0.1
          );
          setUploadSpeed(totalUploaded / elapsedSeconds);
        };

        xhr.onload = () => {
          activeUploadRequestRef.current.delete(xhr);
          const response = (() => {
            try {
              return JSON.parse(xhr.responseText || "{}");
            } catch {
              return {};
            }
          })();

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response);
            return;
          }

          if (xhr.status === 409 && Number.isSafeInteger(response.receivedBytes)) {
            resolve({ ...response, resumedOffset: response.receivedBytes });
            return;
          }

          reject(new Error(response.error || `Upload failed (${xhr.status})`));
        };

        xhr.onerror = () => {
          activeUploadRequestRef.current.delete(xhr);
          reject(new Error("Upload connection failed."));
        };
        xhr.ontimeout = () => {
          activeUploadRequestRef.current.delete(xhr);
          reject(new Error("Upload timed out."));
        };
        xhr.onabort = () => {
          activeUploadRequestRef.current.delete(xhr);
          const error = new Error("Upload was cancelled.");
          error.name = "AbortError";
          reject(error);
        };

        xhr.send(chunk);
      });
    }

    while (offset < file.size) {
      if (uploadCancelledRef.current) {
        throw new DOMException("Upload was cancelled.", "AbortError");
      }
      const chunkIndex = Math.floor(offset / chunkSize);
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      let completed = false;

      for (let attempt = 1; attempt <= 3 && !completed; attempt++) {
        try {
          const response = await sendChunk(chunk, chunkIndex);
          const resumedOffset = response.resumedOffset;
          offset = resumedOffset ?? Math.min(offset + chunk.size, file.size);
          completed = true;
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
    }

    setUploadProgress(Math.round(((fileIndex + 1) / totalFiles) * 100));
  }

  // =========================================================
  // Keyboard controls
  // =========================================================

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenedImage(null);
        setOpenItemMenu(null);
        closeNormalDownloadDialog();
        setSortMenuOpen(false);
        setWorkspaceTipOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!uploading) return undefined;

    function warnBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "Upload in progress. Keep this page open.";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [uploading]);

  // =========================================================
  // Data
  // =========================================================

  const folders = useMemo(
    () => items.filter((item) => item.type === "folder"),
    [items]
  );

  const images = useMemo(() => items.filter((item) => {
    if (item.type !== "file") return false;

    if (item.isSupported === true) return true;

    return Boolean(item.name?.includes("."));
  }), [items]);

  const locationPath = currentPath ? `/${currentPath}` : "/";
  const deferredSortBy = useDeferredValue(sortBy);
  const deferredSortDirection = useDeferredValue(sortDirection);

  const filterOptions = [
    ["all", "All"],
    ["images", "Images"],
    ["videos", "Videos"],
    ["music", "Music"],
    ["documents", "Documents"],
    ["others", "Others"],
  ];

  const filterCounts = useMemo(() => {
    const counts = {
      all: images.length,
      images: 0,
      videos: 0,
      music: 0,
      documents: 0,
      others: 0,
    };

    images.forEach((file) => {
      counts[getFileCategory(file)] += 1;
    });

    return counts;
  }, [images]);

  const filteredFolders = browseMode === "folders" ? folders : [];
  const filteredImages = useMemo(() => browseMode === "folders" ? []
    : fileFilter === "all"
      ? images
      : images.filter((file) => getFileCategory(file) === fileFilter), [browseMode, fileFilter, images]);

  const sortedImages = useMemo(() => [...filteredImages].sort((first, second) => {
    const comparison = deferredSortBy === "date"
      ? new Date(first.modified || 0).getTime() -
        new Date(second.modified || 0).getTime()
      : deferredSortBy === "size"
        ? (first.size || 0) - (second.size || 0)
        : (first.name || "").localeCompare(
            second.name || "",
            undefined,
            { numeric: true, sensitivity: "base" }
          );

    return deferredSortDirection === "asc" ? comparison : -comparison;
  }), [filteredImages, deferredSortBy, deferredSortDirection]);

  const visibleFiles = sortedImages.slice(0, visibleFileCount);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleFileCount >= sortedImages.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleFileCount((current) => current + GRID_BATCH_SIZE);
      }
    }, { rootMargin: "320px" });

    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleFileCount, sortedImages.length]);

  // =========================================================
  // Floating action
  // =========================================================

  const hasSelection = selectedImages.length > 0;

  let floatingButtonText = "Upload";

  if (openedImage) {
    floatingButtonText = "Download";
  } else if (hasSelection) {
    floatingButtonText =
      selectedImages.length === 1
        ? "Download"
        : `Download ${selectedImages.length}`;
  }

  function handleFloatingAction() {
    if (uploading) return;

    if (openedImage) {
      downloadImage(openedImage);
      return;
    }

    if (hasSelection) {
      if (selectedImages.length === 1) {
        downloadImage(selectedImages[0]);
      } else {
        openDownloadDialog(selectedImages);
      }
      return;
    }

    selectFiles();
  }

  // =========================================================
  // Render
  // =========================================================

  return (
    <div className="app">

      {/* HEADER */}

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <span className="brand-mark-bar" />
            <span className="brand-mark-bar" />
            <span className="brand-mark-bar" />
          </div>

          <div>
            <h1>LANBox</h1>
            <span>Private file sharing on your network</span>
          </div>
        </div>

        <div className="header-actions">
          {selectedImages.length > 0 && (
            <button
              className="selection-count"
              onClick={clearSelection}
            >
              {selectedImages.length}/{MAX_SELECTED} selected
            </button>
          )}

        </div>
      </header>

      {/* CONTENT */}

      <main className="content">

        <div className="location-bar">
          <div className="location-actions">
            <div className="view-controls" aria-label="File view controls">
              <button
                type="button"
                className={`info-control ${workspaceTipOpen ? "active" : ""}`}
                onClick={() => setWorkspaceTipOpen((current) => !current)}
                aria-label="Show folder guidance"
                aria-expanded={workspaceTipOpen}
                title="How file browsing works"
              >
                i
              </button>

              {currentPath && (
                <button
                  type="button"
                  className="icon-control back-icon-control"
                  onClick={goBack}
                  disabled={loading || uploading}
                  aria-label="Go back"
                  title="Go back"
                >
                  ←
                </button>
              )}

              <div className="browse-switcher" role="group" aria-label="Browse files or folders">
                <button
                  type="button"
                  className={browseMode === "files" ? "active" : ""}
                  onClick={() => setBrowseMode("files")}
                  title="Show files in the current folder"
                >
                  Files
                </button>
                <button
                  type="button"
                  className={browseMode === "folders" ? "active" : ""}
                  onClick={() => setBrowseMode("folders")}
                  title="Browse folders inside the current folder"
                >
                  Folders
                </button>
              </div>

              <div className="sort-control">
                <button
                  type="button"
                  className={`icon-control ${sortMenuOpen ? "active" : ""}`}
                  onClick={() => setSortMenuOpen((current) => !current)}
                  aria-label="Sort files"
                  aria-expanded={sortMenuOpen}
                  title="Sort files"
                >
                  ⇅
                </button>

                {sortMenuOpen && (
                  <div className="sort-menu">
                    {["name", "date", "size"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={sortBy === option ? "active" : ""}
                        onClick={() => {
                          setSortBy(option);
                          setSortMenuOpen(false);
                        }}
                      >
                        {option[0].toUpperCase() + option.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="icon-control"
                onClick={() =>
                  setSortDirection((current) => current === "asc" ? "desc" : "asc")
                }
                aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
                title={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
              >
                {sortDirection === "asc" ? "↑" : "↓"}
              </button>

              <div className="view-switcher" role="group" aria-label="File layout">
                {[
                  ["grid", "▦", "Grid view"],
                  ["list", "☷", "List view"],
                ].map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={viewMode === mode ? "active" : ""}
                    onClick={() => setViewMode(mode)}
                    aria-label={label}
                    title={label}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <strong className="location-path">
              {locationPath}
            </strong>
          </div>
        </div>

        {workspaceTipOpen && (
          <div className="workspace-tip" role="note">
            <span className="workspace-tip-text">
              Showing items from <strong>{locationPath}</strong> only. Switch to
              <strong> Folders</strong> to explore another folder, then return to
              <strong> Files</strong> to view its contents.
            </span>
          </div>
        )}

        {error && (
          <div
            className="error-message"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>Loading...</span>
          </div>
        ) : (
          <>
            {/* FILES */}

            {(images.length > 0 || folders.length > 0) && (
              <section>
                {browseMode === "files" && (
                <div className="file-filter-bar" role="tablist" aria-label="Filter files">
                  {filterOptions.map(([value, label]) => {
                    return (
                      <button
                        key={value}
                        type="button"
                        className={fileFilter === value ? "active" : ""}
                        onClick={() => setFileFilter(value)}
                        role="tab"
                        aria-selected={fileFilter === value}
                      >
                        {label}
                        <span>{filterCounts[value]}</span>
                      </button>
                    );
                  })}
                  <span className="file-filter-total">
                    {browseMode === "files" ? images.length : folders.length} {browseMode === "files" ? "files" : "folders"}
                  </span>
                </div>
                )}

                {filteredFolders.length > 0 && (
                  <div className={`folder-grid filtered-folder-grid view-${viewMode}`}>
                    {filteredFolders.map((folder) => (
                      <div
                        key={cleanPath(folder.path)}
                        className="folder-card"
                        onClick={() => {
                          if (!uploading) openFolder(folder);
                        }}
                        role="button"
                        tabIndex={uploading ? -1 : 0}
                        aria-disabled={uploading}
                      >
                        <div className="folder-icon">📁</div>
                        <div className="folder-name">{folder.name}</div>

                        <div className="folder-meta">
                          <span>Folder</span>
                          <span>{formatDate(folder.modified)}</span>
                        </div>
                        <div className="item-actions">
                          <button
                            type="button"
                            className="item-menu-trigger folder-menu-trigger"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenItemMenu((current) =>
                                current === folder.path ? null : folder.path
                              );
                            }}
                            aria-label={`Options for ${folder.name}`}
                            aria-expanded={openItemMenu === folder.path}
                            title="Folder options"
                          >
                            ⋮
                          </button>
                          {openItemMenu === folder.path && (
                            <div className="item-menu" onClick={(event) => event.stopPropagation()}>
                              <button type="button" onClick={() => openRenameDialog(folder)}>Rename</button>
                              <button type="button" onClick={() => deleteItem(folder)}>Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {filteredImages.length > 0 && (
                <div className={`photo-grid view-${viewMode}`}>
                  {visibleFiles.map((image) => {
                    const selected = isSelected(image);
                    const imageUrl = getImageUrl(image);

                    return (
                      <div
                        key={cleanPath(image.path)}
                        className={`photo-card ${
                          selected ? "selected" : ""
                        }`}
                        onClick={() => openImage(image)}
                      >
                        {imageUrl && image.isVideo ? (
                          <video
                            src={imageUrl}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={image.name || "Photo"}
                            loading="lazy"
                          />
                        ) : (
                          <div className="photo-placeholder">
                            <strong>{getFileBadge(image.name)}</strong>
                            <span>{image.name}</span>
                          </div>
                        )}

                        <div className="item-actions image-item-actions">
                          <button
                            type="button"
                            className={`item-menu-trigger image-menu-trigger ${
                              selectedImages.length > 0 ? "selection-radio" : ""
                            } ${selected ? "selected" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();

                              if (selectedImages.length > 0) {
                                selectImage(image);
                                return;
                              }

                              setOpenItemMenu((current) =>
                                current === image.path ? null : image.path
                              );
                            }}
                            aria-label={
                              selectedImages.length > 0
                                ? selected
                                  ? `Deselect ${image.name}`
                                  : `Select ${image.name}`
                                : `Options for ${image.name}`
                            }
                            aria-pressed={selectedImages.length > 0 ? selected : undefined}
                            aria-expanded={
                              selectedImages.length > 0
                                ? undefined
                                : openItemMenu === image.path
                            }
                            title={
                              selectedImages.length > 0
                                ? selected
                                  ? "Deselect image"
                                  : "Select image"
                                : "Image options"
                            }
                          >
                            {selectedImages.length > 0 ? (selected ? "✓" : "") : "⋮"}
                          </button>

                          {selectedImages.length === 0 && openItemMenu === image.path && (
                            <div className="item-menu" onClick={(event) => event.stopPropagation()}>
                              <button type="button" onClick={() => selectImage(image)}>
                                {selected ? "Deselect" : "Select"}
                              </button>
                              <button type="button" onClick={() => {
                                setOpenItemMenu(null);
                                downloadImage(image);
                              }}>
                                Download
                              </button>
                              <button type="button" onClick={() => openRenameDialog(image)}>
                                Rename
                              </button>
                              <button type="button" onClick={() => deleteItem(image)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="photo-overlay">
                          <span>
                            {image.name}
                          </span>

                          <div className="photo-meta">
                            <span>{formatBytes(image.size)}</span>
                            <span>{formatDate(image.modified)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                {visibleFileCount < sortedImages.length && (
                  <div ref={loadMoreRef} className="grid-load-more" aria-hidden="true" />
                )}

                {filteredImages.length === 0 && (
                  <div className="filter-empty-state">
                    {browseMode === "folders"
                      ? "No folders in this location."
                      : fileFilter === "all"
                        ? "No files in this folder."
                        : `No ${fileFilter} files in this folder.`}
                  </div>
                )}
              </section>
            )}

            {/* EMPTY */}

            {!folders.length && !images.length && (
              <div className="empty-state">
                <div className="empty-icon">
                  📁
                </div>

                <h2>
                  {browseMode === "folders" ? "No folders here" : "No files yet"}
                </h2>

                <p>
                  {browseMode === "folders"
                    ? "Create a folder to organize this location."
                    : "Upload files to see them here."}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* FILE INPUT */}

      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        multiple
        hidden
        onChange={handleFileChange}
      />

      {folderDialogOpen && (
        <div className="folder-dialog-backdrop">
          <form
            className="folder-dialog"
            onSubmit={createFolder}
          >
            <div className="folder-dialog-header">
              <div>
                <span className="dialog-eyebrow">New folder</span>
                <h2>Create a folder</h2>
              </div>

              <button
                type="button"
                className="dialog-close"
                onClick={() => setFolderDialogOpen(false)}
                aria-label="Close folder dialog"
              >
                ×
              </button>
            </div>

            <label htmlFor="folder-name">Folder name</label>
            <input
              id="folder-name"
              type="text"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="e.g. Holiday photos"
              autoFocus
              disabled={creatingFolder}
            />

            <div className="folder-dialog-actions">
              <button
                type="button"
                className="dialog-cancel"
                onClick={() => setFolderDialogOpen(false)}
                disabled={creatingFolder}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dialog-create"
                disabled={creatingFolder}
              >
                {creatingFolder ? "Creating..." : "Create folder"}
              </button>
            </div>
          </form>
        </div>
      )}

      {downloadDialogOpen && (
        <div className="folder-dialog-backdrop">
          <div
            className="folder-dialog download-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-dialog-title"
          >
            <div className="folder-dialog-header">
              <div>
                <span className="dialog-eyebrow">Download options</span>
                <h2 id="download-dialog-title">
                  Download {pendingDownloads.length} {pendingDownloads.length === 1 ? "photo" : "photos"}
                </h2>
              </div>

              <button
                type="button"
                className="dialog-close"
                onClick={closeDownloadDialog}
                aria-label="Close download options"
              >
                ×
              </button>
            </div>

            <div className="download-options">
              <button
                type="button"
                className="download-option"
                onClick={handleNormalDownload}
              >
                <strong>Download normally</strong>
                <span>Save each photo as its original file.</span>
              </button>

              <button
                type="button"
                className="download-option download-option-primary"
                onClick={handleZipDownload}
              >
                <strong>Download as ZIP</strong>
                <span>Save everything in one compressed archive.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {renameDialogOpen && itemToRename && (
        <div className="folder-dialog-backdrop">
          <form className="folder-dialog" onSubmit={renameItem}>
            <div className="folder-dialog-header">
              <div>
                <span className="dialog-eyebrow">Rename item</span>
                <h2>Choose a new name</h2>
              </div>

              <button
                type="button"
                className="dialog-close"
                onClick={closeRenameDialog}
                aria-label="Close rename dialog"
              >
                ×
              </button>
            </div>

            <label htmlFor="rename-item">Name</label>
            <input
              id="rename-item"
              type="text"
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              autoFocus
              disabled={mutatingItem}
            />

            <div className="folder-dialog-actions">
              <button
                type="button"
                className="dialog-cancel"
                onClick={closeRenameDialog}
                disabled={mutatingItem}
              >
                Cancel
              </button>
              <button type="submit" className="dialog-create" disabled={mutatingItem}>
                {mutatingItem ? "Renaming..." : "Rename"}
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        className="new-folder-fab"
        onClick={() => setFolderDialogOpen(true)}
        disabled={loading || uploading}
      >
        <span aria-hidden="true">+</span>
        New folder
      </button>

      {normalDownloadDialogOpen && normalDownloadQueue.length > 0 && (
        <div className="folder-dialog-backdrop">
          <div
            className="folder-dialog download-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="normal-download-title"
          >
            <div className="folder-dialog-header">
              <div>
                <span className="dialog-eyebrow">Direct downloads</span>
                <h2 id="normal-download-title">
                  Image {normalDownloadIndex + 1} of {normalDownloadQueue.length}
                </h2>
              </div>

              <button
                type="button"
                className="dialog-close"
                onClick={closeNormalDownloadDialog}
                aria-label="Close direct download queue"
              >
                ×
              </button>
            </div>

            <p className="download-queue-name">
              {normalDownloadQueue[normalDownloadIndex]?.name}
            </p>

            <p className="download-queue-note">
              Tap the button for each image so your mobile browser allows every download.
            </p>

            <div className="folder-dialog-actions">
              <button
                type="button"
                className="dialog-cancel"
                onClick={closeNormalDownloadDialog}
              >
                Stop
              </button>
              <button
                type="button"
                className="dialog-create"
                onClick={downloadNextNormally}
              >
                Download image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ACTION BUTTON */}

      <button
        className={`upload-fab ${
          openedImage || hasSelection
            ? "download-mode"
            : ""
        } ${
          uploading ? "uploading" : ""
        }`}
        onClick={handleFloatingAction}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <span className="fab-spinner" />

            <span>
              {uploadProgress}%
            </span>
          </>
        ) : openedImage ? (
          <>
            <span className="fab-icon">
              ↓
            </span>

            <span>
              Download
            </span>
          </>
        ) : hasSelection ? (
          <>
            <span className="fab-icon">
              ↓
            </span>

            <span>
              {floatingButtonText}
            </span>
          </>
        ) : (
          <>
            <span className="fab-plus">
              +
            </span>

            <span>
              Upload
            </span>
          </>
        )}
      </button>

      {/* UPLOAD STATUS */}

      {uploading && (
        <div className="upload-status">
          <div className="upload-status-header">
            <span>
              Keep this page open while uploading
            </span>

            <strong>
              {uploadProgress}%
            </strong>
          </div>

          <div className="upload-speed">
            {formatSpeed(uploadSpeed)}
          </div>

          <div className="upload-file-name" title={uploadingFileNames.join(", ")}>
            {uploadingFileNames.length > 0
              ? `Uploading: ${uploadingFileNames.join(", ")}`
              : "Preparing files..."}
          </div>

          <button
            type="button"
            className="upload-cancel"
            onClick={cancelUpload}
          >
            Cancel upload
          </button>

          <div className="upload-track">
            <div
              className="upload-bar"
              style={{
                width: `${uploadProgress}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* MEDIA VIEWER */}

      {openedImage && (
        <div
          className="image-viewer"
          onClick={closeImage}
        >
          <div
            className="viewer-content"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="viewer-close"
              onClick={closeImage}
              aria-label="Close image"
            >
              ×
            </button>

            {openedImage.isVideo ? (
              <video
                src={getImageUrl(openedImage)}
                controls
                autoPlay
                playsInline
              />
            ) : openedImage.isImage ? (
              <img
                src={getImageUrl(openedImage)}
                alt={openedImage.name || "Photo"}
              />
            ) : (
              <div className="file-viewer-placeholder">
                Preview unavailable for this file type.
              </div>
            )}

            <div className="viewer-info">
              <strong>
                {openedImage.name}
              </strong>

              {openedImage.size && (
                <span>
                  {formatBytes(openedImage.size)}
                </span>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

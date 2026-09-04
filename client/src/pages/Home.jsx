import { useEffect, useState } from "react";
import { API_URL } from "../config";

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

function isImageFile(name = "") {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(name);
}

function Home() {
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");

  // ==========================================
  // Load files and folders
  // ==========================================

  async function loadFiles(folderPath = "") {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/files?path=${encodeURIComponent(folderPath)}`
      );

      if (!response.ok) {
        throw new Error("Could not load files");
      }

      const data = await response.json();

      setItems(data.files || []);
      setCurrentPath(folderPath);
    } catch (error) {
      console.error("Failed to load files:", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles("");
  }, []);

  // ==========================================
  // Open folder
  // ==========================================

  function openFolder(item) {
    if (item.type !== "folder") return;

    loadFiles(item.path);
  }

  // ==========================================
  // Go back
  // ==========================================

  function goBack() {
    if (!currentPath) return;

    const parentPath = currentPath.includes("/")
      ? currentPath.substring(0, currentPath.lastIndexOf("/"))
      : "";

    loadFiles(parentPath);
  }

  // ==========================================
  // Image URL
  // ==========================================

  function getImageUrl(item) {
    return `${API_URL}/image?path=${encodeURIComponent(item.path)}`;
  }

  // ==========================================
  // Upload
  // ==========================================

  function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const images = files.filter((file) =>
      isImageFile(file.name)
    );

    if (!images.length) {
      setUploadError("Only image files can be uploaded.");
      event.target.value = "";
      return;
    }

    setUploadError("");
    setSelectedFiles(images);

    uploadImages(images);

    event.target.value = "";
  }

  function uploadImages(files) {
    if (!files.length || uploading) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError("");

    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file, file.name);
    });

    formData.append("path", currentPath);

    const xhr = new XMLHttpRequest();

    xhr.open(
      "POST",
      `${API_URL}/upload`,
      true
    );

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      const percentage = Math.round(
        (event.loaded / event.total) * 100
      );

      setUploadProgress(
        Math.min(percentage, 100)
      );
    };

    xhr.onload = () => {
      setUploading(false);

      if (
        xhr.status >= 200 &&
        xhr.status < 300
      ) {
        setUploadProgress(100);
        setSelectedFiles([]);

        // Refresh the current folder
        loadFiles(currentPath);

        return;
      }

      let response = {};

      try {
        response = JSON.parse(
          xhr.responseText || "{}"
        );
      } catch {
        response = {};
      }

      setUploadError(
        response.error ||
          `Upload failed (${xhr.status})`
      );
    };

    xhr.onerror = () => {
      setUploading(false);

      setUploadError(
        "Upload connection lost. Please try again."
      );
    };

    xhr.onabort = () => {
      setUploading(false);

      setUploadError(
        "Upload was cancelled."
      );
    };

    xhr.send(formData);
  }

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="home-page">

      {/* ======================================
          Header
      ======================================= */}

      <div className="home-header">

        <div>
          <h2>LANBox</h2>

          <p>
            {currentPath || "Your photos"}
          </p>
        </div>

        {currentPath && (
          <button
            type="button"
            className="back-button"
            onClick={goBack}
            disabled={loading}
          >
            ← Back
          </button>
        )}

      </div>

      {/* ======================================
          Breadcrumb
      ======================================= */}

      {currentPath && (
        <div className="folder-path">
          <button
            type="button"
            onClick={() => loadFiles("")}
          >
            Home
          </button>

          {currentPath
            .split("/")
            .filter(Boolean)
            .map((part, index, parts) => {
              const path =
                parts
                  .slice(0, index + 1)
                  .join("/");

              return (
                <span key={path}>
                  <span className="path-separator">
                    /
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      loadFiles(path)
                    }
                  >
                    {part}
                  </button>
                </span>
              );
            })}
        </div>
      )}

      {/* ======================================
          Upload error
      ======================================= */}

      {uploadError && (
        <div className="upload-error">
          {uploadError}
        </div>
      )}

      {/* ======================================
          Loading
      ======================================= */}

      {loading ? (
        <div className="files-loading">
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">▧</div>

          <h3>No images</h3>

          <p>
            Upload some photos to get started.
          </p>
        </div>
      ) : (
        /* ====================================
           Files grid
        ===================================== */

        <div className="files-grid">

          {items.map((item) => {

            // -------------------------------
            // Folder
            // -------------------------------

            if (item.type === "folder") {
              return (
                <button
                  type="button"
                  className="file-card folder-card"
                  key={item.path}
                  onClick={() =>
                    openFolder(item)
                  }
                >
                  <div className="folder-icon">
                    📁
                  </div>

                  <div className="file-card-info">
                    <strong title={item.name}>
                      {item.name}
                    </strong>

                    <span>Folder</span>
                  </div>
                </button>
              );
            }

            // -------------------------------
            // Image
            // -------------------------------

            if (isImageFile(item.name)) {
              return (
                <div
                  className="file-card image-card"
                  key={item.path}
                >
                  <img
                    src={getImageUrl(item)}
                    alt={item.name}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display =
                        "none";
                    }}
                  />

                  <div className="image-card-info">
                    <strong title={item.name}>
                      {item.name}
                    </strong>

                    <span>
                      {formatBytes(item.size)}
                    </span>
                  </div>
                </div>
              );
            }

            return null;
          })}

        </div>
      )}

      {/* ======================================
          Upload progress
      ======================================= */}

      {uploading && (
        <div className="upload-floating-status">

          <div className="upload-status-top">
            <span>
              Uploading {selectedFiles.length}{" "}
              {selectedFiles.length === 1
                ? "image"
                : "images"}
            </span>

            <strong>
              {uploadProgress}%
            </strong>
          </div>

          <div className="upload-progress-track">
            <div
              className="upload-progress-bar"
              style={{
                width: `${uploadProgress}%`,
              }}
            />
          </div>

        </div>
      )}

      {/* ======================================
          Floating upload button
      ======================================= */}

      <label
        className={`floating-upload-button ${
          uploading ? "uploading" : ""
        }`}
        title="Upload photos"
      >
        <span className="floating-upload-icon">
          ↑
        </span>

        <span className="floating-upload-text">
          {uploading
            ? `${uploadProgress}%`
            : "Upload"}
        </span>

        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={uploading}
          onChange={handleFileSelect}
        />
      </label>

    </div>
  );
}

export default Home;
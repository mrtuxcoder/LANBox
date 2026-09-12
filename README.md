# LANBox

LANBox is a **local, self-hosted file-sharing and storage application** that works like a private Google Drive on your local network.

The **server device provides the storage**, and every client device connected to the same network can access the shared storage through a web browser. Clients can upload, browse, organize, preview, download, rename, and delete files and folders.

Unlike cloud storage, the files remain on your own server device and are accessible to connected devices over the local network.

## Features

- Local, private cloud-style file storage
- Access the same shared storage from multiple devices on the same network
- Upload multiple files with resumable 8 MB chunks
- Upload images, videos, and files with a valid extension
- Upload files up to 5 GB each
- Upload up to 50 files with a maximum batch size of 5 GB
- Retry interrupted upload chunks
- Display upload progress, active filenames, and transfer speed
- Browse files by Images, Videos, Music, Documents, and Others
- Preview supported images and videos
- Download one file directly
- Download multiple files normally or as a ZIP archive
- Create, rename, and delete folders and files
- Use grid or list views
- Sort files by name, date, or size
- Configure the server's storage location using `.env`
- Access LANBox from phones, laptops, tablets, and other devices connected to the same network

## How LANBox Works

LANBox uses a **server-client architecture**.

The server device stores the actual files. Client devices connect to the LANBox web interface and access the same shared storage.

```text
                    Local Network / Wi-Fi
                           │
             ┌─────────────┴─────────────┐
             │                           │
        LANBox Server               Client Devices
             │                  ┌────────┼────────┐
             │                  │        │        │
       Storage Folder         Phone    Laptop   Tablet
             │                  │        │        │
             └──────────────────┴────────┴────────┘
                           │
                    Shared File Space
```

For example, if a file is uploaded from a phone, the file is stored on the server. Another laptop connected to LANBox can immediately see and download that same file.

This makes LANBox work like a **local Google Drive**, where the server acts as the private cloud storage.

## Requirements

- Node.js 18 or newer
- npm
- Devices connected to the same local network

## Project Structure

```text
LANBox/
├── client/                 React and Vite frontend
│   └── src/
└── server/                 Express backend
    ├── controllers/        API controllers and storage helpers
    ├── routes/              API route registration
    ├── .env                Local server configuration
    └── server.js            Server entry point
```

## Configuration

Server configuration is stored in `server/.env`:

```env
STORAGE_PATH=/home/username/lanbox
PORT=3000
```

`STORAGE_PATH` is the directory used as LANBox's shared storage.

All connected clients access files and folders from this storage through the LANBox interface. Uploads, downloads, previews, folder creation, rename, and delete operations are performed within this directory.

The directory is created automatically if it does not exist.

> Do not commit personal paths, credentials, or private configuration values.

## Installation

Install dependencies in both applications:

```bash
cd server
npm install

cd ../client
npm install
```

## Development

Start the backend:

```bash
cd server
npm run dev
```

Start the frontend in a second terminal:

```bash
cd client
npm run dev
```

The frontend runs on port `5173` and the API runs on port `3000` by default.

When the server starts, it prints the available LAN URLs and a QR code.

Open the frontend URL on any phone, laptop, tablet, or other device connected to the same network.

All connected clients will access the **same shared storage provided by the LANBox server**.

## Example

Suppose your laptop is running the LANBox server and has this storage:

```text
LANBox Storage/
├── Photos/
│   ├── vacation.jpg
│   └── family.jpg
├── Documents/
│   └── report.pdf
└── Videos/
    └── movie.mp4
```

A phone connected to the same Wi-Fi can open LANBox and see:

```text
Photos
Documents
Videos
```

The phone can then:

- Upload new files
- Download existing files
- Create folders
- Rename files and folders
- Delete files and folders
- Preview supported images and videos

If another laptop connects to the same LANBox server, it sees the **same files and folders**.

There is one shared storage space rather than separate storage spaces for each client.

## Production Build

Build the frontend:

```bash
cd client
npm run build
```

Start the backend:

```bash
cd server
npm start
```

For production deployment, place the application behind HTTPS and configure a process manager or service supervisor to restart the server automatically.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api` | API status |
| `GET` | `/api/files?path=` | List the current folder |
| `GET` | `/api/image?path=` | Preview an image or video |
| `GET` | `/api/download?path=` | Download one file |
| `POST` | `/api/download/multiple` | Download multiple files normally or as ZIP |
| `POST` | `/api/upload` | Legacy single-request upload |
| `POST` | `/api/upload/chunk` | Resumable chunk upload |
| `POST` | `/api/folder` | Create a folder |
| `PATCH` | `/api/item` | Rename a file or folder |
| `DELETE` | `/api/item` | Delete a file or folder |
| `GET` | `/health` | Server health check |

Multiple downloads accept JSON like:

```json
{
  "files": [
    "Images/photo.jpg",
    "Documents/report.pdf"
  ],
  "format": "zip"
}
```

Use `"format": "normal"` to receive validated individual download URLs.

## Transfer Limits

- Maximum single file size: 5 GB
- Maximum multiple-file count: 50
- Maximum multiple-file total size: 5 GB
- Maximum resumable chunk size: 16 MB
- Client upload chunk size: 8 MB

Keep the browser page open during uploads.

If the network connection drops, the current chunk is retried and the resumable upload can continue from the last completed chunk.

## Security Notes

- All requested paths are resolved beneath `STORAGE_PATH`
- Paths outside the configured storage directory are rejected
- Uploaded names are cleaned before writing to disk
- Only files with a valid extension are accepted for upload and download
- LANBox is intended for use on trusted local networks
- Add authentication and HTTPS before exposing LANBox beyond a private LAN

## Validation

Frontend build:

```bash
cd client
npm run build
```

Backend syntax checks:

```bash
cd server
node --check server.js
node --check routes/api.js
```

## Summary

LANBox provides a **private cloud-like file storage experience without using an external cloud service**.

The server stores the files, while multiple devices connected to the same local network can access and manage the shared storage through a browser.

**In simple terms:**

> **Your computer becomes the cloud, and LANBox lets every connected device use that storage like a local Google Drive.**
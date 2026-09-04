# LANBox

LANBox is a local-network file sharing application. It provides a browser-based interface for uploading, browsing, organizing, and downloading files between devices on the same network.

## Features

- Upload multiple files with resumable 8 MB chunks.
- Upload images, videos, and files with a valid extension.
- Upload files up to 5 GB each.
- Upload up to 50 files with a maximum batch size of 5 GB.
- Retry interrupted upload chunks.
- Display upload progress, active filenames, and transfer speed.
- Browse files by Images, Videos, Music, Documents, and Others.
- Preview supported images and videos.
- Download one file directly or download multiple files normally or as a ZIP archive.
- Create, rename, and delete folders and files.
- Use grid or list views with sorting by name, date, or size.
- Configure storage using `.env` instead of a hard-coded path.

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

`STORAGE_PATH` is the directory used for file listing, uploads, downloads, previews, folder creation, rename, and delete operations. The directory is created automatically if it does not exist.

Do not commit personal paths, credentials, or private configuration values.

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

The frontend runs on port `5173` and the API runs on port `3000` by default. The server prints the LAN URLs and a QR code when it starts. Open the frontend URL on a phone or another computer connected to the same network.

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
  "files": ["Images/photo.jpg", "Documents/report.pdf"],
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

Keep the browser page open during uploads. If the network connection drops, the current chunk is retried and the resumable upload can continue from the last completed chunk.

## Security Notes

- All requested paths are resolved beneath `STORAGE_PATH`.
- Paths outside the configured storage directory are rejected.
- Uploaded names are cleaned before writing to disk.
- Only files with a valid extension are accepted for upload and download.
- Use LANBox only on networks you trust, or add authentication and HTTPS before exposing it beyond a private LAN.

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

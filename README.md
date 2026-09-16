# LANBox

LANBox is a **local, self-hosted file-sharing and storage application**
that works like a private Google Drive on your local network.

The **server device provides the storage**, and every client device
connected to the same network can access the shared storage through a
web browser. Clients can upload, browse, organize, preview, download,
rename, and delete files and folders.

Unlike cloud storage, the files remain on your own server device and are
accessible to connected devices over the local network.

## Features

-   Local, private cloud-style file storage
-   Access the same shared storage from multiple devices on the same
    network
-   Upload multiple files with resumable 8 MB chunks
-   Upload images, videos, and files with a valid extension
-   Upload files up to 5 GB each
-   Upload up to 50 files with a maximum batch size of 5 GB
-   Retry interrupted upload chunks
-   Display upload progress, active filenames, and transfer speed
-   Browse files by Images, Videos, Music, Documents, and Others
-   Preview supported images and videos
-   Download one file directly
-   Download multiple files normally or as a ZIP archive
-   Create, rename, and delete folders and files
-   Use grid or list views
-   Sort files by name, date, or size
-   Configure the server's storage location using `.env`
-   Access LANBox from phones, laptops, tablets, and other devices
    connected to the same network

## How LANBox Works

LANBox runs as **two Docker containers**:

- **Frontend** — provides the web interface.
- **Backend** — handles file storage and API operations.

Only **port 80** is exposed outside Docker. You access LANBox from another device using the server's local IP address:

```text
http://SERVER-IP
```

All files are stored on the LANBox server and can be accessed by devices connected to the same local network.

## Requirements

- Linux server
- Docker
- Docker Compose
- Devices connected to the same local network

## Project Structure

``` text
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

The Docker installation uses:

```text
/opt/lanbox/.env
```

The installer creates this file automatically.

Example:

```env
PUID=1000
PGID=1000
STORAGE_PATH=/home/username
```

`STORAGE_PATH` controls where LANBox stores files.

You can edit `/opt/lanbox/.env` and change `STORAGE_PATH` to a specific directory:

```env
PUID=1000
PGID=1000
STORAGE_PATH=/path/to/your/storage
```

After changing the storage path, restart LANBox:

```bash
cd /opt/lanbox
sudo docker compose down
sudo docker compose up -d
```

> Keep `.env` private. Do not commit personal paths or private configuration values.

## Installation

LANBox is installed using the included `install.sh` script.

### 1. Install Docker

Docker must be installed **before** running the LANBox installer.

The installer does not install Docker.

Follow Docker's official installation guide for your Linux distribution:

- [Docker Engine installation guide](https://docs.docker.com/engine/install/)
- [Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Fedora](https://docs.docker.com/engine/install/fedora/)

Verify Docker:

```bash
sudo docker --version
sudo docker compose version
```

### 2. Download LANBox

```bash
git clone https://github.com/mrtuxcoder/LANBox.git
cd LANBox
```

### 3. Run the installer

```bash
chmod +x install.sh
sudo ./install.sh
```

The installer will:

1. Check that Docker is installed.
2. Enable and start Docker.
3. Check Docker Compose.
4. Create `/opt/lanbox`.
5. Create the `.env` file with the current user's UID, GID, and home directory.
6. Download the LANBox Docker configuration.
7. Pull the LANBox images.
8. Start the two LANBox containers.
9. Display the local IP address to use for accessing LANBox.

### 4. Access LANBox

After installation, the script displays an address such as:

```text
http://192.168.1.50
```

Open that address from any phone, laptop, tablet, or other device connected to the **same local network**.

To find the server's IP address manually:

```bash
ip addr
```

Only port **80** needs to be accessed from the local network.

### Installation files

The installer stores the deployment files in:

```text
/opt/lanbox
```

Useful commands:

```bash
cd /opt/lanbox

sudo docker compose ps
sudo docker compose logs
sudo docker compose restart
sudo docker compose down
```

## Example

Suppose your laptop is running the LANBox server and has this storage:

``` text
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

``` text
Photos
Documents
Videos
```

The phone can then:

-   Upload new files
-   Download existing files
-   Create folders
-   Rename files and folders
-   Delete files and folders
-   Preview supported images and videos

If another laptop connects to the same LANBox server, it sees the **same
files and folders**.

There is one shared storage space rather than separate storage spaces
for each client.

## Transfer Limits

-   Maximum single file size: 5 GB
-   Maximum multiple-file count: 50
-   Maximum multiple-file total size: 5 GB
-   Maximum resumable chunk size: 16 MB
-   Client upload chunk size: 8 MB

Keep the browser page open during uploads.

If the network connection drops, the current chunk is retried and the
resumable upload can continue from the last completed chunk.

## Security Notes

-   All requested paths are resolved beneath `STORAGE_PATH`
-   Paths outside the configured storage directory are rejected
-   Uploaded names are cleaned before writing to disk
-   Only files with a valid extension are accepted for upload and
    download
-   LANBox is intended for use on trusted local networks
-   Add authentication and HTTPS before exposing LANBox beyond a private
    LAN

## Summary

LANBox provides a **private cloud-like file storage experience without
using an external cloud service**.

The server stores the files, while multiple devices connected to the
same local network can access and manage the shared storage through a
browser.

**In simple terms:**

> **Your computer becomes the cloud, and LANBox lets every connected
> device use that storage like a local Google Drive.**

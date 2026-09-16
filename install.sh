#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# LANBox Installer
#
# Requirements:
#   - Docker must already be installed
#   - Docker Compose must already be available
#
# This installer does NOT install Docker.
# This installer does NOT pass any IP address to the backend.
# ============================================================


# ============================================================
# Configuration
# ============================================================

APP_NAME="LANBox"
INSTALL_DIR="/opt/lanbox"

COMPOSE_URL="https://raw.githubusercontent.com/mrtuxcoder/LANBox/refs/heads/main/docker-compose.yml"


# ============================================================
# Output helpers
# ============================================================

info() {
    echo "[INFO] $1"
}

success() {
    echo "[ OK ] $1"
}

warning() {
    echo "[WARN] $1"
}

error() {
    echo "[ERROR] $1" >&2
}


# ============================================================
# Error handling
# ============================================================

on_error() {
    error "Installation failed."
    error "Line: $1"
}

trap 'on_error $LINENO' ERR


# ============================================================
# Root check
# ============================================================

check_root() {

    if [ "$EUID" -ne 0 ]; then
        error "This installer must be run with root privileges."

        echo
        echo "Run:"
        echo
        echo "    sudo ./install.sh"
        echo

        exit 1
    fi
}


# ============================================================
# Detect the user who started the installer
# ============================================================

detect_user() {

    # When running through sudo, SUDO_USER contains
    # the original user who launched the command.
    if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
        INSTALL_USER="$SUDO_USER"
    else
        INSTALL_USER="$(logname 2>/dev/null || echo root)"
    fi


    # Make sure the user actually exists.
    if ! id "$INSTALL_USER" >/dev/null 2>&1; then
        error "Could not determine the installation user."
        exit 1
    fi


    INSTALL_UID="$(id -u "$INSTALL_USER")"
    INSTALL_GID="$(id -g "$INSTALL_USER")"
    INSTALL_HOME="$(getent passwd "$INSTALL_USER" | cut -d: -f6)"


    if [ -z "$INSTALL_HOME" ]; then
        error "Could not determine home directory for $INSTALL_USER."
        exit 1
    fi


    info "Installation user : $INSTALL_USER"
    info "User ID            : $INSTALL_UID"
    info "Group ID           : $INSTALL_GID"
    info "Home directory     : $INSTALL_HOME"
}


# ============================================================
# Check Docker
# ============================================================

check_docker() {

    info "Checking Docker..."

    if ! command -v docker >/dev/null 2>&1; then

        error "Docker is not installed."

        echo
        echo "Please install Docker first."
        echo
        echo "Then run this installer again:"
        echo
        echo "    sudo ./install.sh"
        echo

        exit 1
    fi

    success "Docker is installed."

    docker --version
}


# ============================================================
# Enable and start Docker
# ============================================================

start_docker() {

    info "Checking Docker service..."

    if ! command -v systemctl >/dev/null 2>&1; then
        error "systemctl is not available."
        error "This installer requires a systemd-based Linux system."
        exit 1
    fi


    info "Enabling Docker service..."

    systemctl enable docker


    info "Starting Docker service..."

    systemctl start docker


    if systemctl is-active --quiet docker; then
        success "Docker service is running."
    else
        error "Docker service failed to start."

        systemctl status docker --no-pager || true

        exit 1
    fi
}


# ============================================================
# Check Docker Compose
# ============================================================

check_compose() {

    info "Checking Docker Compose..."

    if docker compose version >/dev/null 2>&1; then

        success "Docker Compose is available."

        docker compose version

    else

        error "Docker Compose is not available."

        echo
        echo "Please install Docker Compose."
        echo "Then run this installer again."
        echo

        exit 1
    fi
}


# ============================================================
# Prepare LANBox directory
# ============================================================

prepare_directory() {

    info "Preparing LANBox installation directory..."

    mkdir -p "$INSTALL_DIR"

    chown "$INSTALL_UID:$INSTALL_GID" "$INSTALL_DIR"

    chmod 755 "$INSTALL_DIR"

    success "Installation directory: $INSTALL_DIR"
}


# ============================================================
# Create .env
# ============================================================

create_env_file() {

    info "Creating LANBox environment file..."

    cat > "$INSTALL_DIR/.env" <<EOF
PUID=$INSTALL_UID
PGID=$INSTALL_GID
STORAGE_PATH=$INSTALL_HOME
EOF


    chmod 600 "$INSTALL_DIR/.env"


    success "Created $INSTALL_DIR/.env"

    echo
    echo "Environment:"
    echo "  PUID=$INSTALL_UID"
    echo "  PGID=$INSTALL_GID"
    echo "  STORAGE_PATH=$INSTALL_HOME"
    echo
}


# ============================================================
# Download LANBox Compose file
# ============================================================

download_compose_file() {

    info "Downloading LANBox deployment configuration..."

    curl \
        --fail \
        --silent \
        --show-error \
        --location \
        "$COMPOSE_URL" \
        -o "$INSTALL_DIR/docker-compose.yml"


    if [ ! -s "$INSTALL_DIR/docker-compose.yml" ]; then
        error "Downloaded docker-compose.yml is empty."
        exit 1
    fi


    success "LANBox Compose file downloaded."
}


# ============================================================
# Validate Compose configuration
# ============================================================

validate_compose() {

    info "Validating Docker Compose configuration..."

    cd "$INSTALL_DIR"

    docker compose config >/dev/null

    success "Compose configuration is valid."
}


# ============================================================
# Pull LANBox images
# ============================================================

pull_images() {

    info "Pulling LANBox images from GHCR..."

    cd "$INSTALL_DIR"

    docker compose pull

    success "LANBox images pulled successfully."
}


# ============================================================
# Start LANBox
# ============================================================

start_lanbox() {

    info "Starting LANBox containers..."

    cd "$INSTALL_DIR"

    docker compose up -d

    success "LANBox containers started."
}


# ============================================================
# Verify LANBox
# ============================================================

verify_lanbox() {

    info "Checking LANBox containers..."

    cd "$INSTALL_DIR"

    docker compose ps

    echo

    if docker compose ps --status running | grep -q .; then
        success "LANBox is running."
    else

        warning "LANBox containers are not running."

        echo

        docker compose ps

        echo

        info "Recent container logs:"

        docker compose logs --tail=50

        exit 1
    fi
}


# ============================================================
# Show installation information
# ============================================================

show_information() {

    # Detect the IPv4 address used by the default route.
    LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '
        {
            for (i = 1; i <= NF; i++) {
                if ($i == "src") {
                    print $(i+1)
                    exit
                }
            }
        }
    ')"

    echo

    echo "=============================================="
    echo "       LANBox Installation Complete"
    echo "=============================================="

    echo

    echo "LANBox is running successfully."

    echo

    echo "Installation directory:"
    echo
    echo "    $INSTALL_DIR"

    echo

    echo "Storage directory:"
    echo
    echo "    $INSTALL_HOME"

    echo

    echo "=============================================="
    echo "          Access LANBox"
    echo "=============================================="

    if [ -n "$LAN_IP" ]; then

        echo
        echo "Open LANBox from any device on your local network:"
        echo
        echo "    http://$LAN_IP"
        echo

        echo "Make sure the device is connected to the same"
        echo "local network as this server."

    else

        echo
        warning "Could not automatically determine the active IP address."
        echo
        echo "Run:"
        echo
        echo "    ip addr"
        echo
        echo "Find the server's local IPv4 address and open:"
        echo
        echo "    http://<SERVER-IP>"

    fi

    echo

    echo "To view network addresses manually:"
    echo
    echo "    ip addr"

    echo

    echo "=============================================="
    echo "          Useful Docker Commands"
    echo "=============================================="

    echo
    echo "    cd $INSTALL_DIR"
    echo
    echo "    sudo docker compose ps"
    echo
    echo "    sudo docker compose logs"
    echo
    echo "    sudo docker compose restart"
    echo
    echo "    sudo docker compose down"

    echo

    echo "=============================================="
    echo
}


# ============================================================
# Main
# ============================================================

main() {

    echo
    echo "=============================================="
    echo "              LANBox Installer"
    echo "=============================================="
    echo

    check_root

    detect_user

    check_docker

    start_docker

    check_compose

    prepare_directory

    create_env_file

    download_compose_file

    validate_compose

    pull_images

    start_lanbox

    verify_lanbox

    show_information
}


# ============================================================
# Run installer
# ============================================================

main "$@"
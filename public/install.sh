#!/bin/bash

# MCLC Installer Script
# Works on Linux and macOS

set -e

REPO="MCLC-Client/MCLC-Client"
BASE_URL="https://github.com/$REPO/releases/latest/download"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "--- MCLC Installer ---"
echo "Detected OS: $OS ($ARCH)"

case "$OS" in
    Linux)
        FILENAME="MCLC-setup.AppImage"
        DOWNLOAD_URL="$BASE_URL/$FILENAME"
        TARGET_DIR="$HOME/.local/bin"
        mkdir -p "$TARGET_DIR"
        TARGET_PATH="$TARGET_DIR/mclc"
        
        echo "Downloading $FILENAME..."
        curl -L "$DOWNLOAD_URL" -o "$TARGET_PATH"
        chmod +x "$TARGET_PATH"
        
        echo ""
        echo "Successfully installed MCLC to $TARGET_PATH"
        echo "You can now run 'mclc' if $TARGET_DIR is in your PATH."
        ;;
    Darwin)
        FILENAME="MCLC-setup.zip"
        DOWNLOAD_URL="$BASE_URL/$FILENAME"
        
        echo "Downloading $FILENAME..."
        curl -L "$DOWNLOAD_URL" -o "MCLC-setup.zip"
        
        echo "Unpacking..."
        unzip -q "MCLC-setup.zip" -d "MCLC-App"
        
        echo ""
        echo "Successfully downloaded MCLC."
        echo "You can find it in the 'MCLC-App' folder."
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

echo "----------------------"

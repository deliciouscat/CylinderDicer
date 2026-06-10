#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${1:-$ROOT_DIR/play/build/default}"
TARGET_DIR="$ROOT_DIR/web/public/play"

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -R "$SOURCE_DIR"/. "$TARGET_DIR"/

echo "Copied Defold HTML5 build from $SOURCE_DIR to $TARGET_DIR"

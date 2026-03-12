#!/data/data/com.termux/files/usr/bin/bash
# install.sh — Install pal into Termux
set -euo pipefail

PAL_DIR="${HOME}/.pal"
BIN_DIR="${PAL_DIR}/bin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Installing pal..."

# 1. Install system deps
echo "==> Installing Node.js & build tools..."
pkg install -y nodejs python make

# 2. Install npm deps
echo "==> Installing npm dependencies..."
cd "$PROJECT_DIR"
npm install

# 3. Build TypeScript
echo "==> Building TypeScript..."
npm run build

# 4. Set up ~/.pal directory
echo "==> Setting up ~/.pal..."
mkdir -p "$BIN_DIR"

# 5. Link binary
ln -sf "${PROJECT_DIR}/dist/index.js" "${BIN_DIR}/pal"
chmod +x "${PROJECT_DIR}/dist/index.js"

# 6. Copy shell script
cp "${SCRIPT_DIR}/pal.sh" "${BIN_DIR}/pal.sh"
chmod +x "${BIN_DIR}/pal.sh"

# 7. Create .env if missing
if [[ ! -f "${PAL_DIR}/.env" ]]; then
  cp "${PROJECT_DIR}/.env.example" "${PAL_DIR}/.env"
  echo ""
  echo "==> Created ${PAL_DIR}/.env — add your GEMINI_API_KEY before using pal!"
else
  echo "==> ${PAL_DIR}/.env already exists, skipping"
fi

echo ""
echo "✓ pal installed to ${BIN_DIR}/pal"
echo ""
echo "Next steps:"
echo "  1. Edit ~/.pal/.env and set GEMINI_API_KEY"
echo "  2. In Tasker: New Task → Termux:Tasker → pal.sh, args: %SMSRF %SMSTXT"
echo "  3. Test: PAL_DRY_RUN=true pal -f '+1234' -b 'hello'"

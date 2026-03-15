#!/bin/bash
# ─── SafeGuard Setup Script ───────────────────────────────────────────────────
# Run once after cloning: bash setup.sh
# What it does:
#   1. Detects your machine's local IP
#   2. Patches localhost:3001 → your real IP in all HTML files
#   3. Patches App.js API_URL
#   4. Copies HTML pages to sos-backend/public/
#   5. Installs npm dependencies

set -e

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    🛡  SafeGuard Setup                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Detect local IP ────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
else
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
fi

info "Detected local IP: $LOCAL_IP"
echo ""
echo -e "Is this correct? (your phone must be on the same WiFi)"
read -p "Press ENTER to use $LOCAL_IP, or type a different IP: " CUSTOM_IP
if [ -n "$CUSTOM_IP" ]; then
  LOCAL_IP="$CUSTOM_IP"
fi
success "Using IP: $LOCAL_IP"

# ── 2. Check directory structure ──────────────────────────────────────────────
BACKEND_DIR="sos-backend"
APP_DIR="sos-app"

if [ ! -d "$BACKEND_DIR" ]; then
  error "sos-backend/ not found. Run this script from the project root."
fi

mkdir -p "$BACKEND_DIR/public"
mkdir -p "$BACKEND_DIR/routes"
mkdir -p "$BACKEND_DIR/uploads/audio"

# ── 3. Copy HTML pages to public/ ────────────────────────────────────────────
info "Copying HTML pages to $BACKEND_DIR/public/ ..."

PAGES=("safety-map/index.html:map.html" "safety-circle/index.html:circle.html" "admin-dashboard/index.html:admin.html")
for PAGE in "${PAGES[@]}"; do
  SRC="${PAGE%%:*}"
  DST="${PAGE##*:}"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$BACKEND_DIR/public/$DST"
    success "  $SRC → public/$DST"
  else
    warn "  Not found: $SRC (skipping)"
  fi
done

# ── 4. Patch localhost → real IP in all HTML files ────────────────────────────
info "Patching backend URLs in HTML files ..."

for FILE in "$BACKEND_DIR/public"/*.html; do
  if [ -f "$FILE" ]; then
    # Replace localhost:3001 and 127.0.0.1:3001 with real IP
    sed -i.bak \
      -e "s|http://localhost:3001|http://$LOCAL_IP:3001|g" \
      -e "s|http://127.0.0.1:3001|http://$LOCAL_IP:3001|g" \
      "$FILE"
    rm -f "${FILE}.bak"
    success "  Patched: $(basename $FILE)"
  fi
done

# ── 5. Patch App.js ───────────────────────────────────────────────────────────
APP_JS="$APP_DIR/App.js"
if [ -f "$APP_JS" ]; then
  info "Patching $APP_JS ..."
  sed -i.bak \
    -e "s|http://YOUR_SERVER_IP:3001|http://$LOCAL_IP:3001|g" \
    -e "s|http://localhost:3001|http://$LOCAL_IP:3001|g" \
    "$APP_JS"
  rm -f "${APP_JS}.bak"
  success "  API_URL set to http://$LOCAL_IP:3001"
else
  warn "  $APP_JS not found — set API_URL manually"
fi

# ── 6. Set up .env ────────────────────────────────────────────────────────────
ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "Creating $ENV_FILE from template ..."
  cat > "$ENV_FILE" << EOF
PORT=3001
BASE_URL=http://$LOCAL_IP:3001
TWILIO_SID=
TWILIO_TOKEN=
TWILIO_FROM=
GOOGLE_MAPS_KEY=
EOF
  success "  $ENV_FILE created"
  warn "  Add your Twilio keys to $ENV_FILE to enable real SMS"
else
  # Just update BASE_URL in existing .env
  sed -i.bak "s|BASE_URL=.*|BASE_URL=http://$LOCAL_IP:3001|g" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
  success "  Updated BASE_URL in existing .env"
fi

# ── 7. Install backend dependencies ──────────────────────────────────────────
info "Installing backend dependencies ..."
cd "$BACKEND_DIR"
npm install express socket.io cors twilio multer dotenv 2>&1 | tail -3
success "Backend packages installed"
cd ..

# ── 8. Install app dependencies ───────────────────────────────────────────────
if [ -d "$APP_DIR" ]; then
  info "Installing Expo app dependencies ..."
  cd "$APP_DIR"
  npm install 2>&1 | tail -3
  success "App packages installed"
  cd ..
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ Setup Complete!                       ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Start backend:                                  ║${NC}"
echo -e "${GREEN}║    cd sos-backend && node server.js              ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║  Start mobile app:                               ║${NC}"
echo -e "${GREEN}║    cd sos-app && npx expo start                  ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║  Open in browser (same WiFi):                    ║${NC}"
echo -e "${GREEN}║    http://$LOCAL_IP:3001/admin.html       ║${NC}"
echo -e "${GREEN}║    http://$LOCAL_IP:3001/circle.html      ║${NC}"
echo -e "${GREEN}║    http://$LOCAL_IP:3001/map.html         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Optional: Add Twilio keys to sos-backend/.env for real SMS${NC}"
echo ""

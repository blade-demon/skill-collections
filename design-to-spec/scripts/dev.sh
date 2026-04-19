#!/usr/bin/env bash

set -euo pipefail

PORT="${PORT:-8000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Serving design-to-spec docs from: ${ROOT_DIR}"
echo "URL: http://127.0.0.1:${PORT}/README.md"

cd "${ROOT_DIR}"
exec python3 -m http.server "${PORT}"

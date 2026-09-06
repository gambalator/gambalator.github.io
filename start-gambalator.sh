#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

if ! command -v mise >/dev/null 2>&1; then
  echo "Gambalator requires mise: https://mise.jdx.dev/"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing frontend dependencies for the first run..."
  mise run setup
fi

app_port="${GAMBALATOR_PORT:-5741}"
echo "Starting Gambalator at http://127.0.0.1:${app_port}"
mise run local

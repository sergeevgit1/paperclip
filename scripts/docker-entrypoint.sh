#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}

# Adjust the node user's UID/GID if they differ from the runtime request
# and fix volume ownership only when a remap is needed
changed=0

if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
fi

if [ "$changed" = "1" ]; then
    chown -R node:node /paperclip
fi

OPENCODE_CONFIG=/paperclip/.config/opencode/opencode.json
if [ -f "$OPENCODE_CONFIG" ]; then
    python3 - <<'PY'
import json
from pathlib import Path

config_path = Path("/paperclip/.config/opencode/opencode.json")
try:
    data = json.loads(config_path.read_text())
except Exception:
    raise SystemExit(0)

if isinstance(data, dict) and "providers" in data:
    del data["providers"]
    if not isinstance(data.get("$schema"), str) or not data["$schema"].strip():
        data["$schema"] = "https://opencode.ai/config.json"
    config_path.write_text(json.dumps(data, indent=2) + "\n")
PY
fi
exec gosu node "$@"

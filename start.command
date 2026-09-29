#!/bin/sh
# VerseOrchestrator — start the app on macOS: double-click this file in Finder.
here=$(dirname "$0")
# a release folder (npm run portable, 0.14.0) keeps the app in app/ next to this file
if [ -f "$here/app/start.sh" ]; then
  # a downloaded archive is quarantined: once the user has opened this file, the app's own files
  # (Node, the SQLite module) may run too (0.14.1)
  if xattr -p com.apple.quarantine "$here/app/start.sh" >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "$here/app" 2>/dev/null
  fi
  exec sh "$here/app/start.sh" "$@"
fi
exec sh "$here/start.sh" "$@"

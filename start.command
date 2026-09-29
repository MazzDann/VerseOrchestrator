#!/bin/sh
# VerseOrchestrator — start the app on macOS: double-click this file in Finder.
here=$(dirname "$0")
# a release folder (npm run portable, 0.14.0) keeps the app in app/ next to this file
if [ -f "$here/app/start.sh" ]; then exec sh "$here/app/start.sh" "$@"; fi
exec sh "$here/start.sh" "$@"

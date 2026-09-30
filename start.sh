#!/bin/sh
# VerseOrchestrator — start the app on Linux: ./start.sh (macOS: double-click start.command).
# Everything else happens in server/src/launcher.ts (the same on every system).
cd "$(dirname "$0")" || exit 1
# a release folder (npm run portable, 0.14.0) keeps the app in app/ next to this file
if [ -f app/start.sh ]; then exec sh app/start.sh "$@"; fi
# a portable copy (npm run portable) carries its own Node, npm included
if [ -x ./node/bin/node ]; then PATH="$PWD/node/bin:$PATH"; export PATH; fi
if ! command -v node >/dev/null 2>&1; then
  echo "Не знайдено Node.js — він потрібен, щоб запустити VerseOrchestrator."
  if [ "$(uname)" = Darwin ]; then
    echo "Встановіть Node.js 24 LTS з https://nodejs.org (або: brew install node) і запустіть ще раз."
  else
    echo "Встановіть Node.js 24 LTS з https://nodejs.org, пакетом вашого дистрибутива"
    echo "або через nvm (https://github.com/nvm-sh/nvm) і запустіть ще раз."
  fi
  echo
  echo "Node.js not found — VerseOrchestrator needs it to start."
  if [ "$(uname)" = Darwin ]; then
    echo "Install Node.js 24 LTS from https://nodejs.org (or: brew install node) and run this again."
  else
    echo "Install Node.js 24 LTS from https://nodejs.org, your distribution's package,"
    echo "or nvm (https://github.com/nvm-sh/nvm) and run this again."
  fi
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24||a===23&&b>=6||a===22&&b>=18?0:1)"; then
  echo "Node.js $(node -v) застарий: потрібен 22.18 або новіший (краще 24 LTS) з https://nodejs.org"
  echo "Node.js $(node -v) is too old: 22.18 or later is needed (24 LTS is better) from https://nodejs.org"
  exit 1
fi
exec node --disable-warning=ExperimentalWarning server/src/launcher.ts "$@"

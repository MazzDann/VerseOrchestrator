#!/bin/sh
# VerseOrchestrator — start the app on Linux: ./start.sh (macOS: double-click start.command).
# Everything else happens in server/src/launcher.ts (the same on every system).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Не знайдено Node.js — він потрібен, щоб запустити VerseOrchestrator."
  if [ "$(uname)" = Darwin ]; then
    echo "Встановіть Node.js 24 LTS з https://nodejs.org (або: brew install node) і запустіть ще раз."
  else
    echo "Встановіть Node.js 24 LTS з https://nodejs.org, пакетом вашого дистрибутива"
    echo "або через nvm (https://github.com/nvm-sh/nvm) і запустіть ще раз."
  fi
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24||a===23&&b>=6||a===22&&b>=18?0:1)"; then
  echo "Node.js $(node -v) застарий: потрібен 22.18 або новіший (краще 24 LTS) з https://nodejs.org"
  exit 1
fi
exec node --disable-warning=ExperimentalWarning server/src/launcher.ts "$@"

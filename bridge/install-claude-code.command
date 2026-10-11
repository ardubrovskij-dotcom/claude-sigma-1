#!/bin/bash
# Подключает мост Claude for Figma by Dubrovskiy ко всем сессиям Claude Code на этом Mac
# (во всех репозиториях). Запуск: двойной щелчок в Finder или `bash install-claude-code.command`.
set -e
cd "$(dirname "$0")"
SERVER="$(pwd)/mcpb/server/index.js"

echo "== Claude for Figma by Dubrovskiy: установка моста для Claude Code =="

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Не найден Node.js — он нужен мосту в Claude Code."
  echo "Скачайте версию LTS с https://nodejs.org (файл .pkg), установите и запустите этот файл ещё раз."
  open "https://nodejs.org/en/download" 2>/dev/null || true
  read -r -p "Нажмите Enter, чтобы закрыть…" _
  exit 1
fi
echo "Node.js: $(node -v)"

if [ ! -f "$SERVER" ]; then
  echo "Не найден $SERVER — запускайте файл из папки bridge скачанного репозитория."
  read -r -p "Нажмите Enter, чтобы закрыть…" _
  exit 1
fi

if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope user claude-sigma >/dev/null 2>&1 || true
  claude mcp add --scope user claude-sigma -- node "$SERVER"
else
  # Claude Code без CLI в PATH (например, только вкладка Code в Claude Desktop):
  # записываем сервер в пользовательский конфиг ~/.claude.json напрямую, с резервной копией.
  node - "$SERVER" <<'JS'
const fs = require("fs"), path = require("path"), os = require("os");
const file = path.join(os.homedir(), ".claude.json");
let cfg = {};
if (fs.existsSync(file)) {
  fs.copyFileSync(file, file + ".backup-claude-sigma");
  cfg = JSON.parse(fs.readFileSync(file, "utf8"));
}
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers["claude-sigma"] = { type: "stdio", command: "node", args: [process.argv[2]], env: {} };
fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
console.log("Записано в " + file);
JS
fi

echo
echo "Готово. Перезапустите сессии Claude Code — инструменты figma_* появятся во всех репозиториях."
echo "Важно: сессия должна работать на этом Mac (локально), а не в облаке."
read -r -p "Нажмите Enter, чтобы закрыть…" _

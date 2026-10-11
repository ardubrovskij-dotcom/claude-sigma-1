#!/bin/bash
# Claude for Figma by Dubrovskiy — установка и обновление в один щелчок (macOS).
#
# 1. Переносит эту папку в ~/claude-sigma (постоянное место: пути в Figma и Claude не ломаются;
#    при обновлении старая версия уходит в Корзину).
# 2. Подключает мост ко всем репозиториям Claude Code (если есть Node.js).
# 3. Открывает установку расширения в Claude Desktop.
# 4. Готовит импорт плагина в Figma: путь к manifest.json — в буфере обмена.
#
# Запуск: двойной щелчок. Если macOS не даёт: правый щелчок → «Открыть»,
# или в Терминале: bash ~/Downloads/<папка>/setup.command

set -u
SRC="$(cd "$(dirname "$0")" && pwd)"
TARGET="${CLAUDE_SIGMA_HOME:-$HOME/claude-sigma}"
MANIFEST="$TARGET/figma-plugin/manifest.json"
SERVER="$TARGET/bridge/mcpb/server/index.js"
EXTENSION="$TARGET/bridge/claude-sigma.mcpb"
have() { command -v "$1" >/dev/null 2>&1; }
step() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok() { printf "  ✓ %s\n" "$1"; }
warn() { printf "  ! %s\n" "$1"; }
pause() { [ -n "${SETUP_NO_PAUSE:-}" ] || read -r -p $'\nНажмите Enter, чтобы закрыть…' _; }

echo "== Claude for Figma by Dubrovskiy: установка =="

# ---------- 1. Постоянное место ----------
step "1/4  Папка → $TARGET"
FIRST_INSTALL=1
[ -f "$MANIFEST" ] && FIRST_INSTALL=0
if [ "$SRC" = "$TARGET" ]; then
  ok "уже на месте"
else
  if [ -e "$TARGET" ]; then
    TRASH="$HOME/.Trash/claude-sigma-$(date +%Y%m%d-%H%M%S)"
    if mkdir -p "$HOME/.Trash" 2>/dev/null && mv "$TARGET" "$TRASH"; then
      ok "прошлая версия перемещена в Корзину"
    else
      warn "не удалось убрать старую $TARGET — закройте программы, использующие её, и запустите снова"
      pause; exit 1
    fi
  fi
  if have ditto; then ditto "$SRC" "$TARGET"; else cp -R "$SRC" "$TARGET"; fi
  ok "скопировано"
fi
# Файлы из интернета помечены карантином — снимаем, чтобы скрипты и расширение открывались.
have xattr && xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
chmod +x "$TARGET"/*.command "$TARGET"/bridge/*.command 2>/dev/null

# ---------- 2. Claude Code ----------
step "2/4  Claude Code: мост для всех репозиториев"
if ! have node; then
  warn "Node.js не найден — этот шаг пропущен (Claude Desktop работает и без него)."
  warn "Для Claude Code: установите LTS с https://nodejs.org и запустите setup.command ещё раз."
elif have claude; then
  claude mcp remove --scope user claude-sigma >/dev/null 2>&1
  if claude mcp add --scope user claude-sigma -- node "$SERVER" >/dev/null 2>&1; then
    ok "подключён через claude mcp (Node.js $(node -v))"
  else
    warn "claude mcp add не сработал — запустите вручную: claude mcp add --scope user claude-sigma -- node \"$SERVER\""
  fi
else
  if node - "$SERVER" <<'JS'
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
JS
  then ok "записан в ~/.claude.json (резервная копия: ~/.claude.json.backup-claude-sigma)"
  else warn "не удалось записать ~/.claude.json"
  fi
fi

# ---------- 3. Claude Desktop ----------
step "3/4  Claude Desktop: расширение"
if have open && open "$EXTENSION" 2>/dev/null; then
  ok "открыто окно установки — нажмите Install (при обновлении — Update)"
else
  warn "не удалось открыть автоматически — дважды щёлкните $EXTENSION"
fi

# ---------- 4. Figma ----------
step "4/4  Figma: плагин"
have pbcopy && printf "%s" "$MANIFEST" | pbcopy
if [ "$FIRST_INSTALL" = 0 ]; then
  ok "плагин уже был установлен из $TARGET — в Figma ничего делать не нужно, просто перезапустите плагин"
else
  have open && open -a "Figma" 2>/dev/null
  echo "  В Figma (откройте любой файл дизайна):"
  echo "    меню → Plugins → Development → Import plugin from manifest…"
  echo "    в окне выбора файла: ⌘ + Shift + G, затем ⌘ + V, Enter"
  echo "    (путь уже в буфере обмена: $MANIFEST)"
  echo "  Если в списке есть старые копии плагина — удалите их: Plugins → Development → Manage plugins in development."
fi

step "Готово"
echo "  В плагине Figma поставьте галочку «авто» и нажмите «Подключить» — точка станет зелёной."
echo "  Обновление в будущем: скачать новый ZIP и снова запустить setup.command."
pause

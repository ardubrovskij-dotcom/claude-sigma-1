#!/bin/bash
# Setup script облачного окружения Claude Code: подключает мост Claude for Figma by Dubrovskiy
# ко всем сессиям окружения (в любом репозитории). Вставьте в настройки окружения → Setup script:
#
#   curl -fsSL https://raw.githubusercontent.com/ardubrovskij-dotcom/claude-sigma/claude/modest-brahmagupta-flhzty/cloud/setup.sh | bash
#
# Нужна переменная окружения SIGMA_RELAY_URL=wss://<ваш-ретранслятор>/ws/<токен>
# (строка со стартовой страницы ретранслятора) и домен ретранслятора в Allowed domains.

set -u
REPO="${CLAUDE_SIGMA_REPO:-https://github.com/ardubrovskij-dotcom/claude-sigma.git}"
REF="${CLAUDE_SIGMA_REF:-claude/modest-brahmagupta-flhzty}"
DIR="${CLAUDE_SIGMA_DIR:-$HOME/.claude-sigma}"
log() { echo "[claude-sigma] $*"; }

# 1. Код моста (собранный файл лежит в репозитории — npm install не нужен)
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q --depth 1 origin "$REF" && git -C "$DIR" checkout -q -f FETCH_HEAD \
    || log "не удалось обновить $DIR — использую имеющуюся версию"
else
  rm -rf "$DIR"
  if ! git clone -q --depth 1 --branch "$REF" "$REPO" "$DIR"; then
    log "ОШИБКА: не удалось скачать $REPO ($REF). Репозиторий должен быть публичным, github.com — разрешён в сети окружения."
    exit 0 # не роняем запуск сессии
  fi
fi
SERVER="$DIR/bridge/mcpb/server/index.js"
[ -f "$SERVER" ] || { log "ОШИБКА: нет $SERVER"; exit 0; }

# 2. Обёртка запуска. Значения, известные при настройке (адрес ретранслятора, прокси и сертификат
#    контейнера), подставляются по умолчанию — на случай, если Claude Code передаст MCP-серверу
#    не всё окружение. Значения из окружения самой сессии имеют приоритет.
RUN="$DIR/run-bridge.sh"
# Значение для подстановки внутрь "…": экранируем только \ " $ `
q() { printf '%s' "$1" | sed 's/[\\"$`]/\\&/g'; }
{
  echo '#!/bin/bash'
  echo "export SIGMA_RELAY_URL=\"\${SIGMA_RELAY_URL:-$(q "${SIGMA_RELAY_URL:-}")}\""
  echo "export HTTPS_PROXY=\"\${HTTPS_PROXY:-$(q "${HTTPS_PROXY:-${https_proxy:-}}")}\""
  echo "export NO_PROXY=\"\${NO_PROXY:-$(q "${NO_PROXY:-${no_proxy:-}}")}\""
  echo "export NODE_EXTRA_CA_CERTS=\"\${NODE_EXTRA_CA_CERTS:-$(q "${NODE_EXTRA_CA_CERTS:-}")}\""
  echo "exec node $(q "$SERVER")"
} > "$RUN"
chmod +x "$RUN"

# 3. Регистрация на уровне пользователя — сервер виден во всех репозиториях окружения
if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope user claude-sigma >/dev/null 2>&1
  claude mcp add --scope user claude-sigma -- "$RUN" >/dev/null && log "мост подключён (claude mcp, scope user)"
else
  node - "$RUN" <<'JS' && log "мост подключён (~/.claude.json)"
const fs = require("fs"), path = require("path"), os = require("os");
const file = path.join(os.homedir(), ".claude.json");
const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers["claude-sigma"] = { type: "stdio", command: process.argv[2], args: [], env: {} };
fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
JS
fi

# 4. Навык project-to-figma — в пользовательские навыки, чтобы он был в любом репозитории
mkdir -p "$HOME/.claude/skills"
rm -rf "$HOME/.claude/skills/project-to-figma"
cp -R "$DIR/skills/project-to-figma" "$HOME/.claude/skills/project-to-figma" && log "навык project-to-figma установлен"

if [ -z "${SIGMA_RELAY_URL:-}" ]; then
  log "ВНИМАНИЕ: не задана SIGMA_RELAY_URL — добавьте её в переменные окружения (строка со стартовой страницы ретранслятора)."
else
  log "ретранслятор: ${SIGMA_RELAY_URL%/ws/*}/ws/…"
fi
exit 0

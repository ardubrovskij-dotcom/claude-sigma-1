# Claude for Figma by Dubrovskiy

Claude рисует в Figma по текстовому запросу: слайды, фреймворки, схемы, иконки. Работает через официальный Plugin API на любом тарифе Figma.

```
Claude Desktop / локальный Claude Code ── мост ──────────────────────┐
                                                                     ├──► плагин в Figma → макет
облачный Claude Code ── мост ── ретранслятор Cloudflare (relay/) ────┘
```

| Папка | Что это |
|---|---|
| `figma-plugin/` | Плагин Figma: выполняет команды в открытом файле |
| `bridge/` | MCP-мост: инструменты для Claude; готовое расширение `bridge/claude-sigma.mcpb` |
| `relay/` | Ретранслятор для облачных сессий (Cloudflare Workers) |
| `cloud/setup.sh` | Setup script облачного окружения: мост + навык во всех репозиториях |
| `.claude/skills/figma-sigma-draw/` | Правила команд и вёрстки слайдов (встроены и в мост) |
| `skills/project-to-figma/` | Навык: контекст проекта → стиль → бриф → макет в Figma ([skills/README.md](skills/README.md)) |

## Установка и обновление (macOS)

1. Скачать: https://github.com/ardubrovskij-dotcom/claude-sigma/archive/refs/heads/claude/modest-brahmagupta-flhzty.zip и распаковать.
2. Дважды щёлкнуть **`setup.command`** (macOS не даёт — правый щелчок → «Открыть»). Он перенесёт папку в `~/claude-sigma`, подключит мост к Claude Code во всех репозиториях и откроет установку расширения.
3. В Claude Desktop нажать **Install**.
4. Только при первой установке — в Figma: **Plugins → Development → Import plugin from manifest…** → ⌘⇧G → ⌘V (путь уже в буфере) → Enter.
5. В плагине: галочка **«авто»** → **Подключить**.

Обновление — те же шаги 1–3: новый ZIP и `setup.command`; в Figma ничего не нужно.

Навык `project-to-figma` — Claude Desktop → **Settings → Capabilities → Skills → Upload skill** → `~/claude-sigma/skills/dist/project-to-figma.zip` (один раз).

## Облако: рисовать из облачных сессий Claude Code

Один раз, около 10 минут. Сначала выполните установку на Mac выше — плагин нужен в любом случае.

1. **Ретранслятор.** Кнопка → войти в Cloudflare (бесплатно) → Deploy:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ardubrovskij-dotcom/claude-sigma/tree/claude/modest-brahmagupta-flhzty/relay)

   Если Cloudflare подключил сам репозиторий и сборка упала: проект → **Settings → Build** → ветка (Production branch) `claude/modest-brahmagupta-flhzty`, Root directory `/` → Save → **Deployments → Retry build** (или новый пуш).

   Не сработала кнопка — вручную: `cd ~/claude-sigma/relay && npm install && npx wrangler login && npx wrangler deploy`.
2. **Токен.** Открыть адрес ретранслятора (`https://claude-figma-relay.<имя>.workers.dev`) — страница создаст личный токен и покажет все строки ниже с кнопками «Копировать».
3. **Плагин.** В Figma, блок «Облако»: вставить адрес комнаты → «авто» → «Подключить».
4. **Облачное окружение** (в облачной сессии: меню окружения в заголовке → Edit):
   - Environment variables: `SIGMA_RELAY_URL=wss://…/ws/<токен>`
   - Network access → Allowed domains: домен ретранслятора (`claude-figma-relay.<имя>.workers.dev`)
   - Setup script: `curl -fsSL https://raw.githubusercontent.com/ardubrovskij-dotcom/claude-sigma/claude/modest-brahmagupta-flhzty/cloud/setup.sh | bash`
5. **Проверка.** Новая облачная сессия в любом репозитории этого окружения: «Проверь подключение к Figma» → `connected: true`, `bridge: relay`.

Каждый, кому вы дадите ссылку на репозиторий, разворачивает **свой** ретранслятор со своим токеном — чужие сессии в вашу Figma не попадут.

Подробно: [relay/README.md](relay/README.md), [figma-plugin/README.md](figma-plugin/README.md), [bridge/README.md](bridge/README.md), [skills/README.md](skills/README.md).

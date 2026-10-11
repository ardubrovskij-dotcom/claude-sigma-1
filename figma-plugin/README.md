# Claude for Figma by Dubrovskiy — плагин Figma

Плагин выполняет в макете команды в формате JSON: создаёт фреймы, текст, фигуры, векторы, SVG, auto layout, правит и удаляет слои, экспортирует PNG/SVG.
Команды приходят по WebSocket от локального моста (следующий этап) или вводятся вручную в окне плагина.

Работает на любом тарифе Figma: плагин в режиме разработки запускается в десктопном приложении без публикации.

## Установка

Собранный `dist/code.js` лежит в репозитории, поэтому для установки сборка не нужна: скачать репозиторий (ZIP), распаковать и импортировать `figma-plugin/manifest.json` (шаги ниже). Сборка нужна только при изменении кода:

```bash
cd figma-plugin
npm install
npm run build        # собирает dist/code.js
```

В Figma Desktop: **Plugins → Development → Import plugin from manifest…** → выбрать `figma-plugin/manifest.json`.
Запуск: **Plugins → Development → Claude for Figma by Dubrovskiy**.

Разработка: `npm run watch` пересобирает при изменениях, `npm run typecheck` проверяет типы, `npm test` прогоняет смоук-тест команд на заглушке API Figma.

Для Claude Code в репозитории есть скилл `.claude/skills/figma-sigma-draw` — правила работы с командами плагина и вёрстки слайдов.

## Устройство

| Файл | Где выполняется | Роль |
|---|---|---|
| `manifest.json` | — | Метаданные, доступ к сети только `localhost:3055` (dev) |
| `src/code.ts` | Песочница Figma, есть доступ к `figma.*` | Исполнитель команд |
| `ui.html` | iframe плагина, есть сеть | Подключение к мосту, ручная консоль, лог |

```
мост ──WebSocket──► ui.html ──postMessage──► code.ts ──► макет
     ◄──── result ──┘        ◄──── result ──┘
```

## Подключения

В окне плагина два независимых подключения, работают одновременно:

| Блок | Адрес | Для чего |
|---|---|---|
| Компьютер | `ws://localhost:3055` | Claude Desktop и локальные сессии Claude Code |
| Облако | `wss://<ретранслятор>/ws/<токен>` | Облачные сессии Claude Code через `relay/` |

Галочка «авто» у каждого блока — подключаться при запуске плагина. Сеть разрешена на `localhost:3055` и `*.workers.dev`; ретранслятор на своём домене нужно добавить в `manifest.json` → `networkAccess.allowedDomains`.

## Протокол (для моста)

Плагин подключается к `ws://localhost:3055` (меняется в окне плагина) и первым сообщением отправляет:

```json
{ "type": "hello", "role": "figma-plugin", "token": "..." }
```

Команда от моста:

```json
{ "id": "42", "command": "create_frame", "params": { "width": 1920, "height": 1080, "fill": "#0F172A" } }
```

Ответ плагина:

```json
{ "type": "result", "id": "42", "result": { "id": "12:5", "type": "FRAME", "width": 1920, "height": 1080 } }
{ "type": "result", "id": "43", "error": "Узел не найден: 1:999" }
```

Служебные сообщения: `{ "type": "ping" }` → `{ "type": "pong" }`; `{ "type": "welcome", "message" }` и `{ "type": "error", "message" }` выводятся в лог.

## Команды

Полный список с параметрами возвращает `list_commands`.

| Группа | Команды |
|---|---|
| Чтение | `ping`, `get_document_info`, `get_page`, `get_node`, `get_selection`, `find_nodes`, `list_fonts`, `export_node` |
| Страницы | `create_page`, `set_current_page` |
| Создание | `create_frame`, `create_rectangle`, `create_ellipse`, `create_polygon`, `create_star`, `create_line`, `create_vector`, `create_svg`, `create_text`, `create_component`, `create_instance` |
| Изменение | `update_node`, `move_to_parent`, `clone_node`, `delete_node`, `group`, `ungroup`, `boolean`, `flatten`, `select`, `notify` |
| Пакет | `batch` |

### Общие свойства (create_* и update_node)

| Свойство | Пример | Примечание |
|---|---|---|
| `parentId`, `index` | `"12:5"` | По умолчанию — текущая страница |
| `name`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `visible` | | |
| `fill` / `fills` | `"#0F172A"`, `"#38BDF880"`, `null`, `{ "type": "linear", "stops": ["#000", "#fff"], "angle": 90 }` | Также принимается массив Paint Figma |
| `stroke`, `strokeWeight`, `strokeAlign`, `dashPattern` | `"#000"`, `2`, `"INSIDE"`, `[4, 4]` | |
| `cornerRadius` | `12` или `[tl, tr, br, bl]` | |
| `effects` | `[{ "type": "shadow", "color": "#0000001A", "y": 8, "blur": 24 }]` | `shadow`, `inner-shadow`, `blur`, `background-blur` |
| Auto layout | `layoutMode`, `itemSpacing`, `padding` (`16` / `[v, h]` / `[t, r, b, l]`), `primaryAxisAlignItems`, `counterAxisAlignItems`, `primaryAxisSizingMode`, `counterAxisSizingMode`, `layoutWrap` | Для фреймов |
| Внутри auto layout | `layoutSizingHorizontal`, `layoutSizingVertical` (`FIXED`/`HUG`/`FILL`), `layoutPositioning` | |
| Текст | `text`, `fontFamily`, `fontStyle`, `fontSize`, `lineHeight` (`24` / `"120%"` / `"auto"`), `letterSpacing`, `textAlign`, `textAutoResize` | Без `width` текст растёт по ширине; с `width` — переносится |

### batch и ссылки

`batch` выполняет команды по порядку. Строка `"$N"` в параметрах заменяется на `id` результата N-й команды, поэтому слайд строится за один запрос:

```json
[
  { "command": "create_frame", "params": { "name": "Slide 01", "width": 1920, "height": 1080, "fill": "#0F172A" } },
  { "command": "create_text",  "params": { "parentId": "$0", "text": "Заголовок", "x": 120, "y": 120, "fontStyle": "Bold", "fontSize": 96, "fill": "#F8FAFC" } },
  { "command": "select",       "params": { "ids": ["$0"] } }
]
```

При ошибке выполнение останавливается и возвращается `{ results, error: { index, command, message } }`; с `continueOnError: true` продолжается.

### Векторы

- `create_svg` — любая SVG-разметка (иконки, иллюстрации). Рекомендуемый путь.
- `create_vector` — путь в формате Figma: только абсолютные `M L Q C Z`, числа через пробел (`"M 0 0 L 100 0 L 50 80 Z"`).
- `create_line` — отрезок `x1, y1 → x2, y2`.

## Поведение по умолчанию

- Слой, созданный на странице без `x`/`y`, ставится на 100 px правее самого правого слоя, а не в (0,0).
- `clone_node` без `parentId` кладёт копию рядом с оригиналом в том же родителе.
- Текст с `width` или `layoutSizingHorizontal: "FILL"` переключается на перенос строк (`textAutoResize: HEIGHT`).
- Если параметры команды `create_*` некорректны, созданный слой удаляется — мусор в макете не остаётся.

## Ограничения

- Плагин работает, пока он открыт в файле. Фонового режима у плагинов Figma нет.
- Шрифт должен быть установлен или доступен в Figma; иначе `create_text` вернёт ошибку. Проверить можно через `list_fonts`.
- `export_node` возвращает PNG в base64; на больших фреймах используйте `scale` < 1.
- Сеть разрешена на `localhost:3055` (`devAllowedDomains`) и `*.workers.dev` (`allowedDomains`). Другие адреса нужно добавить в `manifest.json`.

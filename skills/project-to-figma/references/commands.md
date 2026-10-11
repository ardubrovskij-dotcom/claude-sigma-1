# Команды плагина и правила API

## Содержание
- Инструменты
- Команды
- Свойства
- Правила, на которых ломаются макеты

## Инструменты

| Инструмент | Когда |
|---|---|
| `figma_status` | В начале работы и при сомнениях в связи |
| `figma_batch {commands: [{command, params}], continueOnError?}` | Основной способ: целый фрейм за вызов; `"$N"` = id результата N-й команды |
| `figma_command {command, params}` | Чтение (`get_node`, `get_page`, `find_nodes`, `list_fonts`) и точечные правки |
| `figma_screenshot {id?, scale?}` | Проверка результата; без id — выделение; `scale: 0.5` для 1920×1080 |

## Команды

| Группа | Команды |
|---|---|
| Чтение | `get_document_info`, `get_page {pageId?, depth?}`, `get_node {id, depth?}`, `get_selection {depth?}`, `find_nodes {type?, name?, text?, rootId?, limit?}`, `list_fonts {family?, limit?}`, `export_node {id, format, scale?}` |
| Страницы | `create_page {name, switchTo?}`, `set_current_page {pageId}` |
| Создание | `create_frame`, `create_rectangle`, `create_ellipse {arc?}`, `create_polygon {pointCount}`, `create_star {pointCount, innerRadius}`, `create_line {x1, y1, x2, y2}`, `create_vector {paths \| path}`, `create_svg {svg}`, `create_text {text, …}`, `create_component`, `create_instance {componentId}` |
| Правка | `update_node {id, …}`, `move_to_parent {id, parentId?, index?, x?, y?}`, `clone_node {id, parentId?, …}`, `delete_node {id \| ids}`, `group {ids, name?}`, `ungroup {id}`, `boolean {ids, operation}`, `flatten {ids}`, `select {ids, zoom?}` |

## Свойства (create_* и update_node)

| Свойство | Значения |
|---|---|
| `parentId`, `index` | Родитель (по умолчанию — страница), позиция в нём |
| `name`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `visible` | |
| `fill` | `"#RRGGBB"`, `"#RRGGBBAA"`, `null` (без заливки), `{type: "linear", stops: ["#a", "#b"], angle: 90}` (0° — слева направо, 90° — сверху вниз) |
| `stroke`, `strokeWeight`, `strokeAlign`, `dashPattern` | `"#hex"`, число, `"INSIDE" \| "CENTER" \| "OUTSIDE"`, `[4, 4]` |
| `cornerRadius` | число или `[tl, tr, br, bl]` |
| `effects` | `[{type: "shadow", color: "#0000001A", x: 0, y: 8, blur: 24, spread: 0}]`, `inner-shadow`, `{type: "blur", radius}`, `background-blur` |
| `clipsContent` | обрезать детей по фрейму |
| Auto layout (фрейм) | `layoutMode: "HORIZONTAL" \| "VERTICAL"`, `itemSpacing`, `padding` (`16` \| `[v, h]` \| `[t, r, b, l]`), `primaryAxisAlignItems: MIN \| CENTER \| MAX \| SPACE_BETWEEN`, `counterAxisAlignItems: MIN \| CENTER \| MAX \| BASELINE`, `primaryAxisSizingMode` / `counterAxisSizingMode: FIXED \| AUTO`, `layoutWrap: WRAP` |
| Ребёнок auto layout | `layoutSizingHorizontal` / `layoutSizingVertical: FIXED \| HUG \| FILL`, `layoutPositioning: ABSOLUTE` |
| Текст | `text`, `fontFamily`, `fontStyle`, `fontSize`, `lineHeight` (`24` \| `"120%"` \| `"auto"`), `letterSpacing` (`0` \| `"-2%"`), `textAlign: LEFT \| CENTER \| RIGHT \| JUSTIFIED`, `textAlignVertical`, `textCase: UPPER \| …`, `textAutoResize` |

## Правила, на которых ломаются макеты

| Правило | Как соблюдать |
|---|---|
| Шрифт и начертание должны существовать | Сначала `list_fonts {family}`; стиль пиши ровно как в ответе («Semi Bold») |
| Текст без `width` растёт в одну строку | Абзацам и многострочным заголовкам всегда `width` (или `layoutSizingHorizontal: "FILL"` в auto layout) |
| `HUG` — только у auto layout фрейма и текста внутри него | Прямоугольнику/фрейму-ребёнку — `FILL` или `FIXED` |
| `FILL` — только у ребёнка auto layout, не `ABSOLUTE` | Родитель-HUG не даёт FILL-детям места: родителю нужен фиксированный размер |
| Режимы размеров разные | У фрейма `*AxisSizingMode: FIXED \| AUTO`; у ребёнка `layoutSizing*: FIXED \| HUG \| FILL` |
| `counterAxisAlignItems: STRETCH` нет | Растягивай детей `layoutSizingHorizontal: "FILL"` |
| Координаты детей auto layout игнорируются | Порядок задаёт очередность команд или `index` |
| Перенос в другого родителя не сбрасывает x/y | Передавай `x`, `y` в `move_to_parent` |
| Иконки из повёрнутых линий разваливаются | Только `create_svg` с `viewBox` и `width`/`height` |
| `create_vector` | Только абсолютные `M L Q C Z`, числа через пробел; сложное — `create_svg` |
| Пакет падает на первой ошибке | Команды до неё выполнены; продолжай с `error.index`, не дублируй уже созданное |
| Большой экспорт тяжёлый | `figma_screenshot` со `scale: 0.5` (слайд) или `1` (мобильный экран) |

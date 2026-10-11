# Заготовки пакетов

Каждая заготовка — параметр `commands` для одного вызова `figma_batch`. Подставляй токены из брифа вместо примерных значений (`#0B1220`, `Inter` и т.д.) и реальный текст проекта. Это стартовые точки: меняй раскладку под роль слайда/экрана, чтобы колода не была однообразной.

## Содержание
- Слайд: титул
- Слайд: одна цифра
- Слайд: процесс из шагов
- Схема: матрица 2×2
- Мобильный экран: список карточек
- Кнопка (auto layout)
- Десктоп: hero лендинга

## Слайд: титул

Асимметрия: крупный круг-мотив уходит за правый край, текст в левой части.

```json
[
  { "command": "create_frame", "params": { "name": "01 — Титул", "width": 1920, "height": 1080, "clipsContent": true,
      "fill": { "type": "linear", "stops": ["#0B1220", "#16233D"], "angle": 90 } } },
  { "command": "create_ellipse", "params": { "parentId": "$0", "name": "Motif", "x": 1180, "y": -260, "width": 1000, "height": 1000, "fill": "#3B82F6" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Kicker", "x": 140, "y": 300, "text": "НАЗВАНИЕ ПРОЕКТА · 2026",
      "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 22, "letterSpacing": "8%", "fill": "#93C5FD" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Title", "x": 140, "y": 360, "width": 1000,
      "text": "Главная мысль презентации", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 120, "lineHeight": "102%", "letterSpacing": "-2%", "fill": "#F8FAFC" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Subtitle", "x": 140, "y": 720, "width": 820,
      "text": "Подзаголовок: для кого и зачем", "fontFamily": "Inter", "fontSize": 36, "lineHeight": "130%", "fill": "#E2E8F0" } }
]
```

## Слайд: одна цифра

Пауза в колоде: одна метрика крупно, пояснение мелко, много воздуха.

```json
[
  { "command": "create_frame", "params": { "name": "03 — Метрика", "width": 1920, "height": 1080, "clipsContent": true, "fill": "#F8FAFC" } },
  { "command": "create_rectangle", "params": { "parentId": "$0", "name": "Accent bar", "x": 0, "y": 0, "width": 24, "height": 1080, "fill": "#3B82F6" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Metric", "x": 200, "y": 260, "text": "42%",
      "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 360, "lineHeight": "100%", "letterSpacing": "-4%", "fill": "#0B1220" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Caption", "x": 210, "y": 700, "width": 900,
      "text": "клиентов уходят после первой недели — это и есть проблема, которую мы решаем", "fontFamily": "Inter", "fontSize": 40, "lineHeight": "130%", "fill": "#334155" } }
]
```

## Слайд: процесс из шагов

Шаги — карточки в горизонтальном auto layout; каждая растягивается поровну.

```json
[
  { "command": "create_frame", "params": { "name": "04 — Как работает", "width": 1920, "height": 1080, "fill": "#FFFFFF" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Title", "x": 140, "y": 120, "width": 1200,
      "text": "Как это работает", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 88, "fill": "#0B1220" } },
  { "command": "create_frame", "params": { "parentId": "$0", "name": "Steps", "x": 140, "y": 420, "width": 1640, "height": 420,
      "layoutMode": "HORIZONTAL", "itemSpacing": 32, "primaryAxisSizingMode": "FIXED", "counterAxisSizingMode": "FIXED" } },
  { "command": "create_frame", "params": { "parentId": "$2", "name": "Step 1", "layoutMode": "VERTICAL", "itemSpacing": 20, "padding": 40,
      "fill": "#EFF6FF", "cornerRadius": 24, "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "FILL" } },
  { "command": "create_text", "params": { "parentId": "$3", "name": "Number", "text": "01", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 64, "fill": "#3B82F6" } },
  { "command": "create_text", "params": { "parentId": "$3", "name": "Label", "text": "Подключаем данные", "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 36,
      "fill": "#0B1220", "layoutSizingHorizontal": "FILL" } },
  { "command": "create_text", "params": { "parentId": "$3", "name": "Body", "text": "Одна строка пояснения к шагу", "fontFamily": "Inter", "fontSize": 26, "lineHeight": "140%",
      "fill": "#475569", "layoutSizingHorizontal": "FILL" } },
  { "command": "clone_node", "params": { "id": "$3", "name": "Step 2" } },
  { "command": "clone_node", "params": { "id": "$3", "name": "Step 3" } }
]
```

Тексты в копиях поменяй потом: `find_nodes {rootId: <id Step 2>, type: "TEXT"}` → `update_node {id, text}`.

## Схема: матрица 2×2

```json
[
  { "command": "create_frame", "params": { "name": "Матрица приоритетов", "width": 1920, "height": 1080, "fill": "#FFFFFF" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Title", "x": 140, "y": 90, "width": 1400, "text": "Что делать в первую очередь",
      "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 64, "fill": "#0B1220" } },
  { "command": "create_rectangle", "params": { "parentId": "$0", "name": "Q1 Быстрые победы", "x": 340, "y": 240, "width": 700, "height": 360, "fill": "#DCFCE7", "cornerRadius": 20 } },
  { "command": "create_rectangle", "params": { "parentId": "$0", "name": "Q2 Крупные ставки", "x": 1080, "y": 240, "width": 700, "height": 360, "fill": "#DBEAFE", "cornerRadius": 20 } },
  { "command": "create_rectangle", "params": { "parentId": "$0", "name": "Q3 Мелочи", "x": 340, "y": 640, "width": 700, "height": 360, "fill": "#F1F5F9", "cornerRadius": 20 } },
  { "command": "create_rectangle", "params": { "parentId": "$0", "name": "Q4 Не делать", "x": 1080, "y": 640, "width": 700, "height": 360, "fill": "#FEE2E2", "cornerRadius": 20 } },
  { "command": "create_text", "params": { "parentId": "$0", "x": 380, "y": 280, "width": 620, "text": "Быстрые победы", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 40, "fill": "#166534" } },
  { "command": "create_text", "params": { "parentId": "$0", "x": 1120, "y": 280, "width": 620, "text": "Крупные ставки", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 40, "fill": "#1E40AF" } },
  { "command": "create_text", "params": { "parentId": "$0", "x": 380, "y": 680, "width": 620, "text": "Мелочи", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 40, "fill": "#334155" } },
  { "command": "create_text", "params": { "parentId": "$0", "x": 1120, "y": 680, "width": 620, "text": "Не делать", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 40, "fill": "#991B1B" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Axis Y", "x": 140, "y": 600, "width": 160, "text": "Ценность ↑", "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 26, "fill": "#64748B" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Axis X", "x": 1540, "y": 1020, "text": "Усилия →", "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 26, "fill": "#64748B" } }
]
```

## Мобильный экран: список карточек

Вертикальный auto layout на весь экран; всё внутри растягивается по ширине.

```json
[
  { "command": "create_frame", "params": { "name": "Home", "width": 390, "height": 844, "fill": "#F8FAFC", "clipsContent": true,
      "layoutMode": "VERTICAL", "itemSpacing": 16, "padding": [64, 20, 24, 20], "primaryAxisSizingMode": "FIXED", "counterAxisSizingMode": "FIXED" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Greeting", "text": "Привет, Анна", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 32,
      "fill": "#0B1220", "layoutSizingHorizontal": "FILL" } },
  { "command": "create_frame", "params": { "parentId": "$0", "name": "Card", "layoutMode": "VERTICAL", "itemSpacing": 8, "padding": 20,
      "fill": "#FFFFFF", "cornerRadius": 16, "effects": [{ "type": "shadow", "color": "#0F172A14", "y": 4, "blur": 16 }],
      "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG" } },
  { "command": "create_text", "params": { "parentId": "$2", "name": "Card / Title", "text": "Заголовок карточки", "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 18,
      "fill": "#0B1220", "layoutSizingHorizontal": "FILL" } },
  { "command": "create_text", "params": { "parentId": "$2", "name": "Card / Body", "text": "Короткое описание в одну-две строки", "fontFamily": "Inter", "fontSize": 15, "lineHeight": "140%",
      "fill": "#64748B", "layoutSizingHorizontal": "FILL" } },
  { "command": "clone_node", "params": { "id": "$2", "name": "Card 2" } },
  { "command": "clone_node", "params": { "id": "$2", "name": "Card 3" } }
]
```

## Кнопка (auto layout)

Кнопка подстраивается под текст (`AUTO` по обеим осям). Внутри экрана добавь `"layoutSizingHorizontal": "FILL"` — станет на всю ширину.

```json
[
  { "command": "create_frame", "params": { "parentId": "<id экрана>", "name": "Button / Primary", "layoutMode": "HORIZONTAL",
      "padding": [16, 24], "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER",
      "primaryAxisSizingMode": "AUTO", "counterAxisSizingMode": "AUTO", "fill": "#3B82F6", "cornerRadius": 12 } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Label", "text": "Продолжить", "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 17, "fill": "#FFFFFF" } }
]
```

## Десктоп: hero лендинга

```json
[
  { "command": "create_frame", "params": { "name": "Landing / Hero", "width": 1440, "height": 900, "fill": "#0B1220", "clipsContent": true } },
  { "command": "create_ellipse", "params": { "parentId": "$0", "name": "Glow", "x": 760, "y": 80, "width": 820, "height": 820, "fill": "#3B82F6", "effects": [{ "type": "blur", "radius": 160 }] } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Logo", "x": 120, "y": 40, "text": "Brand", "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 24, "fill": "#F8FAFC" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "H1", "x": 120, "y": 260, "width": 760, "text": "Главное обещание продукта в одну строку",
      "fontFamily": "Inter", "fontStyle": "Bold", "fontSize": 64, "lineHeight": "108%", "letterSpacing": "-2%", "fill": "#F8FAFC" } },
  { "command": "create_text", "params": { "parentId": "$0", "name": "Lead", "x": 120, "y": 500, "width": 600, "text": "Поясняющий абзац: для кого и какой результат",
      "fontFamily": "Inter", "fontSize": 20, "lineHeight": "150%", "fill": "#CBD5E1" } },
  { "command": "create_frame", "params": { "parentId": "$0", "name": "CTA", "x": 120, "y": 620, "layoutMode": "HORIZONTAL", "padding": [18, 28],
      "primaryAxisSizingMode": "AUTO", "counterAxisSizingMode": "AUTO", "fill": "#3B82F6", "cornerRadius": 12 } },
  { "command": "create_text", "params": { "parentId": "$5", "name": "Label", "text": "Попробовать бесплатно", "fontFamily": "Inter", "fontStyle": "Semi Bold", "fontSize": 18, "fill": "#FFFFFF" } }
]
```

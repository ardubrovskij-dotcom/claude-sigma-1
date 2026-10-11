# Навыки

| Навык | Что делает |
|---|---|
| `project-to-figma/` | Читает контекст проекта (инструкции, файлы, брендбук, вложения, текущий макет), выводит стиль, показывает бриф и после «ок» рисует в Figma через расширение Claude for Figma by Dubrovskiy |

Готовые архивы — `dist/project-to-figma.zip` (загрузка в Claude Desktop) и `dist/project-to-figma.skill`.

## Установка в Claude Desktop

1. **Settings → Capabilities** → раздел **Skills** → **Upload skill** → выбрать `skills/dist/project-to-figma.zip`.
2. Включить навык **project-to-figma**.
3. Должно быть установлено и включено расширение **Claude for Figma by Dubrovskiy** (`bridge/claude-sigma.mcpb`), а в Figma запущен плагин с зелёной точкой.

В Claude Code навык подключён через `.claude/skills/project-to-figma` (ссылка на эту папку).

## Тесты

```bash
node skills/tests/check-recipes.js   # все заготовки из recipes.md через строгую заглушку Figma
```

`tests/strict-figma.js` — заглушка `figma.*`, которая, как настоящий API, отклоняет `FILL`/`HUG` вне auto layout, незагруженные шрифты и запись несуществующих свойств. `tests/evals.json` — тестовые запросы, `tests/fixtures/finpulse/` — пример проекта (брендбук) и эталонный пакет слайдов.

После изменения навыка пересобрать архивы:

```bash
cd skills && rm -f dist/project-to-figma.zip && zip -qr dist/project-to-figma.zip project-to-figma
```

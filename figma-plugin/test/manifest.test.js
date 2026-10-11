// Проверка manifest.json по правилам, которые Figma проверяет при импорте.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const m = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
for (const k of ["name", "id", "api", "main", "ui", "editorType"]) assert(m[k], `нет поля ${k}`);
assert(fs.existsSync(path.join(__dirname, "..", m.main)), `нет файла ${m.main}`);
assert(fs.existsSync(path.join(__dirname, "..", m.ui)), `нет файла ${m.ui}`);
const na = m.networkAccess || {};
const SCHEME = /^(https?|wss?):\/\//;
for (const d of na.allowedDomains || []) {
  if (d === "none") continue;
  assert(SCHEME.test(d), `allowedDomains: '${d}' должен начинаться со схемы (https://, wss://) — иначе Figma отклонит манифест`);
}
for (const d of na.devAllowedDomains || []) assert(SCHEME.test(d), `devAllowedDomains: '${d}' без схемы`);
if ((na.allowedDomains || []).some((d) => d !== "none")) assert(na.reasoning, "при allowedDomains нужен reasoning");
console.log("MANIFEST OK");

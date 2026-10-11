// Сквозной тест моста: MCP-клиент (как Claude Desktop) ⇄ мост ⇄ имитация плагина по WebSocket.
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const PORT = 3999;
const url = `ws://127.0.0.1:${PORT}`;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL("../mcpb/server/index.js", import.meta.url).pathname],
  env: { ...process.env, SIGMA_PORT: String(PORT), SIGMA_TOKEN: "secret" },
  stderr: "pipe",
});
const client = new Client({ name: "test", version: "1" });
await client.connect(transport);
const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const text = (r) => r.content.find((c) => c.type === "text").text;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Инструменты и инструкции
const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), ["figma_batch", "figma_command", "figma_screenshot", "figma_status"]);
assert(client.getInstructions().includes("Слайды 1920×1080"), "инструкции содержат скилл");

await wait(300);
// Без плагина
let r = await call("figma_status");
assert.equal(JSON.parse(text(r)).connected, false);
r = await call("figma_command", { command: "ping" });
assert(r.isError && text(r).includes("Плагин не подключён"));

// Сайт из браузера (настоящий origin) отклоняется
await new Promise((resolve) => {
  const evil = new WebSocket(url, { origin: "https://evil.example" });
  evil.on("error", resolve);
  evil.on("open", () => assert.fail("evil origin accepted"));
});

// Неверный токен
await new Promise((resolve) => {
  const bad = new WebSocket(url, { origin: "null" });
  bad.on("open", () => bad.send(JSON.stringify({ type: "hello", token: "wrong" })));
  bad.on("close", (code) => { assert.equal(code, 4003); resolve(); });
});

// Имитация плагина
const seen = [];
const plugin = new WebSocket(url, { origin: "null" });
await new Promise((res) => plugin.on("open", res));
plugin.send(JSON.stringify({ type: "hello", role: "figma-plugin", token: "secret" }));
plugin.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (!m.command) return;
  seen.push(m.command);
  const reply = (result, error) => plugin.send(JSON.stringify({ type: "result", id: m.id, result, error }));
  if (m.command === "get_document_info") return reply({ file: "Deck", pages: [{ id: "0:1", name: "Page 1" }] });
  if (m.command === "batch") {
    const bad = m.params.commands.findIndex((c) => c.command === "boom");
    if (bad >= 0) return reply({ results: [], error: { index: bad, command: "boom", message: "x" } });
    return reply({ results: m.params.commands.map((c, i) => ({ id: `1:${i}`, command: c.command })) });
  }
  if (m.command === "get_selection") return reply([{ id: "1:5" }]);
  if (m.command === "export_node") return reply({ format: "PNG", base64: "iVBORw0KGgo=", bytes: 8 });
  if (m.command === "slow") return; // не отвечает
  return reply(undefined, `Неизвестная команда: ${m.command}`);
});
await wait(200);

r = await call("figma_status");
assert.deepEqual(JSON.parse(text(r)), { connected: true, bridge: "primary", file: "Deck", pages: [{ id: "0:1", name: "Page 1" }] });

r = await call("figma_batch", { commands: [{ command: "create_frame", params: { width: 1920 } }, { command: "create_text", params: { parentId: "$0" } }] });
assert(!r.isError); assert.equal(JSON.parse(text(r)).results.length, 2);

r = await call("figma_batch", { commands: [{ command: "create_frame" }, { command: "boom" }] });
assert(r.isError && JSON.parse(text(r)).error.index === 1, "ошибка пакета помечена isError");

r = await call("figma_command", { command: "nope" });
assert(r.isError && text(r).includes("Неизвестная команда"));

r = await call("figma_screenshot");
assert.equal(r.content[0].type, "image"); assert.equal(r.content[0].mimeType, "image/png");
assert.deepEqual(seen.slice(-2), ["get_selection", "export_node"]);

// Отключение плагина во время команды
const pendingCall = call("figma_command", { command: "slow" });
await wait(100);
plugin.close();
r = await pendingCall;
assert(r.isError && text(r).includes("отключился"));

await client.close();
console.log("BRIDGE OK:", seen.join(", "));
process.exit(0);

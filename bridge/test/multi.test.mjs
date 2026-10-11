// Несколько копий моста на одном порту (Claude Desktop + сессии Claude Code в разных репозиториях):
// первая — основная, остальные работают через неё; при закрытии основной порт занимает другая.
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const PORT = 3997;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (r) => r.content.find((c) => c.type === "text").text;

async function bridge(name) {
  const client = new Client({ name, version: "1" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../mcpb/server/index.js", import.meta.url).pathname],
    env: { ...process.env, SIGMA_PORT: String(PORT) },
    stderr: "pipe",
  }));
  return { client, call: (tool, args = {}) => client.callTool({ name: tool, arguments: args }) };
}
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await wait(150); }
  throw new Error("timeout");
}

// Имитация плагина с автопереподключением, как у ui.html
let connects = 0;
function plugin() {
  let ws;
  const open = () => {
    ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: "null" });
    ws.on("open", () => { connects++; ws.send(JSON.stringify({ type: "hello", role: "figma-plugin" })); });
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (!m.command) return;
      const result = m.command === "get_document_info" ? { file: "Multi" } : { echo: m.command, n: m.params.n };
      setTimeout(() => ws.send(JSON.stringify({ type: "result", id: m.id, result })), 20);
    });
    ws.on("close", () => { if (!stopped) setTimeout(open, 300); });
    ws.on("error", () => {});
  };
  let stopped = false;
  open();
  return { stop: () => { stopped = true; ws.close(); } };
}

const A = await bridge("desktop");
await wait(400);
const B = await bridge("repo-1");
const C = await bridge("repo-2");

const st = async (b) => JSON.parse(text(await b.call("figma_status")));
await until(async () => (await st(B)).bridge === "secondary");
assert.equal((await st(A)).bridge, "primary");
assert.equal((await st(C)).bridge, "secondary");
let s = await st(B);
assert.equal(s.connected, false); assert(s.hint.includes("Плагин не подключён"), s.hint);

const p = plugin();
await until(async () => (await st(A)).connected);
assert.equal((await st(B)).file, "Multi");

// Параллельные команды из трёх копий не путаются
const rs = await Promise.all([A, B, C, A, B, C].map((b, i) => b.call("figma_command", { command: "probe", params: { n: i } })));
rs.forEach((r, i) => assert.equal(JSON.parse(text(r)).n, i, "ответ дошёл своему отправителю"));

// Основная копия закрывается → одна из вспомогательных занимает порт, плагин переподключается
await A.client.close();
const newPrimary = await until(async () => {
  for (const b of [B, C]) if ((await st(b)).bridge === "primary") return b;
});
await until(async () => (await st(newPrimary)).connected);
const other = newPrimary === B ? C : B;
await until(async () => (await st(other)).connected);
assert.equal(JSON.parse(text(await other.call("figma_command", { command: "probe", params: { n: 42 } }))).n, 42);
assert(connects >= 2, "плагин переподключился");

p.stop();
await B.client.close(); await C.client.close();
console.log("MULTI OK: переподключений плагина", connects);
process.exit(0);

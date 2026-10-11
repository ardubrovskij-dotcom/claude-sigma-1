// Смоук-тест исполнителя команд на заглушке figma.* (без Figma). Запуск: npm test
const vm = require("vm"), fs = require("fs");
const code = fs.readFileSync(require("path").join(__dirname, "../dist/code.js"), "utf8");
let nextId = 1; const nodes = new Map(); const out = [];
const mixed = Symbol("mixed");
function base(type) {
  const n = { id: `1:${nextId++}`, type, name: type, x: 0, y: 0, width: 100, height: 100, visible: true, fills: [{type:"SOLID",color:{r:1,g:1,b:1}}], strokes: [], parent: null,
    resize(w, h) { this.width = w; this.height = h; }, remove() { const p=this.parent; p.children.splice(p.children.indexOf(this),1); nodes.delete(this.id); },
    clone() { const c = Object.assign(base(type), JSON.parse(JSON.stringify({...this, parent:undefined, children:undefined, id:undefined}))); c.id=`1:${nextId++}`; nodes.set(c.id,c); if (this.children) { c.children=[]; addParent(c);} page.appendChild(c); return c; } };
  nodes.set(n.id, n); return n;
}
function addParent(n) { n.children = n.children || []; n.appendChild = (c) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c),1); c.parent = n; n.children.push(c); }; n.insertChild = (i, c) => { n.appendChild(c); }; n.findAll = (f) => { const r=[]; (function w(x){ for (const c of x.children||[]) { if (f(c)) r.push(c); w(c);} })(n); return r; }; }
const page = { id: "0:1", type: "PAGE", name: "Page 1", children: [], selection: [] }; addParent(page);
const figma = {
  mixed, editorType: "figma", root: { name: "Test file", children: [page] }, currentPage: page,
  showUI() {}, notify() {}, viewport: { scrollAndZoomIntoView() {} },
  ui: { postMessage(m) { out.push(m); }, onmessage: null },
  clientStorage: { async getAsync() { return {}; }, async setAsync() {} },
  async getNodeByIdAsync(id) { return id === page.id ? page : nodes.get(id) || null; },
  async loadFontAsync() {}, async loadAllPagesAsync() {},
  createFrame() { const n = base("FRAME"); addParent(n); n.layoutMode = "NONE"; n.cornerRadius = 0; n.effects = []; n.clipsContent = true; return n; },
  createRectangle() { const n = base("RECTANGLE"); n.cornerRadius = 0; return n; },
  createText() { const n = base("TEXT"); n.characters = ""; n.fontName = { family: "Inter", style: "Regular" }; n.fontSize = 12; n.textAutoResize = "WIDTH_AND_HEIGHT"; return n; },
  createVector() { const n = base("VECTOR"); n.vectorPaths = []; return n; },
};
vm.runInNewContext(code, { figma, __html__: "", console, performance });
async function send(command, params) { const id = String(nextId); await figma.ui.onmessage({ type: "command", id, command, params }); return out.pop(); }
(async () => {
  const assert = require("assert");
  const r1 = await send("batch", { commands: [
    { command: "create_frame", params: { name: "Slide", width: 1920, height: 1080, fill: { type: "linear", stops: ["#0F172A", "#1E293B"], angle: 90 } } },
    { command: "create_text", params: { parentId: "$0", text: "Hello", x: 120, y: 120, width: 800, fontSize: 96, lineHeight: "110%", fill: "#F8FAFC" } },
    { command: "create_rectangle", params: { parentId: "$0", width: 160, height: 8, cornerRadius: [4,4,0,0], fill: "#38BDF880" } },
    { command: "create_line", params: { parentId: "$0", x1: 10, y1: 50, x2: 110, y2: 50, stroke: "#000" } },
  ]});
  assert(!r1.error && !r1.result.error, JSON.stringify(r1));
  const [frame, text, rect, line] = r1.result.results;
  assert.equal(frame.width, 1920); assert.equal(text.width, 800);
  const t = nodes.get(text.id); assert.equal(t.parent.id, frame.id); assert.equal(t.characters, "Hello"); assert.deepEqual(t.lineHeight, {unit:"PERCENT", value:110}); assert.equal(t.textAutoResize, "HEIGHT");
  const rc = nodes.get(rect.id); assert.equal(rc.topLeftRadius, 4); assert(Math.abs(rc.fills[0].opacity - 0x80/255) < 1e-9);
  assert.equal(nodes.get(line.id).vectorPaths[0].data, "M 0 0 L 100 0");
  assert.equal(nodes.get(frame.id).fills[0].type, "GRADIENT_LINEAR");
  const tree = await send("get_node", { id: frame.id, depth: 1 }); assert.equal(tree.result.children.length, 3);
  const upd = await send("update_node", { id: text.id, text: "Changed", fontStyle: "Bold" }); assert.equal(nodes.get(text.id).characters, "Changed"); assert.equal(nodes.get(text.id).fontName.style, "Bold");
  const bad = await send("create_rectangle", { fill: "#zz" }); assert(bad.error.includes("Некорректный цвет")); assert.equal([...nodes.values()].filter(n => n.type === "RECTANGLE").length, 1, "orphan rect");
  const unk = await send("nope", {}); assert(unk.error.includes("Неизвестная команда"));
  const ref = await send("batch", { commands: [{ command: "create_frame" }, { command: "nope" }, { command: "create_text", params: { parentId: "$1" } }] }); assert.equal(ref.result.error.index, 1);
  const found = await send("find_nodes", { text: "chang" }); assert.equal(found.result.total, 1);
  const del = await send("delete_node", { id: rect.id }); assert(!nodes.has(rect.id));
  // Новые верхнеуровневые слои не ложатся в (0,0) поверх существующих
  const f2 = await send("create_frame", { width: 400, height: 300 }); assert.equal(f2.result.x, 2220);
  const f3 = await send("create_frame", { x: 5, y: 5 }); assert.equal(f3.result.x, 5);
  // Копия остаётся в родителе оригинала
  const t2 = await send("clone_node", { id: text.id }); assert.equal(nodes.get(t2.result.id).parent.id, frame.id);
  // Текст с width переносится по строкам (HEIGHT), с FILL тоже
  const t3 = await send("create_text", { parentId: frame.id, text: "Wrap", layoutSizingHorizontal: "FILL" }); assert.equal(nodes.get(t3.result.id).textAutoResize, "HEIGHT");
  const t4 = await send("create_text", { text: "Hug" }); assert.equal(nodes.get(t4.result.id).textAutoResize, "WIDTH_AND_HEIGHT");
  console.log("ALL OK", JSON.stringify(tree.result).slice(0, 200));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

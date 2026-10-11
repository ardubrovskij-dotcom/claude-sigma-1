// Строгая заглушка figma.* для проверки пакетов команд навыка project-to-figma без Figma.
// Строгая заглушка figma.*: проверяет правила, на которых падает настоящий Plugin API.
const vm = require("vm"), fs = require("fs");
const FONTS = { Inter: ["Regular", "Medium", "Semi Bold", "Bold"], Manrope: ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
  "Playfair Display": ["Regular", "Bold"], "JetBrains Mono": ["Regular", "Bold"], "DM Sans": ["Regular", "Medium", "Bold"] };
const COMMON = ["id","type","name","x","y","width","height","visible","locked","opacity","rotation","blendMode","parent","removed",
  "fills","strokes","strokeWeight","strokeAlign","dashPattern","strokeCap","effects","constraints",
  "layoutSizingHorizontal","layoutSizingVertical","layoutPositioning","layoutGrow","layoutAlign"];
const FRAME = ["children","layoutMode","itemSpacing","counterAxisSpacing","layoutWrap","paddingTop","paddingRight","paddingBottom","paddingLeft",
  "primaryAxisAlignItems","counterAxisAlignItems","primaryAxisSizingMode","counterAxisSizingMode","clipsContent",
  "cornerRadius","topLeftRadius","topRightRadius","bottomRightRadius","bottomLeftRadius"];
const TEXT = ["characters","fontName","fontSize","lineHeight","letterSpacing","textAlignHorizontal","textAlignVertical","textAutoResize","textCase","textDecoration","paragraphSpacing"];
function createEnv() {
  let nextId = 1; const nodes = new Map(); const loaded = new Set(["Inter|Regular"]); const errors = [];
  const page = { id: "0:1", type: "PAGE", name: "Page 1", children: [], selection: [] };
  const isAuto = (n) => n && n.layoutMode && n.layoutMode !== "NONE";
  function make(type, extra) {
    const store = { layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED" };
    const n = { id: "1:" + nextId++, type, name: type, x: 0, y: 0, width: 100, height: 100, visible: true, locked: false, opacity: 1, rotation: 0,
      blendMode: "PASS_THROUGH", parent: null, removed: false, fills: [], strokes: [], strokeWeight: 1, strokeAlign: "INSIDE", dashPattern: [], strokeCap: "NONE",
      effects: [], constraints: {}, layoutPositioning: "AUTO", layoutGrow: 0, layoutAlign: "INHERIT" };
    for (const k of ["layoutSizingHorizontal", "layoutSizingVertical"]) Object.defineProperty(n, k, { enumerable: true,
      get: () => store[k],
      set(v) {
        if (!["FIXED", "HUG", "FILL"].includes(v)) throw new Error(`in set_${k}: invalid value ${v}`);
        if (v === "FILL" && !isAuto(n.parent)) throw new Error(`in set_${k}: FILL can only be set on children of auto-layout frames`);
        if (v === "HUG" && !(isAuto(n) || (n.type === "TEXT" && isAuto(n.parent)))) throw new Error(`in set_${k}: HUG can only be set on auto-layout frames or text children of auto-layout frames`);
        store[k] = v;
      } });
    Object.assign(n, extra);
    n.resize = function (w, h) { if (n.type === "TEXT") needFont(n); this.width = w; this.height = h; if (isAuto(this)) { this.primaryAxisSizingMode = "FIXED"; this.counterAxisSizingMode = "FIXED"; } };
    n.remove = function () { const p = this.parent; if (p) p.children.splice(p.children.indexOf(this), 1); this.removed = true; nodes.delete(this.id); };
    n.clone = function () { const c = FACTORY[type](); for (const k of Object.keys(this)) if (!["id","parent","children","removed"].includes(k) && typeof this[k] !== "function") { try { c[k] = JSON.parse(JSON.stringify(this[k])); } catch (e) {} }
      if (this.children) for (const ch of this.children) c.appendChild(ch.clone()); page.appendChild(c); return c; };
    n.exportAsync = async () => new Uint8Array([1, 2, 3]);
    if (n.children) {
      n.appendChild = (c) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = n; n.children.push(c); };
      n.insertChild = (i, c) => { n.appendChild(c); n.children.splice(n.children.indexOf(c), 1); n.children.splice(i, 0, c); };
      n.findAll = (f) => { const r = []; (function w(x) { for (const ch of x.children || []) { if (f(ch)) r.push(ch); w(ch); } })(n); return r; };
    }
    if (type === "TEXT") n.getRangeAllFontNames = () => [n.fontName];
    nodes.set(n.id, n);
    return Object.preventExtensions(n); // как в Figma: несуществующее свойство — ошибка
  }
  function needFont(t) { const f = t.fontName; if (!loaded.has(f.family + "|" + f.style)) throw new Error(`Cannot write to node with unloaded font "${f.family} ${f.style}"`); }
  function frameProps() { return { children: [], layoutMode: "NONE", itemSpacing: 0, counterAxisSpacing: 0, layoutWrap: "NO_WRAP", paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN", primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "AUTO", clipsContent: true,
    cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0, bottomRightRadius: 0, bottomLeftRadius: 0, fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }] }; }
  page.appendChild = (c) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = page; page.children.push(c); };
  page.insertChild = (i, c) => page.appendChild(c);
  page.findAll = (f) => { const r = []; (function w(x) { for (const ch of x.children || []) { if (f(ch)) r.push(ch); w(ch); } })(page); return r; };
  page.loadAsync = async () => {};
  const out = [];
  const figma = {
    mixed: Symbol("mixed"), editorType: "figma", root: { name: "Strict test", children: [page] }, currentPage: page,
    showUI() {}, notify() {}, viewport: { scrollAndZoomIntoView() {} }, base64Encode: (b) => Buffer.from(b).toString("base64"),
    ui: { postMessage(m) { out.push(m); }, onmessage: null },
    clientStorage: { async getAsync() { return {}; }, async setAsync() {} },
    async getNodeByIdAsync(id) { return id === page.id ? page : nodes.get(id) || null; },
    async loadFontAsync(f) { if (!(FONTS[f.family] || []).includes(f.style)) throw new Error(`The font "${f.family} ${f.style}" could not be loaded`); loaded.add(f.family + "|" + f.style); },
    async loadAllPagesAsync() {}, async setCurrentPageAsync(p) { figma.currentPage = p; },
    async listAvailableFontsAsync() { return Object.entries(FONTS).flatMap(([family, styles]) => styles.map((style) => ({ fontName: { family, style } }))); },
    createPage() { const p = { id: "0:" + nextId++, type: "PAGE", name: "Page", children: [] }; figma.root.children.push(p); p.appendChild = page.appendChild.bind(p); return p; },
    createFrame() { return make("FRAME", frameProps()); },
    createComponent() { return make("COMPONENT", frameProps()); },
    createRectangle() { return make("RECTANGLE", { cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0, bottomRightRadius: 0, bottomLeftRadius: 0, fills: [{ type: "SOLID", color: { r: .8, g: .8, b: .8 } }] }); },
    createEllipse() { return make("ELLIPSE", { arcData: {} }); },
    createPolygon() { return make("POLYGON", { pointCount: 3, cornerRadius: 0 }); },
    createStar() { return make("STAR", { pointCount: 5, innerRadius: 0.4, cornerRadius: 0 }); },
    createVector() { return make("VECTOR", { vectorPaths: [], cornerRadius: 0 }); },
    createNodeFromSvg(svg) { if (!/^<svg[\s>]/.test(svg.trim())) throw new Error("Failed to parse SVG"); const f = make("FRAME", frameProps()); page.appendChild(f); f.appendChild(make("VECTOR", { vectorPaths: [], cornerRadius: 0 })); return f; },
    createText() { return make("TEXT", { characters: "", fontName: { family: "Inter", style: "Regular" }, fontSize: 12, lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PERCENT", value: 0 },
      textAlignHorizontal: "LEFT", textAlignVertical: "TOP", textAutoResize: "WIDTH_AND_HEIGHT", textCase: "ORIGINAL", textDecoration: "NONE", paragraphSpacing: 0 }); },
    group() { throw new Error("not mocked"); },
  };
  const FACTORY = { FRAME: figma.createFrame, COMPONENT: figma.createComponent, RECTANGLE: figma.createRectangle, ELLIPSE: figma.createEllipse,
    POLYGON: figma.createPolygon, STAR: figma.createStar, VECTOR: figma.createVector, TEXT: () => origCreateText() };
  // Текст: запись свойств без загруженного шрифта — ошибка, как в Figma
  const origCreateText = figma.createText;
  figma.createText = () => { const t = origCreateText(); return t; };
  const code = fs.readFileSync(process.env.PLUGIN_JS || require("path").join(__dirname, "../../figma-plugin/dist/code.js"), "utf8");
  vm.runInNewContext(code, { figma, __html__: "", console });
  let seq = 0;
  async function send(command, params) { const id = "t" + ++seq; await figma.ui.onmessage({ type: "command", id, command, params }); return out.pop(); }
  return { send, figma, nodes, page };
}
module.exports = { createEnv };

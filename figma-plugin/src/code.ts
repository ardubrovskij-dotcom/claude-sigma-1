// Claude for Figma by Dubrovskiy — исполнитель команд внутри Figma.
// UI (ui.html) получает команды по WebSocket или из ручной консоли и пересылает
// их сюда как { type: "command", id, command, params }. Ответ уходит обратно
// как { type: "result", id, result } или { type: "result", id, error }.

type Params = Record<string, any>;
type Handler = (p: Params) => Promise<unknown>;
type ParentNode = BaseNode & ChildrenMixin;

const DEFAULT_FONT: FontName = { family: "Inter", style: "Regular" };

// ---------- Цвета и заливки ----------

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) throw new Error(`Некорректный цвет: ${hex}`);
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

function solid(hex: string): SolidPaint {
  const { r, g, b, a } = hexToRgba(hex);
  return { type: "SOLID", color: { r, g, b }, opacity: a };
}

// Линейный градиент: { type: "linear", stops: ["#hex", ...] | [{ color, position }], angle }
function linearGradient(spec: Params): GradientPaint {
  const raw: any[] = spec.stops || [];
  if (raw.length < 2) throw new Error("Градиенту нужно минимум 2 цвета в stops");
  const gradientStops: ColorStop[] = raw.map((s, i) => {
    const color = typeof s === "string" ? s : s.color;
    const position = typeof s === "string" ? i / (raw.length - 1) : s.position;
    const { r, g, b, a } = hexToRgba(color);
    return { color: { r, g, b, a }, position };
  });
  // angle в градусах: 0 — слева направо, 90 — сверху вниз.
  const rad = ((spec.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const gradientTransform: Transform = [
    [cos, sin, 0.5 - 0.5 * cos - 0.5 * sin],
    [-sin, cos, 0.5 + 0.5 * sin - 0.5 * cos],
  ];
  return { type: "GRADIENT_LINEAR", gradientStops, gradientTransform };
}

// "#hex" | null | ["#hex", { type: "linear", ... }, <Paint Figma>]
function toPaints(value: unknown): Paint[] {
  if (value === null || value === undefined || value === "none") return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((v: any) => {
    if (typeof v === "string") return solid(v);
    if (v && v.type === "linear") return linearGradient(v);
    return v as Paint;
  });
}

// ---------- Поиск узлов ----------

async function getNode(id: string): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error(`Узел не найден: ${id}`);
  if (node.type === "DOCUMENT" || node.type === "PAGE") throw new Error(`Узел ${id} не является слоем`);
  return node as SceneNode;
}

async function getParent(parentId?: string): Promise<ParentNode> {
  if (!parentId) return figma.currentPage;
  const node = await figma.getNodeByIdAsync(parentId);
  if (!node) throw new Error(`Родитель не найден: ${parentId}`);
  if (!("appendChild" in node)) throw new Error(`Узел ${parentId} (${node.type}) не может содержать дочерние слои`);
  return node as ParentNode;
}

async function insert(node: SceneNode, p: Params): Promise<void> {
  const parent = await getParent(p.parentId);
  if (typeof p.index === "number") parent.insertChild(p.index, node);
  else parent.appendChild(node);
  // Новые слои на странице появляются в (0,0) поверх существующих — без явных координат
  // ставим справа от самого правого слоя.
  if (parent.type === "PAGE" && p.x === undefined && p.y === undefined) placeOnFreeSpace(node);
}

function placeOnFreeSpace(node: SceneNode): void {
  let maxRight: number | null = null;
  for (const child of figma.currentPage.children) {
    if (child === node) continue;
    const right = child.x + child.width;
    if (maxRight === null || right > maxRight) maxRight = right;
  }
  node.x = maxRight === null ? 0 : Math.round(maxRight + 100);
  node.y = 0;
}

// ---------- Свойства ----------

const round = (n: number) => Math.round(n * 100) / 100;

async function applyProps(node: SceneNode, p: Params): Promise<void> {
  const n = node as any;
  if (p.name !== undefined) n.name = p.name;
  if (p.x !== undefined) n.x = p.x;
  if (p.y !== undefined) n.y = p.y;
  if (node.type === "TEXT") {
    // Текст по умолчанию WIDTH_AND_HEIGHT: игнорирует заданную ширину и FILL и схлопывается.
    // Для переноса строк нужен HEIGHT (или NONE при заданной высоте), причём до resize().
    if (p.textAutoResize !== undefined) node.textAutoResize = p.textAutoResize;
    else if (node.textAutoResize === "WIDTH_AND_HEIGHT" && (p.width !== undefined || p.layoutSizingHorizontal === "FILL")) {
      await loadFontsOf(node);
      node.textAutoResize = p.height !== undefined ? "NONE" : "HEIGHT";
    }
  }
  // resize() сбрасывает режимы размеров auto layout в FIXED, поэтому идёт до них.
  if ((p.width !== undefined || p.height !== undefined) && "resize" in n) {
    if (node.type === "TEXT") await loadFontsOf(node);
    n.resize(Math.max(0.01, p.width ?? n.width), Math.max(0.01, p.height ?? n.height));
  }
  if (p.rotation !== undefined) n.rotation = p.rotation;
  if (p.opacity !== undefined) n.opacity = p.opacity;
  if (p.visible !== undefined) n.visible = p.visible;
  if (p.locked !== undefined) n.locked = p.locked;
  if (p.blendMode !== undefined) n.blendMode = p.blendMode;

  if ("fills" in n) {
    if (p.fill !== undefined) n.fills = toPaints(p.fill);
    if (p.fills !== undefined) n.fills = toPaints(p.fills);
  }
  if ("strokes" in n) {
    if (p.stroke !== undefined) n.strokes = toPaints(p.stroke);
    if (p.strokeWeight !== undefined) n.strokeWeight = p.strokeWeight;
    if (p.strokeAlign !== undefined) n.strokeAlign = p.strokeAlign;
    if (p.dashPattern !== undefined) n.dashPattern = p.dashPattern;
    if (p.strokeCap !== undefined) n.strokeCap = p.strokeCap;
  }
  if ("cornerRadius" in n && p.cornerRadius !== undefined) {
    if (Array.isArray(p.cornerRadius)) {
      const [tl, tr, br, bl] = p.cornerRadius;
      Object.assign(n, { topLeftRadius: tl, topRightRadius: tr, bottomRightRadius: br, bottomLeftRadius: bl });
    } else n.cornerRadius = p.cornerRadius;
  }
  if ("clipsContent" in n && p.clipsContent !== undefined) n.clipsContent = p.clipsContent;
  if ("effects" in n && p.effects !== undefined) n.effects = p.effects.map(toEffect);

  // Auto layout контейнера
  if ("layoutMode" in n) {
    if (p.layoutMode !== undefined) n.layoutMode = p.layoutMode; // NONE | HORIZONTAL | VERTICAL | GRID
    if (n.layoutMode !== "NONE") {
      if (p.itemSpacing !== undefined) n.itemSpacing = p.itemSpacing;
      if (p.counterAxisSpacing !== undefined) n.counterAxisSpacing = p.counterAxisSpacing;
      if (p.layoutWrap !== undefined) n.layoutWrap = p.layoutWrap;
      if (p.padding !== undefined) {
        const [t, r, b, l] = Array.isArray(p.padding)
          ? p.padding.length === 2
            ? [p.padding[0], p.padding[1], p.padding[0], p.padding[1]]
            : p.padding
          : [p.padding, p.padding, p.padding, p.padding];
        Object.assign(n, { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l });
      }
      for (const k of [
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "primaryAxisAlignItems", "counterAxisAlignItems",
        "primaryAxisSizingMode", "counterAxisSizingMode",
      ]) {
        if (p[k] !== undefined) n[k] = p[k];
      }
    }
  }

  // Поведение внутри auto layout родителя (выставляется после вставки в родителя)
  for (const k of ["layoutSizingHorizontal", "layoutSizingVertical", "layoutPositioning", "layoutGrow", "layoutAlign"]) {
    if (p[k] !== undefined && k in n) n[k] = p[k];
  }
  if (p.constraints !== undefined && "constraints" in n) n.constraints = p.constraints;

  if (node.type === "TEXT") await applyTextProps(node, p);
}

// { type: "shadow", color, x, y, blur, spread } | { type: "blur", radius } | <Effect Figma>
function toEffect(e: any): Effect {
  if (e.type === "shadow" || e.type === "inner-shadow") {
    const { r, g, b, a } = hexToRgba(e.color || "#00000040");
    return {
      type: e.type === "shadow" ? "DROP_SHADOW" : "INNER_SHADOW",
      color: { r, g, b, a },
      offset: { x: e.x ?? 0, y: e.y ?? 4 },
      radius: e.blur ?? 12,
      spread: e.spread ?? 0,
      visible: true,
      blendMode: "NORMAL",
    } as Effect;
  }
  if (e.type === "blur") return { type: "LAYER_BLUR", radius: e.radius ?? 8, visible: true } as Effect;
  if (e.type === "background-blur") return { type: "BACKGROUND_BLUR", radius: e.radius ?? 8, visible: true } as Effect;
  return e as Effect;
}

async function loadFontsOf(node: TextNode): Promise<void> {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
  } else {
    await Promise.all(node.getRangeAllFontNames(0, node.characters.length).map((f) => figma.loadFontAsync(f)));
  }
}

async function applyTextProps(node: TextNode, p: Params): Promise<void> {
  const textKeys = ["text", "fontFamily", "fontStyle", "fontSize", "lineHeight", "letterSpacing", "textAlign",
    "textAlignVertical", "textAutoResize", "textCase", "textDecoration", "paragraphSpacing"];
  if (!textKeys.some((k) => p[k] !== undefined)) return;

  await loadFontsOf(node);
  if (p.fontFamily !== undefined || p.fontStyle !== undefined) {
    const current = node.fontName === figma.mixed ? DEFAULT_FONT : node.fontName;
    const font: FontName = { family: p.fontFamily ?? current.family, style: p.fontStyle ?? current.style };
    await figma.loadFontAsync(font);
    node.fontName = font;
  }
  if (p.text !== undefined) node.characters = String(p.text);
  if (p.fontSize !== undefined) node.fontSize = p.fontSize;
  if (p.lineHeight !== undefined) node.lineHeight = toUnitValue(p.lineHeight, true) as LineHeight;
  if (p.letterSpacing !== undefined) node.letterSpacing = toUnitValue(p.letterSpacing, false) as LetterSpacing;
  if (p.textAlign !== undefined) node.textAlignHorizontal = p.textAlign; // LEFT | CENTER | RIGHT | JUSTIFIED
  if (p.textAlignVertical !== undefined) node.textAlignVertical = p.textAlignVertical;
  if (p.textCase !== undefined) node.textCase = p.textCase;
  if (p.textDecoration !== undefined) node.textDecoration = p.textDecoration;
  if (p.paragraphSpacing !== undefined) node.paragraphSpacing = p.paragraphSpacing;
  if (p.textAutoResize !== undefined) node.textAutoResize = p.textAutoResize;
}

// 24 → пиксели; "120%" → проценты; "auto" → AUTO (только для lineHeight)
function toUnitValue(v: number | string, allowAuto: boolean): LineHeight | LetterSpacing {
  if (allowAuto && v === "auto") return { unit: "AUTO" };
  if (typeof v === "string" && v.trim().endsWith("%")) return { unit: "PERCENT", value: parseFloat(v) };
  return { unit: "PIXELS", value: Number(v) };
}

// ---------- Сериализация ----------

function describePaints(paints: ReadonlyArray<Paint> | PluginAPI["mixed"]): unknown {
  if (paints === figma.mixed) return "mixed";
  return paints.map((paint) => {
    if (paint.type === "SOLID") {
      const c = paint.color;
      const hex = [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
      return paint.opacity !== undefined && paint.opacity < 1 ? `#${hex} @${round(paint.opacity)}` : `#${hex}`;
    }
    return paint.type;
  });
}

function serialize(node: BaseNode, depth: number): Record<string, unknown> {
  const n = node as any;
  const out: Record<string, unknown> = { id: node.id, name: node.name, type: node.type };
  if ("x" in n) Object.assign(out, { x: round(n.x), y: round(n.y), width: round(n.width), height: round(n.height) });
  if ("visible" in n && !n.visible) out.visible = false;
  if ("fills" in n && n.fills !== figma.mixed && n.fills.length) out.fills = describePaints(n.fills);
  if ("strokes" in n && n.strokes.length) out.strokes = describePaints(n.strokes);
  if ("layoutMode" in n && n.layoutMode !== "NONE") {
    Object.assign(out, { layoutMode: n.layoutMode, itemSpacing: n.itemSpacing });
  }
  if (node.type === "TEXT") {
    const t = node as TextNode;
    out.characters = t.characters.length > 500 ? t.characters.slice(0, 500) + "…" : t.characters;
    out.fontSize = t.fontSize === figma.mixed ? "mixed" : t.fontSize;
    out.fontName = t.fontName === figma.mixed ? "mixed" : t.fontName;
  }
  if ("children" in n) {
    if (depth > 0) out.children = n.children.map((c: BaseNode) => serialize(c, depth - 1));
    else out.childCount = n.children.length;
  }
  return out;
}

const brief = (node: BaseNode) => serialize(node, 0);

// ---------- Команды ----------

// Создание без мусора: если параметры не применились, созданный слой удаляется.
async function created(node: SceneNode, build: () => Promise<void>): Promise<unknown> {
  try {
    await build();
  } catch (e) {
    if (!node.removed) node.remove();
    throw e;
  }
  return brief(node);
}

async function createShape(node: SceneNode, p: Params): Promise<unknown> {
  return created(node, async () => {
    await insert(node, p);
    await applyProps(node, p);
  });
}

const handlers: Record<string, Handler> = {
  async ping() {
    return { ok: true, editor: figma.editorType, file: figma.root.name, page: figma.currentPage.name };
  },

  async list_commands() {
    return COMMAND_DOCS;
  },

  async get_document_info() {
    await figma.loadAllPagesAsync();
    return {
      file: figma.root.name,
      currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
      pages: figma.root.children.map((pg) => ({ id: pg.id, name: pg.name, childCount: pg.children.length })),
    };
  },

  async get_page(p) {
    const page = p.pageId ? await figma.getNodeByIdAsync(p.pageId) : figma.currentPage;
    if (!page || page.type !== "PAGE") throw new Error(`Страница не найдена: ${p.pageId}`);
    await (page as PageNode).loadAsync();
    return serialize(page, p.depth ?? 1);
  },

  async set_current_page(p) {
    const page = await figma.getNodeByIdAsync(p.pageId);
    if (!page || page.type !== "PAGE") throw new Error(`Страница не найдена: ${p.pageId}`);
    await figma.setCurrentPageAsync(page as PageNode);
    return { id: page.id, name: page.name };
  },

  async create_page(p) {
    const page = figma.createPage();
    page.name = p.name ?? "Page";
    if (p.switchTo !== false) await figma.setCurrentPageAsync(page);
    return { id: page.id, name: page.name };
  },

  async get_selection(p) {
    return figma.currentPage.selection.map((n) => serialize(n, p.depth ?? 0));
  },

  async get_node(p) {
    return serialize(await getNode(p.id), p.depth ?? 1);
  },

  async find_nodes(p) {
    const root = p.rootId ? await getParent(p.rootId) : figma.currentPage;
    const limit = p.limit ?? 50;
    const found = (root as ChildrenMixin).findAll((n) => {
      if (p.type && n.type !== p.type) return false;
      if (p.name && !n.name.toLowerCase().includes(String(p.name).toLowerCase())) return false;
      if (p.text && !(n.type === "TEXT" && n.characters.toLowerCase().includes(String(p.text).toLowerCase()))) return false;
      return true;
    });
    return { total: found.length, nodes: found.slice(0, limit).map(brief) };
  },

  async create_frame(p) {
    const frame = figma.createFrame();
    if (p.fill === undefined && p.fills === undefined) frame.fills = [];
    return createShape(frame, { width: 100, height: 100, ...p });
  },

  async create_rectangle(p) {
    return createShape(figma.createRectangle(), { width: 100, height: 100, ...p });
  },

  async create_ellipse(p) {
    const ellipse = figma.createEllipse();
    if (p.arc) ellipse.arcData = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0, ...p.arc };
    return createShape(ellipse, { width: 100, height: 100, ...p });
  },

  async create_polygon(p) {
    const polygon = figma.createPolygon();
    if (p.pointCount !== undefined) polygon.pointCount = p.pointCount;
    return createShape(polygon, { width: 100, height: 100, ...p });
  },

  async create_star(p) {
    const star = figma.createStar();
    if (p.pointCount !== undefined) star.pointCount = p.pointCount;
    if (p.innerRadius !== undefined) star.innerRadius = p.innerRadius;
    return createShape(star, { width: 100, height: 100, ...p });
  },

  async create_line(p) {
    // Линия из (x1, y1) в (x2, y2) в координатах родителя.
    const { x1 = 0, y1 = 0, x2 = 100, y2 = 0 } = p;
    const vector = figma.createVector();
    vector.vectorPaths = [{ windingRule: "NONE", data: `M 0 0 L ${x2 - x1} ${y2 - y1}` }];
    return createShape(vector, { stroke: "#000000", strokeWeight: 1, ...p, x: Math.min(x1, x2), y: Math.min(y1, y2) });
  },

  async create_vector(p) {
    // paths: [{ data: "M 0 0 L 10 10 Z", windingRule: "NONZERO" | "EVENODD" | "NONE" }]
    // Формат Figma: только абсолютные M L Q C Z, разделитель — пробел. Для произвольного SVG — create_svg.
    const paths = p.paths ?? (p.path ? [{ data: p.path }] : null);
    if (!paths) throw new Error("Нужен paths или path");
    const vector = figma.createVector();
    const { width, height, ...rest } = p; // размер берётся из геометрии пути; width/height масштабируют
    return created(vector, async () => {
      vector.vectorPaths = paths.map((v: any) => ({ windingRule: v.windingRule ?? "NONZERO", data: v.data }));
      await insert(vector, rest);
      await applyProps(vector, rest);
      if (width !== undefined || height !== undefined) vector.resize(width ?? vector.width, height ?? vector.height);
    });
  },

  async create_svg(p) {
    if (!p.svg) throw new Error("Нужен svg (строка с разметкой <svg>)");
    const node = figma.createNodeFromSvg(p.svg);
    if (p.fill === undefined && p.fills === undefined) node.fills = [];
    return createShape(node, p);
  },

  async create_text(p) {
    const font: FontName = { family: p.fontFamily ?? DEFAULT_FONT.family, style: p.fontStyle ?? DEFAULT_FONT.style };
    await figma.loadFontAsync(font); // до createText: при неизвестном шрифте слой не создаётся
    const text = figma.createText();
    return created(text, async () => {
      text.fontName = font;
      text.characters = String(p.text ?? "");
      await insert(text, p);
      // С width текст переносится по строкам, высота подстраивается (см. applyProps).
      await applyProps(text, { fill: "#000000", ...p });
      if (text.characters.length > 0 && text.width < 1) throw new Error("Текст схлопнулся по ширине — задайте width");
    });
  },

  async create_component(p) {
    const component = figma.createComponent();
    if (p.fill === undefined && p.fills === undefined) component.fills = [];
    return createShape(component, { width: 100, height: 100, ...p });
  },

  async create_instance(p) {
    const source = await getNode(p.componentId);
    if (source.type !== "COMPONENT") throw new Error(`Узел ${p.componentId} не компонент`);
    return createShape(source.createInstance(), p);
  },

  async update_node(p) {
    const node = await getNode(p.id);
    const { id, ...props } = p;
    await applyProps(node, props);
    return brief(node);
  },

  async move_to_parent(p) {
    const node = await getNode(p.id);
    await insert(node, p);
    if (p.x !== undefined || p.y !== undefined) await applyProps(node, { x: p.x, y: p.y });
    return brief(node);
  },

  async clone_node(p) {
    const source = await getNode(p.id);
    const copy = source.clone(); // Figma кладёт копию на страницу — возвращаем к оригиналу
    if (p.parentId) await insert(copy, p);
    else {
      const parent = source.parent as ParentNode;
      parent.insertChild(parent.children.indexOf(source) + 1, copy);
      if (parent.type === "PAGE" && p.x === undefined && p.y === undefined) placeOnFreeSpace(copy);
    }
    const { id, parentId, index, ...props } = p;
    await applyProps(copy, props);
    return brief(copy);
  },

  async delete_node(p) {
    const ids: string[] = p.ids ?? [p.id];
    for (const id of ids) (await getNode(id)).remove();
    return { deleted: ids };
  },

  async group(p) {
    const nodes = await Promise.all((p.ids as string[]).map(getNode));
    if (!nodes.length) throw new Error("Нужен непустой ids");
    const group = figma.group(nodes, nodes[0].parent as ParentNode & BaseNode);
    if (p.name) group.name = p.name;
    return brief(group);
  },

  async ungroup(p) {
    const node = await getNode(p.id);
    if (!("children" in node)) throw new Error(`Узел ${p.id} не содержит дочерних слоёв`);
    return figma.ungroup(node as SceneNode & ChildrenMixin).map(brief);
  },

  async boolean(p) {
    // operation: UNION | SUBTRACT | INTERSECT | EXCLUDE
    const nodes = await Promise.all((p.ids as string[]).map(getNode));
    const parent = nodes[0].parent as BaseNode & ChildrenMixin;
    const operation = String(p.operation || "UNION").toUpperCase();
    let result: BooleanOperationNode;
    if (operation === "UNION") result = figma.union(nodes, parent);
    else if (operation === "SUBTRACT") result = figma.subtract(nodes, parent);
    else if (operation === "INTERSECT") result = figma.intersect(nodes, parent);
    else if (operation === "EXCLUDE") result = figma.exclude(nodes, parent);
    else throw new Error(`Неизвестная операция: ${p.operation}`);
    if (p.name) result.name = p.name;
    return brief(result);
  },

  async flatten(p) {
    const nodes = await Promise.all((p.ids as string[]).map(getNode));
    return brief(figma.flatten(nodes));
  },

  async select(p) {
    const nodes = await Promise.all(((p.ids ?? []) as string[]).map(getNode));
    figma.currentPage.selection = nodes;
    if (p.zoom !== false && nodes.length) figma.viewport.scrollAndZoomIntoView(nodes);
    return { selected: nodes.map((n) => n.id) };
  },

  async export_node(p) {
    const node = await getNode(p.id);
    const format = String(p.format || "PNG").toUpperCase();
    if (format === "SVG") {
      return { format, data: await node.exportAsync({ format: "SVG_STRING" }) };
    }
    const bytes = await node.exportAsync({
      format: format as "PNG" | "JPG" | "PDF",
      constraint: { type: "SCALE", value: p.scale ?? 1 },
    });
    return { format, base64: figma.base64Encode(bytes), bytes: bytes.length };
  },

  async list_fonts(p) {
    const fonts = await figma.listAvailableFontsAsync();
    const q = p.family ? String(p.family).toLowerCase() : null;
    const filtered = q ? fonts.filter((f) => f.fontName.family.toLowerCase().includes(q)) : fonts;
    const byFamily: Record<string, string[]> = {};
    for (const f of filtered) (byFamily[f.fontName.family] ||= []).push(f.fontName.style);
    const families = Object.keys(byFamily);
    return { total: families.length, fonts: families.slice(0, p.limit ?? 100).map((family) => ({ family, styles: byFamily[family] })) };
  },

  async notify(p) {
    figma.notify(String(p.message ?? ""), { timeout: p.timeout ?? 3000 });
    return { ok: true };
  },

  async batch(p) {
    // commands: [{ command, params }]. В params строка "$N" заменяется на id результата N-й команды,
    // поэтому можно создать фрейм и сразу положить в него детей: { parentId: "$0" }.
    const commands: Array<{ command: string; params?: Params }> = p.commands || [];
    const results: unknown[] = [];
    for (let i = 0; i < commands.length; i++) {
      const { command, params = {} } = commands[i];
      try {
        results.push(await execute(command, resolveRefs(params, results)));
      } catch (e) {
        const error = { index: i, command, message: errorMessage(e) };
        if (!p.continueOnError) return { results, error };
        results.push({ error });
      }
    }
    return { results };
  },
};

function resolveRefs(value: any, results: unknown[]): any {
  if (typeof value === "string") {
    const m = /^\$(\d+)$/.exec(value);
    if (!m) return value;
    const ref = results[Number(m[1])] as { id?: string } | undefined;
    if (!ref || !ref.id) throw new Error(`Ссылка ${value} указывает на результат без id`);
    return ref.id;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, results));
  if (value && typeof value === "object") {
    const out: Params = {};
    for (const k of Object.keys(value)) out[k] = resolveRefs(value[k], results);
    return out;
  }
  return value;
}

const COMMAND_DOCS: Record<string, string> = {
  ping: "Проверка связи",
  list_commands: "Список команд",
  get_document_info: "Страницы файла",
  get_page: "{ pageId?, depth? } — дерево страницы",
  set_current_page: "{ pageId }",
  create_page: "{ name, switchTo? }",
  get_selection: "{ depth? } — выделенные слои",
  get_node: "{ id, depth? }",
  find_nodes: "{ type?, name?, text?, rootId?, limit? }",
  create_frame: "{ name, x, y, width, height, fill, parentId, cornerRadius, layoutMode, itemSpacing, padding, ... }",
  create_rectangle: "{ x, y, width, height, fill, stroke, cornerRadius, parentId }",
  create_ellipse: "{ x, y, width, height, fill, arc? }",
  create_polygon: "{ x, y, width, height, pointCount, fill }",
  create_star: "{ x, y, width, height, pointCount, innerRadius, fill }",
  create_line: "{ x1, y1, x2, y2, stroke, strokeWeight, dashPattern }",
  create_vector: "{ paths: [{ data, windingRule }] | path, x, y, width?, height?, fill, stroke }",
  create_svg: "{ svg, x, y, width?, height?, parentId } — импорт SVG-разметки",
  create_text: "{ text, x, y, width?, fontFamily, fontStyle, fontSize, fill, lineHeight, letterSpacing, textAlign, parentId }",
  create_component: "{ name, x, y, width, height, ... }",
  create_instance: "{ componentId, x, y, parentId }",
  update_node: "{ id, ...любые свойства из create_* }",
  move_to_parent: "{ id, parentId?, index?, x?, y? }",
  clone_node: "{ id, parentId?, x?, y?, ... }",
  delete_node: "{ id } | { ids }",
  group: "{ ids, name? }",
  ungroup: "{ id }",
  boolean: "{ ids, operation: UNION|SUBTRACT|INTERSECT|EXCLUDE }",
  flatten: "{ ids }",
  select: "{ ids, zoom? }",
  export_node: "{ id, format: PNG|JPG|SVG|PDF, scale? }",
  list_fonts: "{ family?, limit? }",
  notify: "{ message, timeout? }",
  batch: "{ commands: [{ command, params }], continueOnError? } — \"$N\" = id результата N",
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function execute(command: string, params: Params): Promise<unknown> {
  const handler = handlers[command];
  if (!handler) throw new Error(`Неизвестная команда: ${command}. См. list_commands`);
  return handler(params || {});
}

// ---------- Связь с UI ----------

figma.showUI(__html__, { width: 380, height: 680, themeColors: true });

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "command") {
    try {
      const result = await execute(msg.command, msg.params);
      figma.ui.postMessage({ type: "result", id: msg.id, result });
    } catch (e) {
      figma.ui.postMessage({ type: "result", id: msg.id, error: errorMessage(e) });
    }
  } else if (msg.type === "load-settings") {
    figma.ui.postMessage({ type: "settings", settings: (await figma.clientStorage.getAsync("settings")) || {} });
  } else if (msg.type === "save-settings") {
    await figma.clientStorage.setAsync("settings", msg.settings);
  }
};

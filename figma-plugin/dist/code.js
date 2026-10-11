"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // src/code.ts
  var DEFAULT_FONT = { family: "Inter", style: "Regular" };
  function hexToRgba(hex) {
    let h = hex.trim().replace(/^#/, "");
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) throw new Error(`\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0446\u0432\u0435\u0442: ${hex}`);
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  function solid(hex) {
    const { r, g, b, a } = hexToRgba(hex);
    return { type: "SOLID", color: { r, g, b }, opacity: a };
  }
  function linearGradient(spec) {
    const raw = spec.stops || [];
    if (raw.length < 2) throw new Error("\u0413\u0440\u0430\u0434\u0438\u0435\u043D\u0442\u0443 \u043D\u0443\u0436\u043D\u043E \u043C\u0438\u043D\u0438\u043C\u0443\u043C 2 \u0446\u0432\u0435\u0442\u0430 \u0432 stops");
    const gradientStops = raw.map((s, i) => {
      const color = typeof s === "string" ? s : s.color;
      const position = typeof s === "string" ? i / (raw.length - 1) : s.position;
      const { r, g, b, a } = hexToRgba(color);
      return { color: { r, g, b, a }, position };
    });
    const rad = (spec.angle || 0) * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const gradientTransform = [
      [cos, sin, 0.5 - 0.5 * cos - 0.5 * sin],
      [-sin, cos, 0.5 + 0.5 * sin - 0.5 * cos]
    ];
    return { type: "GRADIENT_LINEAR", gradientStops, gradientTransform };
  }
  function toPaints(value) {
    if (value === null || value === void 0 || value === "none") return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map((v) => {
      if (typeof v === "string") return solid(v);
      if (v && v.type === "linear") return linearGradient(v);
      return v;
    });
  }
  async function getNode(id) {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) throw new Error(`\u0423\u0437\u0435\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D: ${id}`);
    if (node.type === "DOCUMENT" || node.type === "PAGE") throw new Error(`\u0423\u0437\u0435\u043B ${id} \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0441\u043B\u043E\u0435\u043C`);
    return node;
  }
  async function getParent(parentId) {
    if (!parentId) return figma.currentPage;
    const node = await figma.getNodeByIdAsync(parentId);
    if (!node) throw new Error(`\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D: ${parentId}`);
    if (!("appendChild" in node)) throw new Error(`\u0423\u0437\u0435\u043B ${parentId} (${node.type}) \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0435 \u0441\u043B\u043E\u0438`);
    return node;
  }
  async function insert(node, p) {
    const parent = await getParent(p.parentId);
    if (typeof p.index === "number") parent.insertChild(p.index, node);
    else parent.appendChild(node);
    if (parent.type === "PAGE" && p.x === void 0 && p.y === void 0) placeOnFreeSpace(node);
  }
  function placeOnFreeSpace(node) {
    let maxRight = null;
    for (const child of figma.currentPage.children) {
      if (child === node) continue;
      const right = child.x + child.width;
      if (maxRight === null || right > maxRight) maxRight = right;
    }
    node.x = maxRight === null ? 0 : Math.round(maxRight + 100);
    node.y = 0;
  }
  var round = (n) => Math.round(n * 100) / 100;
  async function applyProps(node, p) {
    var _a, _b;
    const n = node;
    if (p.name !== void 0) n.name = p.name;
    if (p.x !== void 0) n.x = p.x;
    if (p.y !== void 0) n.y = p.y;
    if (node.type === "TEXT") {
      if (p.textAutoResize !== void 0) node.textAutoResize = p.textAutoResize;
      else if (node.textAutoResize === "WIDTH_AND_HEIGHT" && (p.width !== void 0 || p.layoutSizingHorizontal === "FILL")) {
        await loadFontsOf(node);
        node.textAutoResize = p.height !== void 0 ? "NONE" : "HEIGHT";
      }
    }
    if ((p.width !== void 0 || p.height !== void 0) && "resize" in n) {
      if (node.type === "TEXT") await loadFontsOf(node);
      n.resize(Math.max(0.01, (_a = p.width) != null ? _a : n.width), Math.max(0.01, (_b = p.height) != null ? _b : n.height));
    }
    if (p.rotation !== void 0) n.rotation = p.rotation;
    if (p.opacity !== void 0) n.opacity = p.opacity;
    if (p.visible !== void 0) n.visible = p.visible;
    if (p.locked !== void 0) n.locked = p.locked;
    if (p.blendMode !== void 0) n.blendMode = p.blendMode;
    if ("fills" in n) {
      if (p.fill !== void 0) n.fills = toPaints(p.fill);
      if (p.fills !== void 0) n.fills = toPaints(p.fills);
    }
    if ("strokes" in n) {
      if (p.stroke !== void 0) n.strokes = toPaints(p.stroke);
      if (p.strokeWeight !== void 0) n.strokeWeight = p.strokeWeight;
      if (p.strokeAlign !== void 0) n.strokeAlign = p.strokeAlign;
      if (p.dashPattern !== void 0) n.dashPattern = p.dashPattern;
      if (p.strokeCap !== void 0) n.strokeCap = p.strokeCap;
    }
    if ("cornerRadius" in n && p.cornerRadius !== void 0) {
      if (Array.isArray(p.cornerRadius)) {
        const [tl, tr, br, bl] = p.cornerRadius;
        Object.assign(n, { topLeftRadius: tl, topRightRadius: tr, bottomRightRadius: br, bottomLeftRadius: bl });
      } else n.cornerRadius = p.cornerRadius;
    }
    if ("clipsContent" in n && p.clipsContent !== void 0) n.clipsContent = p.clipsContent;
    if ("effects" in n && p.effects !== void 0) n.effects = p.effects.map(toEffect);
    if ("layoutMode" in n) {
      if (p.layoutMode !== void 0) n.layoutMode = p.layoutMode;
      if (n.layoutMode !== "NONE") {
        if (p.itemSpacing !== void 0) n.itemSpacing = p.itemSpacing;
        if (p.counterAxisSpacing !== void 0) n.counterAxisSpacing = p.counterAxisSpacing;
        if (p.layoutWrap !== void 0) n.layoutWrap = p.layoutWrap;
        if (p.padding !== void 0) {
          const [t, r, b, l] = Array.isArray(p.padding) ? p.padding.length === 2 ? [p.padding[0], p.padding[1], p.padding[0], p.padding[1]] : p.padding : [p.padding, p.padding, p.padding, p.padding];
          Object.assign(n, { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l });
        }
        for (const k of [
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
          "primaryAxisAlignItems",
          "counterAxisAlignItems",
          "primaryAxisSizingMode",
          "counterAxisSizingMode"
        ]) {
          if (p[k] !== void 0) n[k] = p[k];
        }
      }
    }
    for (const k of ["layoutSizingHorizontal", "layoutSizingVertical", "layoutPositioning", "layoutGrow", "layoutAlign"]) {
      if (p[k] !== void 0 && k in n) n[k] = p[k];
    }
    if (p.constraints !== void 0 && "constraints" in n) n.constraints = p.constraints;
    if (node.type === "TEXT") await applyTextProps(node, p);
  }
  function toEffect(e) {
    var _a, _b, _c, _d, _e, _f;
    if (e.type === "shadow" || e.type === "inner-shadow") {
      const { r, g, b, a } = hexToRgba(e.color || "#00000040");
      return {
        type: e.type === "shadow" ? "DROP_SHADOW" : "INNER_SHADOW",
        color: { r, g, b, a },
        offset: { x: (_a = e.x) != null ? _a : 0, y: (_b = e.y) != null ? _b : 4 },
        radius: (_c = e.blur) != null ? _c : 12,
        spread: (_d = e.spread) != null ? _d : 0,
        visible: true,
        blendMode: "NORMAL"
      };
    }
    if (e.type === "blur") return { type: "LAYER_BLUR", radius: (_e = e.radius) != null ? _e : 8, visible: true };
    if (e.type === "background-blur") return { type: "BACKGROUND_BLUR", radius: (_f = e.radius) != null ? _f : 8, visible: true };
    return e;
  }
  async function loadFontsOf(node) {
    if (node.fontName !== figma.mixed) {
      await figma.loadFontAsync(node.fontName);
    } else {
      await Promise.all(node.getRangeAllFontNames(0, node.characters.length).map((f) => figma.loadFontAsync(f)));
    }
  }
  async function applyTextProps(node, p) {
    var _a, _b;
    const textKeys = [
      "text",
      "fontFamily",
      "fontStyle",
      "fontSize",
      "lineHeight",
      "letterSpacing",
      "textAlign",
      "textAlignVertical",
      "textAutoResize",
      "textCase",
      "textDecoration",
      "paragraphSpacing"
    ];
    if (!textKeys.some((k) => p[k] !== void 0)) return;
    await loadFontsOf(node);
    if (p.fontFamily !== void 0 || p.fontStyle !== void 0) {
      const current = node.fontName === figma.mixed ? DEFAULT_FONT : node.fontName;
      const font = { family: (_a = p.fontFamily) != null ? _a : current.family, style: (_b = p.fontStyle) != null ? _b : current.style };
      await figma.loadFontAsync(font);
      node.fontName = font;
    }
    if (p.text !== void 0) node.characters = String(p.text);
    if (p.fontSize !== void 0) node.fontSize = p.fontSize;
    if (p.lineHeight !== void 0) node.lineHeight = toUnitValue(p.lineHeight, true);
    if (p.letterSpacing !== void 0) node.letterSpacing = toUnitValue(p.letterSpacing, false);
    if (p.textAlign !== void 0) node.textAlignHorizontal = p.textAlign;
    if (p.textAlignVertical !== void 0) node.textAlignVertical = p.textAlignVertical;
    if (p.textCase !== void 0) node.textCase = p.textCase;
    if (p.textDecoration !== void 0) node.textDecoration = p.textDecoration;
    if (p.paragraphSpacing !== void 0) node.paragraphSpacing = p.paragraphSpacing;
    if (p.textAutoResize !== void 0) node.textAutoResize = p.textAutoResize;
  }
  function toUnitValue(v, allowAuto) {
    if (allowAuto && v === "auto") return { unit: "AUTO" };
    if (typeof v === "string" && v.trim().endsWith("%")) return { unit: "PERCENT", value: parseFloat(v) };
    return { unit: "PIXELS", value: Number(v) };
  }
  function describePaints(paints) {
    if (paints === figma.mixed) return "mixed";
    return paints.map((paint) => {
      if (paint.type === "SOLID") {
        const c = paint.color;
        const hex = [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
        return paint.opacity !== void 0 && paint.opacity < 1 ? `#${hex} @${round(paint.opacity)}` : `#${hex}`;
      }
      return paint.type;
    });
  }
  function serialize(node, depth) {
    const n = node;
    const out = { id: node.id, name: node.name, type: node.type };
    if ("x" in n) Object.assign(out, { x: round(n.x), y: round(n.y), width: round(n.width), height: round(n.height) });
    if ("visible" in n && !n.visible) out.visible = false;
    if ("fills" in n && n.fills !== figma.mixed && n.fills.length) out.fills = describePaints(n.fills);
    if ("strokes" in n && n.strokes.length) out.strokes = describePaints(n.strokes);
    if ("layoutMode" in n && n.layoutMode !== "NONE") {
      Object.assign(out, { layoutMode: n.layoutMode, itemSpacing: n.itemSpacing });
    }
    if (node.type === "TEXT") {
      const t = node;
      out.characters = t.characters.length > 500 ? t.characters.slice(0, 500) + "\u2026" : t.characters;
      out.fontSize = t.fontSize === figma.mixed ? "mixed" : t.fontSize;
      out.fontName = t.fontName === figma.mixed ? "mixed" : t.fontName;
    }
    if ("children" in n) {
      if (depth > 0) out.children = n.children.map((c) => serialize(c, depth - 1));
      else out.childCount = n.children.length;
    }
    return out;
  }
  var brief = (node) => serialize(node, 0);
  async function created(node, build) {
    try {
      await build();
    } catch (e) {
      if (!node.removed) node.remove();
      throw e;
    }
    return brief(node);
  }
  async function createShape(node, p) {
    return created(node, async () => {
      await insert(node, p);
      await applyProps(node, p);
    });
  }
  var handlers = {
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
        pages: figma.root.children.map((pg) => ({ id: pg.id, name: pg.name, childCount: pg.children.length }))
      };
    },
    async get_page(p) {
      var _a;
      const page = p.pageId ? await figma.getNodeByIdAsync(p.pageId) : figma.currentPage;
      if (!page || page.type !== "PAGE") throw new Error(`\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430: ${p.pageId}`);
      await page.loadAsync();
      return serialize(page, (_a = p.depth) != null ? _a : 1);
    },
    async set_current_page(p) {
      const page = await figma.getNodeByIdAsync(p.pageId);
      if (!page || page.type !== "PAGE") throw new Error(`\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430: ${p.pageId}`);
      await figma.setCurrentPageAsync(page);
      return { id: page.id, name: page.name };
    },
    async create_page(p) {
      var _a;
      const page = figma.createPage();
      page.name = (_a = p.name) != null ? _a : "Page";
      if (p.switchTo !== false) await figma.setCurrentPageAsync(page);
      return { id: page.id, name: page.name };
    },
    async get_selection(p) {
      return figma.currentPage.selection.map((n) => {
        var _a;
        return serialize(n, (_a = p.depth) != null ? _a : 0);
      });
    },
    async get_node(p) {
      var _a;
      return serialize(await getNode(p.id), (_a = p.depth) != null ? _a : 1);
    },
    async find_nodes(p) {
      var _a;
      const root = p.rootId ? await getParent(p.rootId) : figma.currentPage;
      const limit = (_a = p.limit) != null ? _a : 50;
      const found = root.findAll((n) => {
        if (p.type && n.type !== p.type) return false;
        if (p.name && !n.name.toLowerCase().includes(String(p.name).toLowerCase())) return false;
        if (p.text && !(n.type === "TEXT" && n.characters.toLowerCase().includes(String(p.text).toLowerCase()))) return false;
        return true;
      });
      return { total: found.length, nodes: found.slice(0, limit).map(brief) };
    },
    async create_frame(p) {
      const frame = figma.createFrame();
      if (p.fill === void 0 && p.fills === void 0) frame.fills = [];
      return createShape(frame, __spreadValues({ width: 100, height: 100 }, p));
    },
    async create_rectangle(p) {
      return createShape(figma.createRectangle(), __spreadValues({ width: 100, height: 100 }, p));
    },
    async create_ellipse(p) {
      const ellipse = figma.createEllipse();
      if (p.arc) ellipse.arcData = __spreadValues({ startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0 }, p.arc);
      return createShape(ellipse, __spreadValues({ width: 100, height: 100 }, p));
    },
    async create_polygon(p) {
      const polygon = figma.createPolygon();
      if (p.pointCount !== void 0) polygon.pointCount = p.pointCount;
      return createShape(polygon, __spreadValues({ width: 100, height: 100 }, p));
    },
    async create_star(p) {
      const star = figma.createStar();
      if (p.pointCount !== void 0) star.pointCount = p.pointCount;
      if (p.innerRadius !== void 0) star.innerRadius = p.innerRadius;
      return createShape(star, __spreadValues({ width: 100, height: 100 }, p));
    },
    async create_line(p) {
      const { x1 = 0, y1 = 0, x2 = 100, y2 = 0 } = p;
      const vector = figma.createVector();
      vector.vectorPaths = [{ windingRule: "NONE", data: `M 0 0 L ${x2 - x1} ${y2 - y1}` }];
      return createShape(vector, __spreadProps(__spreadValues({ stroke: "#000000", strokeWeight: 1 }, p), { x: Math.min(x1, x2), y: Math.min(y1, y2) }));
    },
    async create_vector(p) {
      var _a;
      const paths = (_a = p.paths) != null ? _a : p.path ? [{ data: p.path }] : null;
      if (!paths) throw new Error("\u041D\u0443\u0436\u0435\u043D paths \u0438\u043B\u0438 path");
      const vector = figma.createVector();
      const _b = p, { width, height } = _b, rest = __objRest(_b, ["width", "height"]);
      return created(vector, async () => {
        vector.vectorPaths = paths.map((v) => {
          var _a2;
          return { windingRule: (_a2 = v.windingRule) != null ? _a2 : "NONZERO", data: v.data };
        });
        await insert(vector, rest);
        await applyProps(vector, rest);
        if (width !== void 0 || height !== void 0) vector.resize(width != null ? width : vector.width, height != null ? height : vector.height);
      });
    },
    async create_svg(p) {
      if (!p.svg) throw new Error("\u041D\u0443\u0436\u0435\u043D svg (\u0441\u0442\u0440\u043E\u043A\u0430 \u0441 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439 <svg>)");
      const node = figma.createNodeFromSvg(p.svg);
      if (p.fill === void 0 && p.fills === void 0) node.fills = [];
      return createShape(node, p);
    },
    async create_text(p) {
      var _a, _b;
      const font = { family: (_a = p.fontFamily) != null ? _a : DEFAULT_FONT.family, style: (_b = p.fontStyle) != null ? _b : DEFAULT_FONT.style };
      await figma.loadFontAsync(font);
      const text = figma.createText();
      return created(text, async () => {
        var _a2;
        text.fontName = font;
        text.characters = String((_a2 = p.text) != null ? _a2 : "");
        await insert(text, p);
        await applyProps(text, __spreadValues({ fill: "#000000" }, p));
        if (text.characters.length > 0 && text.width < 1) throw new Error("\u0422\u0435\u043A\u0441\u0442 \u0441\u0445\u043B\u043E\u043F\u043D\u0443\u043B\u0441\u044F \u043F\u043E \u0448\u0438\u0440\u0438\u043D\u0435 \u2014 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 width");
      });
    },
    async create_component(p) {
      const component = figma.createComponent();
      if (p.fill === void 0 && p.fills === void 0) component.fills = [];
      return createShape(component, __spreadValues({ width: 100, height: 100 }, p));
    },
    async create_instance(p) {
      const source = await getNode(p.componentId);
      if (source.type !== "COMPONENT") throw new Error(`\u0423\u0437\u0435\u043B ${p.componentId} \u043D\u0435 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442`);
      return createShape(source.createInstance(), p);
    },
    async update_node(p) {
      const node = await getNode(p.id);
      const _a = p, { id } = _a, props = __objRest(_a, ["id"]);
      await applyProps(node, props);
      return brief(node);
    },
    async move_to_parent(p) {
      const node = await getNode(p.id);
      await insert(node, p);
      if (p.x !== void 0 || p.y !== void 0) await applyProps(node, { x: p.x, y: p.y });
      return brief(node);
    },
    async clone_node(p) {
      const source = await getNode(p.id);
      const copy = source.clone();
      if (p.parentId) await insert(copy, p);
      else {
        const parent = source.parent;
        parent.insertChild(parent.children.indexOf(source) + 1, copy);
        if (parent.type === "PAGE" && p.x === void 0 && p.y === void 0) placeOnFreeSpace(copy);
      }
      const _a = p, { id, parentId, index } = _a, props = __objRest(_a, ["id", "parentId", "index"]);
      await applyProps(copy, props);
      return brief(copy);
    },
    async delete_node(p) {
      var _a;
      const ids = (_a = p.ids) != null ? _a : [p.id];
      for (const id of ids) (await getNode(id)).remove();
      return { deleted: ids };
    },
    async group(p) {
      const nodes = await Promise.all(p.ids.map(getNode));
      if (!nodes.length) throw new Error("\u041D\u0443\u0436\u0435\u043D \u043D\u0435\u043F\u0443\u0441\u0442\u043E\u0439 ids");
      const group = figma.group(nodes, nodes[0].parent);
      if (p.name) group.name = p.name;
      return brief(group);
    },
    async ungroup(p) {
      const node = await getNode(p.id);
      if (!("children" in node)) throw new Error(`\u0423\u0437\u0435\u043B ${p.id} \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0445 \u0441\u043B\u043E\u0451\u0432`);
      return figma.ungroup(node).map(brief);
    },
    async boolean(p) {
      const nodes = await Promise.all(p.ids.map(getNode));
      const parent = nodes[0].parent;
      const operation = String(p.operation || "UNION").toUpperCase();
      let result;
      if (operation === "UNION") result = figma.union(nodes, parent);
      else if (operation === "SUBTRACT") result = figma.subtract(nodes, parent);
      else if (operation === "INTERSECT") result = figma.intersect(nodes, parent);
      else if (operation === "EXCLUDE") result = figma.exclude(nodes, parent);
      else throw new Error(`\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F: ${p.operation}`);
      if (p.name) result.name = p.name;
      return brief(result);
    },
    async flatten(p) {
      const nodes = await Promise.all(p.ids.map(getNode));
      return brief(figma.flatten(nodes));
    },
    async select(p) {
      var _a;
      const nodes = await Promise.all(((_a = p.ids) != null ? _a : []).map(getNode));
      figma.currentPage.selection = nodes;
      if (p.zoom !== false && nodes.length) figma.viewport.scrollAndZoomIntoView(nodes);
      return { selected: nodes.map((n) => n.id) };
    },
    async export_node(p) {
      var _a;
      const node = await getNode(p.id);
      const format = String(p.format || "PNG").toUpperCase();
      if (format === "SVG") {
        return { format, data: await node.exportAsync({ format: "SVG_STRING" }) };
      }
      const bytes = await node.exportAsync({
        format,
        constraint: { type: "SCALE", value: (_a = p.scale) != null ? _a : 1 }
      });
      return { format, base64: figma.base64Encode(bytes), bytes: bytes.length };
    },
    async list_fonts(p) {
      var _a, _b;
      const fonts = await figma.listAvailableFontsAsync();
      const q = p.family ? String(p.family).toLowerCase() : null;
      const filtered = q ? fonts.filter((f) => f.fontName.family.toLowerCase().includes(q)) : fonts;
      const byFamily = {};
      for (const f of filtered) (byFamily[_a = f.fontName.family] || (byFamily[_a] = [])).push(f.fontName.style);
      const families = Object.keys(byFamily);
      return { total: families.length, fonts: families.slice(0, (_b = p.limit) != null ? _b : 100).map((family) => ({ family, styles: byFamily[family] })) };
    },
    async notify(p) {
      var _a, _b;
      figma.notify(String((_a = p.message) != null ? _a : ""), { timeout: (_b = p.timeout) != null ? _b : 3e3 });
      return { ok: true };
    },
    async batch(p) {
      const commands = p.commands || [];
      const results = [];
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
    }
  };
  function resolveRefs(value, results) {
    if (typeof value === "string") {
      const m = /^\$(\d+)$/.exec(value);
      if (!m) return value;
      const ref = results[Number(m[1])];
      if (!ref || !ref.id) throw new Error(`\u0421\u0441\u044B\u043B\u043A\u0430 ${value} \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043D\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0431\u0435\u0437 id`);
      return ref.id;
    }
    if (Array.isArray(value)) return value.map((v) => resolveRefs(v, results));
    if (value && typeof value === "object") {
      const out = {};
      for (const k of Object.keys(value)) out[k] = resolveRefs(value[k], results);
      return out;
    }
    return value;
  }
  var COMMAND_DOCS = {
    ping: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u0432\u044F\u0437\u0438",
    list_commands: "\u0421\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u043C\u0430\u043D\u0434",
    get_document_info: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0444\u0430\u0439\u043B\u0430",
    get_page: "{ pageId?, depth? } \u2014 \u0434\u0435\u0440\u0435\u0432\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B",
    set_current_page: "{ pageId }",
    create_page: "{ name, switchTo? }",
    get_selection: "{ depth? } \u2014 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u044B\u0435 \u0441\u043B\u043E\u0438",
    get_node: "{ id, depth? }",
    find_nodes: "{ type?, name?, text?, rootId?, limit? }",
    create_frame: "{ name, x, y, width, height, fill, parentId, cornerRadius, layoutMode, itemSpacing, padding, ... }",
    create_rectangle: "{ x, y, width, height, fill, stroke, cornerRadius, parentId }",
    create_ellipse: "{ x, y, width, height, fill, arc? }",
    create_polygon: "{ x, y, width, height, pointCount, fill }",
    create_star: "{ x, y, width, height, pointCount, innerRadius, fill }",
    create_line: "{ x1, y1, x2, y2, stroke, strokeWeight, dashPattern }",
    create_vector: "{ paths: [{ data, windingRule }] | path, x, y, width?, height?, fill, stroke }",
    create_svg: "{ svg, x, y, width?, height?, parentId } \u2014 \u0438\u043C\u043F\u043E\u0440\u0442 SVG-\u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438",
    create_text: "{ text, x, y, width?, fontFamily, fontStyle, fontSize, fill, lineHeight, letterSpacing, textAlign, parentId }",
    create_component: "{ name, x, y, width, height, ... }",
    create_instance: "{ componentId, x, y, parentId }",
    update_node: "{ id, ...\u043B\u044E\u0431\u044B\u0435 \u0441\u0432\u043E\u0439\u0441\u0442\u0432\u0430 \u0438\u0437 create_* }",
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
    batch: '{ commands: [{ command, params }], continueOnError? } \u2014 "$N" = id \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 N'
  };
  function errorMessage(e) {
    return e instanceof Error ? e.message : String(e);
  }
  async function execute(command, params) {
    const handler = handlers[command];
    if (!handler) throw new Error(`\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430: ${command}. \u0421\u043C. list_commands`);
    return handler(params || {});
  }
  figma.showUI(__html__, { width: 380, height: 680, themeColors: true });
  figma.ui.onmessage = async (msg) => {
    if (msg.type === "command") {
      try {
        const result = await execute(msg.command, msg.params);
        figma.ui.postMessage({ type: "result", id: msg.id, result });
      } catch (e) {
        figma.ui.postMessage({ type: "result", id: msg.id, error: errorMessage(e) });
      }
    } else if (msg.type === "load-settings") {
      figma.ui.postMessage({ type: "settings", settings: await figma.clientStorage.getAsync("settings") || {} });
    } else if (msg.type === "save-settings") {
      await figma.clientStorage.setAsync("settings", msg.settings);
    }
  };
})();

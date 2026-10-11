// Claude for Figma Bridge — MCP-сервер для Claude Desktop/Claude Code.
// Claude вызывает инструменты по stdio (MCP), мост пересылает команды плагину Figma
// по WebSocket (ws://127.0.0.1:3055) и возвращает ответ. stdout занят протоколом MCP,
// поэтому весь лог — только в stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { HttpsProxyAgent } from "https-proxy-agent";
import guide from "../../.claude/skills/figma-sigma-draw/SKILL.md";

// Claude Desktop подставляет настройки расширения в env; незаполненное поле может прийти
// буквальным шаблоном "${user_config.*}" — считаем его пустым.
const setting = (v: string | undefined) => (v && !v.includes("${") ? v.trim() : "");
const PORT = Number(setting(process.env.SIGMA_PORT)) || 3055;
const TOKEN = setting(process.env.SIGMA_TOKEN);
// Облачный режим: вместо локального порта мост подключается к ретранслятору (relay/)
// по адресу комнаты wss://<хост>/ws/<токен>; плагин на компьютере подключён к той же комнате.
const RELAY_URL = setting(process.env.SIGMA_RELAY_URL);
const COMMAND_TIMEOUT_MS = 30_000;
const BATCH_TIMEOUT_MS = 180_000;
const VERSION = "0.3.0";
const ALLOWED_ORIGINS = new Set(["null", "https://www.figma.com"]);

const log = (...args: unknown[]) => console.error("[claude-sigma]", ...args);

// ---------- Связь с плагином ----------
//
// Порт один, а копий моста может быть несколько: Claude Desktop и сессии Claude Code
// в разных репозиториях запускают каждая свою. Первая копия занимает порт (основная) и
// держит связь с плагином; остальные подключаются к ней как клиенты (вспомогательные)
// и пересылают команды через неё. Если основная закрывается, одна из вспомогательных
// занимает порт, а плагин переподключается сам.

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
type Relayed = { client: WebSocket; id: string; timer: NodeJS.Timeout };

const PLUGIN_HINT =
  "Плагин не подключён. В Figma Desktop: Plugins → Development → Claude for Figma by Dubrovskiy → «Подключить» " +
  `(адрес ws://localhost:${PORT}).`;

class PluginLink {
  private mode: "starting" | "primary" | "secondary" | "relay" = "starting";
  private relayRetry = 0;
  private plugin: WebSocket | null = null; // основная копия: сокет плагина
  private upstream: WebSocket | null = null; // вспомогательная: сокет к основной копии
  private pending = new Map<string, Pending>(); // собственные команды этой копии
  private relayed = new Map<string, Relayed>(); // основная: команды других копий
  private seq = 0;
  private lastError = "";

  start(): void {
    if (RELAY_URL) this.connectRelay();
    else this.listen();
  }

  // Облачный режим: держим соединение с ретранслятором, при обрыве переподключаемся с паузой.
  private connectRelay(): void {
    let url: URL;
    try {
      url = new URL(RELAY_URL);
    } catch {
      this.lastError = `SIGMA_RELAY_URL не похож на адрес: ${RELAY_URL}`;
      return;
    }
    const ws = new WebSocket(url, { agent: proxyAgentFor(url) });
    const noWelcome = setTimeout(() => {
      this.lastError = "ретранслятор не ответил на приветствие";
      ws.terminate();
    }, 10_000);
    const keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 25_000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", role: "bridge-relay" })));
    ws.on("unexpected-response", (_req, res) => {
      this.lastError =
        res.statusCode === 403
          ? `доступ к ${url.host} запрещён сетевой политикой — добавьте домен в Allowed domains окружения`
          : res.statusCode === 404
            ? "неверный адрес комнаты: нужен wss://<хост>/ws/<токен> со стартовой страницы ретранслятора"
            : `ретранслятор ответил HTTP ${res.statusCode}`;
      ws.terminate();
    });
    ws.on("message", (raw) => {
      const msg = parse(raw);
      if (!msg) return;
      if (msg.type === "welcome") {
        clearTimeout(noWelcome);
        this.upstream = ws;
        this.mode = "relay";
        this.relayRetry = 0;
        this.lastError = "";
        log(`облачный режим: подключён к ретранслятору ${url.host}`);
      } else if (msg.type === "plugin-gone") {
        this.failPending("Плагин отключился от ретранслятора во время выполнения команды");
      } else if (msg.type === "result") {
        this.settle(msg);
      }
    });
    ws.on("error", (e) => {
      if (!this.lastError) this.lastError = e.message;
    });
    ws.on("close", () => {
      clearTimeout(noWelcome);
      clearInterval(keepAlive);
      if (this.upstream === ws) {
        this.upstream = null;
        this.failPending("Связь с ретранслятором оборвалась во время выполнения команды — повторите");
      }
      this.mode = "starting";
      const delay = Math.min(30_000, 1000 * 2 ** this.relayRetry++);
      log(`нет связи с ретранслятором${this.lastError ? ` (${this.lastError})` : ""}, повтор через ${delay / 1000} с`);
      setTimeout(() => this.connectRelay(), delay);
    });
  }

  private listen(): void {
    const wss = new WebSocketServer({
      host: "127.0.0.1",
      port: PORT,
      // UI плагина Figma работает в iframe с origin "null"; другие копии моста (Node) origin
      // не передают. Любой сайт в браузере имеет настоящий origin — такие подключения
      // отклоняем, чтобы страницы не управляли макетом.
      verifyClient: ({ origin }: { origin?: string }) => {
        const ok = !origin || ALLOWED_ORIGINS.has(origin);
        if (!ok) log(`отклонено подключение с origin ${origin}`);
        return ok;
      },
    });
    wss.on("listening", () => {
      this.mode = "primary";
      this.lastError = "";
      log(`основная копия: ожидаю плагин на ws://127.0.0.1:${PORT}`);
    });
    wss.on("error", (err: NodeJS.ErrnoException) => {
      wss.close();
      if (err.code === "EADDRINUSE") return this.connectUpstream();
      this.lastError = err.message;
      log("ошибка сервера:", err.message, "— повтор через 5 с");
      setTimeout(() => this.listen(), 5000);
    });
    wss.on("connection", (ws) => this.accept(ws));
  }

  // Порт занят: пробуем работать через основную копию моста.
  private connectUpstream(): void {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const noWelcome = setTimeout(() => {
      this.lastError = `порт ${PORT} занят другой программой`;
      ws.terminate();
    }, 3000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", role: "bridge-relay", token: TOKEN || undefined })));
    ws.on("message", (raw) => {
      const msg = parse(raw);
      if (!msg) return;
      if (msg.type === "welcome") {
        clearTimeout(noWelcome);
        this.upstream = ws;
        this.mode = "secondary";
        this.lastError = "";
        log(`вспомогательная копия: порт ${PORT} занят другой копией моста, работаю через неё`);
      } else if (msg.type === "error") {
        this.lastError = msg.message;
      } else if (msg.type === "result") {
        this.settle(msg);
      }
    });
    ws.on("error", () => {}); // за ошибкой всегда следует close
    ws.on("close", () => {
      clearTimeout(noWelcome);
      if (this.upstream === ws) {
        this.upstream = null;
        this.failPending("Основная копия моста закрылась во время выполнения команды — повторите");
        log("основная копия моста закрылась, пробую занять порт");
      }
      this.mode = "starting";
      // Небольшой разброс, чтобы несколько вспомогательных копий не боролись за порт одновременно.
      setTimeout(() => this.listen(), 500 + Math.floor(Math.random() * 1000));
    });
  }

  private accept(ws: WebSocket): void {
    let role: "plugin" | "relay" | null = null;
    const authTimer = setTimeout(() => {
      if (!role) ws.close(4001, "no hello");
    }, 5000);

    ws.on("message", (raw) => {
      const msg = parse(raw);
      if (!msg) return;
      if (msg.type === "hello") {
        if (TOKEN && msg.token !== TOKEN) {
          ws.send(JSON.stringify({ type: "error", message: "Неверный токен моста" }));
          ws.close(4003, "bad token");
          return;
        }
        clearTimeout(authTimer);
        if (msg.role === "bridge-relay") {
          role = "relay";
          log("подключилась вспомогательная копия моста");
        } else {
          role = "plugin";
          if (this.plugin && this.plugin !== ws) this.plugin.close(4000, "replaced");
          this.plugin = ws;
          log("плагин подключён");
        }
        ws.send(JSON.stringify({ type: "welcome", message: `Claude for Figma Bridge ${VERSION} готов` }));
        return;
      }
      if (role === "plugin" && msg.type === "result") return this.fromPlugin(msg);
      if (role === "relay" && msg.command && msg.id !== undefined) return this.relay(ws, msg);
    });

    // Keep-alive: плагин отвечает pong; заодно проверяем, что сокет жив.
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 20_000);

    ws.on("close", () => {
      clearInterval(ping);
      clearTimeout(authTimer);
      if (role === "relay") {
        for (const [rid, r] of this.relayed) {
          if (r.client !== ws) continue;
          clearTimeout(r.timer);
          this.relayed.delete(rid);
        }
      }
      if (this.plugin === ws) {
        this.plugin = null;
        log("плагин отключён");
        this.failPending("Плагин отключился во время выполнения команды");
        for (const [rid, r] of this.relayed) {
          clearTimeout(r.timer);
          r.client.send(JSON.stringify({ type: "result", id: r.id, error: "Плагин отключился во время выполнения команды" }));
          this.relayed.delete(rid);
        }
      }
    });
  }

  // Основная копия: команда от вспомогательной → плагину, ответ — обратно.
  private relay(client: WebSocket, msg: any): void {
    if (!this.pluginConnected) {
      client.send(JSON.stringify({ type: "result", id: msg.id, error: PLUGIN_HINT }));
      return;
    }
    const rid = `r${++this.seq}`;
    const timer = setTimeout(() => this.relayed.delete(rid), BATCH_TIMEOUT_MS);
    this.relayed.set(rid, { client, id: String(msg.id), timer });
    this.plugin!.send(JSON.stringify({ id: rid, command: msg.command, params: msg.params ?? {} }));
  }

  private fromPlugin(msg: any): void {
    const r = this.relayed.get(String(msg.id));
    if (!r) return this.settle(msg);
    this.relayed.delete(String(msg.id));
    clearTimeout(r.timer);
    if (r.client.readyState === WebSocket.OPEN) {
      r.client.send(JSON.stringify({ type: "result", id: r.id, result: msg.result, error: msg.error }));
    }
  }

  private settle(msg: any): void {
    const p = this.pending.get(String(msg.id));
    if (!p) return;
    this.pending.delete(String(msg.id));
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  }

  private failPending(reason: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  private get pluginConnected(): boolean {
    return !!this.plugin && this.plugin.readyState === WebSocket.OPEN;
  }

  private get target(): WebSocket | null {
    if (this.mode === "primary") return this.pluginConnected ? this.plugin : null;
    if ((this.mode === "secondary" || this.mode === "relay") && this.upstream?.readyState === WebSocket.OPEN) {
      return this.upstream;
    }
    return null;
  }

  // "ok" — можно отправлять. У вспомогательной копии подключение плагина проверяет основная:
  // если его нет, команда вернётся с подсказкой PLUGIN_HINT.
  status(): string {
    if (this.mode === "starting") {
      const what = RELAY_URL ? "Подключение к облачному ретранслятору" : "Мост запускается";
      return `${what}${this.lastError ? `: ${this.lastError}` : "…"}`;
    }
    if (this.mode === "primary" && !this.pluginConnected) return PLUGIN_HINT;
    return this.target ? "ok" : "Нет связи с основной копией моста — повторите через несколько секунд";
  }

  get role(): string {
    return this.mode;
  }

  send(command: string, params: Record<string, unknown> = {}, timeoutMs = COMMAND_TIMEOUT_MS): Promise<any> {
    const state = this.status();
    if (state !== "ok") return Promise.reject(new Error(state));
    const id = `c${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Плагин не ответил за ${Math.round(timeoutMs / 1000)} с на команду ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.target!.send(JSON.stringify({ id, command, params }));
    });
  }
}

// Облачные контейнеры выходят в сеть через HTTPS-прокси; библиотека ws сама его не использует.
function proxyAgentFor(url: URL): HttpsProxyAgent<string> | undefined {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return undefined;
  const host = url.hostname;
  const bypass = (process.env.NO_PROXY || process.env.no_proxy || "")
    .split(",")
    .map((h) => h.trim().replace(/^\*/, ""))
    .filter(Boolean)
    .some((h) => host === h || host === h.replace(/^\./, "") || (h.startsWith(".") && host.endsWith(h)));
  if (bypass || host === "localhost" || host.startsWith("127.")) return undefined;
  return new HttpsProxyAgent(proxy);
}

function parse(raw: unknown): any {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

// ---------- MCP ----------

const link = new PluginLink();

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
});

const instructions = [
  "Инструменты этого сервера рисуют в открытом файле Figma через плагин Claude for Figma by Dubrovskiy.",
  "Перед работой вызови figma_status. Строй слайд или блок одним figma_batch, после сборки проверь результат через figma_screenshot.",
  "Ниже — правила команд и вёрстки, соблюдай их.",
  "",
  guide.replace(/^---[\s\S]*?---\s*/, ""),
].join("\n");

const server = new McpServer({ name: "claude-sigma", version: VERSION }, { instructions });

const COMMANDS_HELP =
  "Команды: ping, list_commands, get_document_info, get_page {pageId?, depth?}, set_current_page {pageId}, " +
  "create_page {name}, get_selection {depth?}, get_node {id, depth?}, find_nodes {type?, name?, text?, rootId?, limit?}, " +
  "create_frame, create_rectangle, create_ellipse, create_polygon, create_star, create_line {x1,y1,x2,y2}, " +
  "create_vector {paths|path}, create_svg {svg}, create_text {text, fontFamily, fontStyle, fontSize, width?}, " +
  "create_component, create_instance {componentId}, update_node {id, ...свойства}, move_to_parent {id, parentId?, index?, x?, y?}, " +
  "clone_node {id, parentId?}, delete_node {id|ids}, group {ids}, ungroup {id}, boolean {ids, operation}, flatten {ids}, " +
  "select {ids, zoom?}, export_node {id, format, scale?}, list_fonts {family?}, notify {message}. " +
  "Общие свойства create_*/update_node: parentId, index, name, x, y, width, height, rotation, opacity, visible, " +
  'fill ("#RRGGBB[AA]" | null | {type:"linear", stops, angle}), stroke, strokeWeight, cornerRadius (число или [tl,tr,br,bl]), ' +
  'effects ([{type:"shadow", color, x, y, blur, spread}]), clipsContent, layoutMode (HORIZONTAL|VERTICAL), itemSpacing, ' +
  "padding, primaryAxisAlignItems, counterAxisAlignItems, primaryAxisSizingMode/counterAxisSizingMode (FIXED|AUTO), " +
  "layoutSizingHorizontal/Vertical (FIXED|HUG|FILL), lineHeight (24 | \"120%\" | \"auto\"), letterSpacing, textAlign.";

server.registerTool(
  "figma_status",
  {
    title: "Статус Figma",
    description: "Проверить, подключён ли плагин Figma, и узнать открытый файл, страницу и список страниц.",
    inputSchema: {},
  },
  async () => {
    try {
      const state = link.status();
      if (state !== "ok") return json({ connected: false, bridge: link.role, hint: state });
      return json({ connected: true, bridge: link.role, ...(await link.send("get_document_info")) });
    } catch (e) {
      return json({ connected: false, bridge: link.role, hint: e instanceof Error ? e.message : String(e) });
    }
  },
);

server.registerTool(
  "figma_command",
  {
    title: "Команда Figma",
    description: `Выполнить одну команду плагина в открытом файле Figma и вернуть результат (обычно id и размеры узла). ${COMMANDS_HELP}`,
    inputSchema: {
      command: z.string().describe("Имя команды, например create_frame"),
      params: z.record(z.string(), z.any()).optional().describe("Параметры команды"),
    },
  },
  async ({ command, params }) => {
    try {
      return json(await link.send(command, params ?? {}));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "figma_batch",
  {
    title: "Пакет команд Figma",
    description:
      'Выполнить несколько команд по порядку за один вызов — основной способ строить слайды и блоки. Строка "$N" в параметрах ' +
      'заменяется на id результата N-й команды (например, parentId: "$0" кладёт слой в первый созданный фрейм). ' +
      "При ошибке выполнение останавливается и возвращается { results, error: { index, command, message } }; " +
      `уже выполненные команды не откатываются. ${COMMANDS_HELP}`,
    inputSchema: {
      commands: z
        .array(z.object({ command: z.string(), params: z.record(z.string(), z.any()).optional() }))
        .min(1)
        .describe("Список команд"),
      continueOnError: z.boolean().optional().describe("Продолжать после ошибки (по умолчанию false)"),
    },
  },
  async ({ commands, continueOnError }) => {
    try {
      const result = await link.send("batch", { commands, continueOnError }, BATCH_TIMEOUT_MS);
      return result && result.error ? { ...json(result), isError: true } : json(result);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "figma_screenshot",
  {
    title: "Снимок Figma",
    description:
      "Получить PNG-снимок узла, чтобы проверить результат глазами. Без id — первый выделенный слой. " +
      "Для слайда 1920×1080 достаточно scale 0.5.",
    inputSchema: {
      id: z.string().optional().describe("id узла; по умолчанию — выделение"),
      scale: z.number().min(0.1).max(2).optional().describe("Масштаб, по умолчанию 0.5"),
    },
  },
  async ({ id, scale }) => {
    try {
      let nodeId = id;
      if (!nodeId) {
        const selection = await link.send("get_selection");
        if (!selection.length) throw new Error("Ничего не выделено — передайте id узла");
        nodeId = selection[0].id;
      }
      const shot = await link.send("export_node", { id: nodeId, format: "PNG", scale: scale ?? 0.5 });
      return {
        content: [
          { type: "image" as const, data: shot.base64, mimeType: "image/png" },
          { type: "text" as const, text: `id ${nodeId}, ${shot.bytes} байт` },
        ],
      };
    } catch (e) {
      return fail(e);
    }
  },
);

async function main(): Promise<void> {
  link.start();
  await server.connect(new StdioServerTransport());
  // Claude закрыл stdio (вышел или упал) — завершаемся, чтобы не держать порт.
  process.stdin.on("end", () => process.exit(0));
  process.stdin.on("close", () => process.exit(0));
  log(`MCP-сервер запущен (версия ${VERSION})`);
}

main().catch((e) => {
  log("не удалось запустить:", e);
  process.exit(1);
});

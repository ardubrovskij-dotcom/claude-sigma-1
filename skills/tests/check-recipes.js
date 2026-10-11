// Прогон всех заготовок из recipes.md через строгую заглушку.
const fs = require("fs"); const { createEnv } = require("./strict-figma.js");
const md = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "../project-to-figma/references/recipes.md"), "utf8");
const blocks = md.split("\n## ").slice(1).map((sec) => [null, sec.split("\n")[0], (sec.match(/```json\n([\s\S]*?)```/) || [])[1]]).filter((b) => b[2]);
(async () => {
  let failed = 0;
  for (const [, title, json] of blocks) {
    const env = createEnv();
    let commands = JSON.parse(json);
    if (json.includes("<id экрана>")) { const s = await env.send("create_frame", { name: "Screen", width: 390, height: 844, layoutMode: "VERTICAL", padding: 20 }); commands = JSON.parse(json.replace(/<id экрана>/g, s.result.id)); }
    const r = await env.send("batch", { commands });
    const err = r.error || (r.result && r.result.error);
    const texts = [...env.nodes.values()].filter((n) => n.type === "TEXT");
    const collapsed = texts.filter((t) => t.characters.includes(" ") && t.textAutoResize === "WIDTH_AND_HEIGHT" && t.layoutSizingHorizontal === "FILL");
    if (err || collapsed.length) { failed++; console.log("✗", title, JSON.stringify(err), collapsed.map((t) => t.name)); }
    else console.log("✓", title, `(${r.result.results.length} команд, ${env.nodes.size} узлов)`);
  }
  console.log(failed ? `FAILED ${failed}` : "ALL RECIPES OK"); process.exit(failed ? 1 : 0);
})();

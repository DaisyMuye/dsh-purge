// dsh-purge 版本兼容探查器（只读，不写任何宿主文件）
//
// 用法：
//   node scripts/version-probe.mjs                 # 探查当前 DSH_HOME 定位到的宿主
//   node scripts/version-probe.mjs <aiBase>        # 探查指定 @deepseek-ai 目录
//   node scripts/version-probe.mjs <aiBase> --pending    # 只看未落地/待清洗的
//   node scripts/version-probe.mjs <aiBase> --id 74      # 只看某个补丁
//   node scripts/version-probe.mjs <aiBase> --drift      # 只看锚点全丢的（最像版本漂移）
//
// aiBase 就是含 dsh-agent-instructions/lib 的那个目录，例如：
//   D:/dsh/resources/app/dsh/node_modules/@deepseek-ai
//   E:/npm-global/node_modules/@deepseek-ai
//
// 判定口径与 applyPatches 一致：
//   applied  = 标记已在（或锚点已替换完）
//   pending  = 锚点还在，还没清洗 —— 未安装时这是常态
//   skipped  = 这个版本里一条锚点都对不上（可选补丁就是跳过；非可选才需要改锚点）
//   missing  = 目标文件在这个版本里不存在
process.env.DSH_SURFACE = process.env.DSH_SURFACE || "web";

const args = process.argv.slice(2);
const onlyPending = args.includes("--pending");
const onlyDrift = args.includes("--drift");
const verbose = args.includes("--verbose");
const idIdx = args.indexOf("--id");
const onlyId = idIdx >= 0 ? Number(args[idIdx + 1]) : null;
const aiBase = args.find((a, i) => !a.startsWith("--") && !(idIdx >= 0 && i === idIdx + 1));

const fs = await import("node:fs");
const core = await import("../lib/core.js");

let base = aiBase;
if (!base) {
  base = core.findAiBase?.();
  if (!base) {
    console.error("没定位到插件根：请显式传 <aiBase>");
    process.exit(2);
  }
}
process.env.DSH_BASE = base;

const files = core.targetFiles(base);
const status = core.patchStatus ? await core.patchStatus(base) : {};
const keysOf = (p) => (Array.isArray(p.file) ? p.file : [p.file]);
const fpsOf = (key) => {
  const v = files?.[key];
  if (!v) return [];
  return typeof v === "string" ? [v] : Array.isArray(v) ? v.filter(Boolean) : [];
};
const lf = (s) => String(s).replace(/\r\n/g, "\n");

const rows = [];
for (const p of core.ALL_PATCHES) {
  if (onlyId !== null && p.id !== onlyId) continue;
  const st = status[p.id] || (core.patchAppliesHere(p) ? "unknown" : "na");
  if (onlyPending && st !== "pending") continue;
  if (onlyDrift && st !== "skipped") continue;

  let anyFile = false;
  let hits = 0;
  let misses = 0;
  const notes = [];
  for (const key of keysOf(p)) {
    const fps = fpsOf(key);
    if (!fps.length) {
      notes.push(`[${key}] 无此文件`);
      continue;
    }
    for (const fp of fps) {
      anyFile = true;
      let text = "";
      try {
        text = fs.readFileSync(fp, "utf8");
      } catch {
        notes.push(`[${key}] 读不出`);
        continue;
      }
      const hay = lf(text);
      for (let i = 0; i < (p.replacements || []).length; i++) {
        const r = p.replacements[i];
        let hit = false;
        try {
          if (r.pattern instanceof RegExp) {
            hit = new RegExp(r.pattern.source, r.pattern.flags.replace("g", "")).test(hay);
          } else if (r.pattern) {
            hit = hay.includes(lf(r.pattern));
          }
        } catch {
          hit = false;
        }
        if (hit) hits += 1;
        else misses += 1;
      }
    }
  }
  const drift = anyFile && hits === 0 && misses > 0;
  rows.push({ id: p.id, name: p.name, status: st, drift, hits, misses, notes, optional: !!p.optional });
}

const tally = {};
for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1;
console.log(`插件根 / aiBase: ${base}`);
console.log(`汇总 / status: ${JSON.stringify(tally)}`);
console.log(`锚点全丢 / drift-only: ${rows.filter((r) => r.drift && r.status !== "applied").length}\n`);

for (const r of rows) {
  const mark = r.status === "applied" ? "✓" : r.status === "pending" ? "✗" : r.status === "skipped" ? (r.drift && !r.optional ? "!" : "·") : "-";
  console.log(`${mark} #${String(r.id).padEnd(2)} ${String(r.status).padEnd(10)} ${r.name}  (锚点 ${r.hits}/${r.hits + r.misses})`);
  if ((r.drift && !r.optional) || (verbose && r.status !== "applied" && r.notes.length)) {
    for (const n of r.notes.slice(0, 8)) console.log(`      ${n}`);
  }
}
console.log(`\n提示：pending 在未安装时是正常的；真正要管的是 status=skipped 且 drift=1 的非可选补丁 —— 那说明新版本改写了这段代码，需要给 lib/core.js 补一代 pattern。`);
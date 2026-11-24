# dsh-purge 对新版 DSH 的适配记录

本文件记录 `lib/core.js` 里「补丁代数」的追加原因。一个补丁可以有多代 `pattern`：
旧版本继续命中旧锚点，新版本命中新锚点，**不需要删旧代**。

## 已验证版本

| DSH 版本 | 来源 | 结果 |
| --- | --- | --- |
| `0.2.1-rc.2` | 旧版基线 | 不变（回归 0 差异） |
| `0.2.2-rc.5` | npm `latest` / `next` | 86 个补丁全部落地，`problem=0`、`pending=0` |
| `0.2.3-alpha.2` | npm `alpha` / 桌面 nightly 频道 | 与 0.2.2-rc.5 逐补丁结果 0 差异 |

判定口径：在官方包的干净副本上跑 `applyPatches`，再回读 `patchStatus`。
只要 `applied / already` 的组合与 0.2.1 基线一致、且没有 `pattern_not_found`，就算适配成功。

## 0.2.2-rc.5 需要新代的补丁（13 个 → 已处理）

| # | 补丁 | 官方改了什么 | 处理 |
| --- | --- | --- | --- |
| 13 | `ESCALATION_WIDENING_EXEMPT` | 三条 `throw new Error(...)` → `throw new SandboxEscalationError(消息, 错误码)` | 追加 0.2.2 代 pattern，替换成同样的一条注释（整段摘掉） |
| 14 | `ESCALATION_GRANT_UNCONDITIONAL` | `displayReason` 内联对象 → `escalationDisplayReason(mode, justification)` 调用 | 追加 0.2.2 代，保留 `: "allowed-once"` 兜底 |
| 35 | `ESCALATION_NEVER_REJECT` | 同上 + `cancelled` 分支多出 `approval.signal?.throwIfAborted()` | 追加 0.2.2 代 switch |
| 17 | `FS_OBSERVATION_INTENT_FREE` | `editIntent` 收进 `requirePresent()`，新增 `deleteIntent` | 0.2.2 代同时摘掉 edit/delete 的读先门槛 |
| 18 | `REPEAT_TOOL_REMINDER_DISABLED` | post-execute 里 `kind === "block"` 特判被删 | 追加精简后的 0.2.2 代 |
| 40 | `COMPLETE_PROMPT_KEEP_INJECT` | `assemble` 返回值多了 `tools`，早退分支变成对象展开 | 新增 `COMPLETE_PROMPT_WATERFALL_*_TOOLS` 常量并追加一代 |
| 54 | `DELIVERABLE_DO_NOT` | 提示词文本搬到新包 `dsh-deliverable-file-references` | 新增文件键 `deliverables-file-refs`，加进补丁的 file 列表 |
| 60 | `OFFICIAL_RUN_CODE_APPROVAL_NEUTRAL` | run_code 搬到 `dsh-tool-executor-ptc` | 新增 `ptc-executor`（0.2.3 再加 `ptc-chunks` / `ptc-run-code`） |
| 62 | `OFFICIAL_TOOL_ASK_FAILOPEN` | 审批流水线拆到 `dsh-tools/lib/pipeline.js`，deny 改 `approvalDenial(原因, 码)` | 新增文件键 `tools-pipeline` + 两代 pattern |
| 67 | `AGENT_LOOP_MESSAGES_GUARD` | 同一句被再包一层 try，缩进 4 tab → 5 tab | 改成吃缩进的正则 pattern（`$1/$2` 保留原文缩进） |
| 74 | `ASSEMBLE_BEFORE_PRESTEP` | `assemble(assembleContextFor(...))` → `assemble({...context, modelSelection, toolSet})` | 追加 0.2.2 代（注释标记仍写在 catch 里） |
| 87 | `PREPARE_ASSEMBLE_USE_RETURNED` | 接在 #74 之后，锚点跟着换代 | 追加 0.2.2 代 |
| 56 | `REWIND_HIDE_CUT_ONLY` | `client.js` 打成压缩单行，`isRewindMarker`/`rewindVisibleEntries`/`sourceEventSeqs` 被内联改名 | **未适配**：0.2.2 起跳过（回退显示退回官方行为，可选补丁，不影响其它补丁） |

## 0.2.3-alpha.2 追加（4 个）

| # | 官方改了什么 | 处理 |
| --- | --- | --- |
| 40 | `assemble` 之后先建 `presentation`（`comparePromptSections` 排序），再决定 complete 段覆盖 | 追加 0.2.3 代：先摘出 `dsh-purge*` 段，complete 生效时排成 `[purge…, complete]` |
| 55 | `inHistory` 从 agent-loop 下沉到 `llm-deepseek` 的序列化阶段 | 补丁文件列表加 `llm-deepseek`，追加 `const inHistory = false;` 一代 |
| 60 | run_code 说明再从 `run-code.js` 拆进带哈希名的 `lib/_chunks/ptc-calls-*.js` | 新增目录扫描键 `ptc-chunks`（`allFilesIn`） |
| 72 | `systemUpdates.push` 单行化，`historySystem` 改成数组拼接 | 换成整段正则，直接 `historySystem = text;` |

## 新增的文件定位键（`targetFiles`）

```
deliverables-file-refs  @deepseek-ai/dsh-deliverable-file-references/lib/index.js
ptc-executor            @deepseek-ai/dsh-tool-executor-ptc/lib/index.js
ptc-run-code            @deepseek-ai/dsh-tool-executor-ptc/lib/run-code.js
ptc-chunks              @deepseek-ai/dsh-tool-executor-ptc/lib/_chunks/*.js   （目录扫描）
tools-pipeline          @deepseek-ai/dsh-tools/lib/pipeline.js
```

## 自查方法

```bash
# 只读探查：看哪些补丁在这个宿主上命中/漂移
node scripts/version-probe.mjs "D:/dsh/resources/app/dsh/node_modules/@deepseek-ai"
node scripts/version-probe.mjs "E:/npm-global/node_modules/@deepseek-ai" --drift

# 想看真实写入结果：先复制一份官方包树，再指着副本跑
node bin/dsh-purge.js --status
```

要点：

* `pending` 在没安装补丁的干净树上属于常态，不代表不兼容。
* 真正要处理的是「非可选补丁 `status=skipped` 且锚点 0 命中」——那说明官方把这段代码改写了，需要给 `lib/core.js` 补一代 `pattern`。
* 追加新代时不要动旧代：旧代负责老版本，新代负责新版本，两代共存是设计要求。

## 未覆盖

* 桌面壳以外的 Electron 侧文件（`preload-*.cjs`、`renderer/*`）没有补丁，无需覆盖。
* Web 客户端插件（`client.js`）的宿主模块 `dsh-client-runtime` / `dsh-client-ui-slots` 由宿主打包提供，不在 npm 依赖树里，只能在真实 Web/桌面宿主里验证。
* Web 客户端插件（`client.js`）的宿主模块 `dsh-client-runtime` / `dsh-client-ui-slots` 由宿主打包提供，不在 npm 依赖树里，只能在真实 Web/桌面宿主里验证。

## 桌面壳（`resources/app/lib/main.js`）—— 已用官方安装包验证

官方桌面最新包从 `download.deepseek.com`（DSH 官方下载域名）取到：
`dsh-desk/bin/win-x64/deepseek-harness-0.2.3-alpha.2-win-x64.exe`（301,227,624 字节）。
安装器是「PE 外壳 + 追加 7z」，把 7z 段切出来后用 Windows 自带 libarchive（`tar`）解包，
再从 `app.asar` 里抽出 `lib/main.js` 和 40 个官方 `@deepseek-ai` 包（全部 `0.2.3-alpha.2`）。

| # | 补丁 | 0.2.3-alpha.2 实测 |
| --- | --- | --- |
| 45 | `OFFICIAL_DESKTOP_UPDATE_HANDOFF` | 锚点 2/2，正常落地 |
| 46 | `OFFICIAL_DESKTOP_UPDATE_ASCII` | 接在 #45 之后，正常落地 |
| 83 | `DESKTOP_HOST_CLOSE_NO_FATAL` | 锚点 1/1，正常落地 |
| 84 | `DESKTOP_HOST_CLOSE_CODE0_NO_FAIL` | 接在 #83 之后，正常落地 |
| 82 | `DESKTOP_SHELL_PROFILE_FALLBACK` | **过时**：0.2.3 的 `dsh-desktop-host` 直接用 `runProfile(... { profile: "desktop" })` 传参，壳里也写死 `profiles/desktop`，不再走 `DSH_PROFILE` 环境变量；锚点消失属预期，保持「跳过」 |

桌面运行时包同样干净：40 个官方包上 `applyPatches` → `applied=56 already=9 problem=0`，
改写过的文件 `node --check` 全过；`main.js` 打完补丁后也 `node --check` 通过。

## 从 purge 原始备份重放

实验改动不是手改出来的结果文件，而是可从 1.1.71 原版备份重放：

```bash
cp -a baseline/dsh-purge-1.1.71-pristine build/dsh-purge
cd build/dsh-purge
patch -p1 --binary --no-backup-if-mismatch < ../../patches/dsh-1.1.71-to-1.1.72-dsh022-compat.patch
```

重放结果与实验副本 5 个文件**逐字节一致**（`core.js`、`package.json`、
`docs/dsh-compat-generations.md`、`docs/dsh-install-rollback.md`、`scripts/version-probe.mjs`）。
注意用 `--binary`：原版 `lib/core.js` 里有一处单独的 CRLF，git diff/apply 会把它当成换行差异抹掉。

## 版本漂移告警（1.1.72 新增）

以前「官方改写了被补丁的代码」和「这段代码本来就不存在」在状态里长得一样，都是 `skipped`，
于是会出现「插件装上了但其实半残」。现在补上可观测性：

```js
patchAnchorStats(aiBase)                  // 每个补丁的锚点命中数 / 缺失数 / 涉及文件数
driftPatches(aiBase, patchStatus)         // 非可选 + 状态 skipped + 锚点 0 命中 → 漂移
gatherState().patches_drift               // 数量
gatherState().drift_patch_ids             // 具体补丁号
```

`node bin/dsh-purge.js --status` 会直接把它摆出来：

```
  补丁 65/86 已清洗, 0 待清洗
  ⚠ 版本漂移 1 个：非可选补丁的锚点在这个宿主上一条都没命中。
    官方改写了对应代码，这些补丁会静默跳过，需要给 lib/core.js 追加一代 pattern：#13
```

判定不加任何补丁行为，纯读数：老版本上恒为 0；只有官方重写对应代码才会出现。
实测三棵树（0.2.2 未安装 / 0.2.2 已应用 / 官方桌面 0.2.3）均无漂移，
人为打断 `#13` 的一条锚点后立刻报出 `#13`。

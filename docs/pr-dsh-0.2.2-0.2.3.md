# PR: 适配 DSH 0.2.2-rc.5 / 0.2.3-alpha.2（只追加补丁代数）

## 为什么

`lib/core.js` 的补丁是「按官方源码原文做字符串替换」。官方 0.2.2 / 0.2.3 重构了若干段被补丁的代码，
旧锚点在新版本上命中不到，补丁变成 `skipped`。本 PR **不删任何旧锚点**，只为新版本追加一代，
所以 0.2.1 的老用户不受影响。

## 改了什么

### 0.2.2-rc.5（13 个补丁失配 → 全部补上）

| # | 官方改动 | 处理 |
| --- | --- | --- |
| 13/14/35 | `throw new Error(...)` → `SandboxEscalationError(消息, 错误码)`；`displayReason` 内联对象 → `escalationDisplayReason()`；`cancelled` 分支多 `throwIfAborted()` | 各追加一代 |
| 17 | `editIntent` 收进 `requirePresent()`，新增 `deleteIntent` | 新代同时摘 edit/delete 的读先门槛 |
| 18 | post-execute 的 `kind === "block"` 特判删除 | 新代重写 |
| 40/74/87 | `assemble` 返回多 `tools`；实参改成 `{...context, modelSelection, toolSet}` | 新常量 + 三代 pattern |
| 54/60/62 | 提示词搬进 `dsh-deliverable-file-references`；run_code 搬进 `dsh-tool-executor-ptc`；审批流水线拆到 `dsh-tools/lib/pipeline.js`，deny 改 `approvalDenial()` | 新增文件键 + 新代 |
| 67 | 同一句被再包一层 try，缩进 4→5 tab | 改成吃缩进的正则 |

### 0.2.3-alpha.2（再 4 个）

| # | 官方改动 | 处理 |
| --- | --- | --- |
| 40 | `assemble` 后先建 `presentation`（`comparePromptSections` 排序）再处理 complete 段 | 新代：complete 生效时排成 `[purge…, complete]` |
| 55 | `inHistory` 从 agent-loop 下沉到 `llm-deepseek` | 文件列表加 `llm-deepseek` + 新代 |
| 60 | run_code schema 再拆进带哈希名的 `lib/_chunks/ptc-calls-*.js` | 新增目录扫描键 `ptc-chunks` |
| 72 | `systemUpdates.push` 单行化，`historySystem` 改数组拼接 | 整段正则替换 |

### 新增文件定位键

`deliverables-file-refs`、`ptc-executor`、`ptc-run-code`、`ptc-chunks`（目录扫描）、`tools-pipeline`

### 其它

- `package.json`：`1.1.72`，`dshTarget: 0.2.3-alpha.2`，新增 `dshTargets`
- `scripts/version-probe.mjs`：只读探查器，任意 `@deepseek-ai` 目录都能列出「命中 / 漂移 / 缺文件」
- `docs/dsh-compat-generations.md`：每代补丁为什么加、官方改了什么
- `docs/dsh-install-rollback.md`：覆盖安装、应用、四条回滚路径

## 有两个补丁在新版是「过时」，不是「失配」

- **#82 `DESKTOP_SHELL_PROFILE_FALLBACK`**：0.2.3 的 `dsh-desktop-host` 直接
  `runProfile(..., { profile: "desktop" })` 传参，壳里也写死 `profiles/desktop`，
  不再依赖 `DSH_PROFILE` 环境变量 → 那个坑不存在了。
- **#56 `REWIND_HIDE_CUT_ONLY`**：0.2.2+ 把回退从「客户端认 `rewind-` 前缀消息」改成
  session 层的 `surfaceOp: { op: "replace", startSeq, endSeq }`（`dsh-session` 有校验与投影），
  客户端 `replaceWindow()` 直接吃投影后的窗口 → 「只藏被撤掉那一段」已是官方语义。

两者都 `optional: true`，保持 `skipped` 即可，不影响其它补丁。

## 验证

干净官方包树上跑 `applyPatches` 后回读 `patchStatus`：

```
0.2.2-rc.5 (npm latest)               applied=56 already=12 problem=0  pending=0
0.2.3-alpha.2 (npm alpha)             applied=51 already=17 problem=0  pending=0
官方桌面 0.2.3-alpha.2 运行时(40 包)   applied=56 already=9  problem=0  pending=0
0.2.2 vs 0.2.3 逐补丁对比             差异 0 项 / 共 86
```

- 每个干净树二次运行都是 `applied=0`（幂等）
- 所有被改写文件 `node --check` 通过
- 官方桌面 `resources/app/lib/main.js`（0.2.3-alpha.2，从官方安装包 asar 抽出）：
  `#45/#46/#83/#84` 正常落地，打完后 `node --check` 通过

## 兼容性

新代只在新版命中，旧版继续走旧代；`0.2.1-rc.2` 上逐补丁结果与改动前一致（除 #55 首次显示一次
`pending`，应用一次即消，因为它新增覆盖了 `llm-deepseek` 层）。

## 追加：版本漂移告警（review 后补的一小块）

`skipped` 以前同时表示「这段代码本来就不存在」和「官方改写了这段代码」，两者在 UI 上无法区分，
会导致插件看起来装好了、实际少了补丁。本 PR 新增只读判定：

- `patchAnchorStats(aiBase)`：每个补丁的锚点命中/缺失统计
- `driftPatches(aiBase, patchStatus)`：**非可选 + skipped + 锚点 0 命中** → 漂移
- `gatherState()` 增加 `patches_drift` / `drift_patch_ids`，`bin/dsh-purge.js --status` 输出告警行

不改任何补丁行为；老版本恒为 0。

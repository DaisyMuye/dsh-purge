# 覆盖安装 / 应用 / 回滚 流程

适用范围：把本目录这份 `dsh-purge`（1.1.72，已适配 0.2.1-rc.2 / 0.2.2-rc.5 / 0.2.3-alpha.2）
铺到一台已经在跑 DSH 的机器上，以及出问题时怎么干净退回去。

> 所有命令都是 Windows PowerShell。**先备份，再覆盖**，别跳步。

---

## 0. 先认清要动的是哪一份宿主

| 宿主 | 插件根（`@deepseek-ai` 目录） | 判断依据 |
| --- | --- | --- |
| 桌面版 | `D:\dsh\resources\app\dsh\node_modules\@deepseek-ai` | 有 `D:\dsh\DeepSeek Harness.exe` |
| 全局 CLI | `%APPDATA%\npm\node_modules\@deepseek-ai` 或 `E:\npm-global\node_modules\@deepseek-ai` | `where dsh` |
| 自定义 | 含 `dsh-agent-instructions\lib` 的那层 | `$env:DSH_BASE` |

插件自己认的 DSH_HOME 默认是 `C:\Users\<你>\.dsh`。

```powershell
# 看官方包版本，决定适配代是否覆盖
node -e "console.log(require('D:/dsh/resources/app/dsh/node_modules/@deepseek-ai/dsh-agent-instructions/package.json').version)"
```

---

## 1. 备份（三样东西）

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$home_ = "$env:USERPROFILE\.dsh"

# 1) 插件目录
Copy-Item "$home_\plugins\dsh-purge" "$home_\plugins\dsh-purge.bak-$stamp" -Recurse -Force

# 2) 官方原文快照保险柜（回滚靠它）
Copy-Item "$home_\dsh-purge\host-backups" "$home_\dsh-purge\host-backups.bak-$stamp" -Recurse -Force

# 3) 你手写的注入文件
Copy-Item "$home_\prompt-inject.md" "$home_\prompt-inject.md.bak-$stamp" -Force
```

宿主侧还会在**每个被改过的官方文件旁边**放 `<文件名>.dshpurge.bak`，那是该文件的官方原文。
回滚时这两套快照任一可用即可。

---

## 2. 覆盖安装

```powershell
$src  = "E:\REA\purge-022\dsh-purge"          # 实验区里这份适配版
$dst  = "$env:USERPROFILE\.dsh\plugins\dsh-purge"

# 只覆盖代码与文档，别把运行时状态（applied.json / installed-rev）一起搬
robocopy $src $dst /MIR `
  /XD "$dst\node_modules" `
  /XF applied.json installed-rev last-cwd.txt settle-restart.guard `
  /NFL /NDL /NJH /NJS /NP
```

> 不想搬整个目录的话，最少只需要两个文件：`lib\core.js`、`package.json`。
> `docs\dsh-compat-generations.md` 和 `scripts\version-probe.mjs` 是记录与自查工具，可选。

---

## 3. 应用 + 校验

```powershell
cd "$env:USERPROFILE\.dsh\plugins\dsh-purge"
node bin\dsh-purge.js --status     # 看状态（只读）

# 只读探查：哪些补丁命中、哪些漂移
node scripts\version-probe.mjs "D:/dsh/resources/app/dsh/node_modules/@deepseek-ai"
```

期望值（干净应用一次之后）：

| 宿主版本 | 结果 |
| --- | --- |
| 0.2.1-rc.2 | 约 `applied 65 / skipped 5 / pending 0`（若从旧版插件升上来，#55 首次会显示 pending，应用一次即消） |
| 0.2.2-rc.5 | `applied 68 / skipped 5 / pending 0` |
| 0.2.3-alpha.2 | 同上，逐补丁结果与 0.2.2 完全一致 |

然后在 DSH 界面里点一次「应用 / Apply」并重启（或 `node bin\dsh-purge.js --apply`）。
判定标准只有一条：**没有任何非可选补丁停在 `pattern_not_found` / 写入失败**。
`skipped` 是"这个版本里这段代码已经不存在"，属正常，不是失败。

---

## 4. 回滚

按代价从低到高，任选其一。

### A. 插件自带回滚（首选，会连 shim / 提示词注入一起退）

```powershell
cd "$env:USERPROFILE\.dsh\plugins\dsh-purge"
node bin\dsh-purge.js --revert
# 或在 DSH 界面里点「回滚 / Revert」
```

它把 `<文件>.dshpurge.bak` 与 `~\.dsh\dsh-purge\host-backups\*.bak` 里的官方原文写回宿主。

### B. 手工还原单个文件

```powershell
$bad = "D:\dsh\resources\app\dsh\node_modules\@deepseek-ai\dsh-agent-loop\lib\index.js"
Copy-Item "$bad.dshpurge.bak" $bad -Force
# 删掉残留补丁标记，确认没写坏：
Select-String -Path $bad -Pattern '\[dsh-purge\]' | Measure-Object
node --check $bad
```

### C. 整插件退回旧版

```powershell
Remove-Item "$env:USERPROFILE\.dsh\plugins\dsh-purge" -Recurse -Force
Copy-Item "$env:USERPROFILE\.dsh\plugins\dsh-purge.bak-$stamp" "$env:USERPROFILE\.dsh\plugins\dsh-purge" -Recurse -Force
```

### D. 宿主起不来（插件 activate 失败）时的急救

先让 DSH 能启动，再谈清理：

```powershell
# 1) 把插件目录临时移出
Move-Item "$env:USERPROFILE\.dsh\plugins\dsh-purge" "$env:USERPROFILE\.dsh\plugins\dsh-purge.off"

# 2) 或只关掉插件注册行（~\.dsh\cordis.patch.yml 里 dsh-purge 那几行前面加 disabled: true）

# 3) 启动后用 --revert 把宿主官方文件写回
```

宿主文件如果被改坏到 `node --check` 都过不了，用 B 的方式按 `.dshpurge.bak` 逐个还原；
实在没有快照，就用同版本官方包覆盖：

```powershell
npm i --prefix "$env:TEMP\fixhost" @deepseek-ai/dsh@<你的版本>
Copy-Item "$env:TEMP\fixhost\node_modules\@deepseek-ai\dsh-agent-loop\lib\index.js" `
          "D:\dsh\resources\app\dsh\node_modules\@deepseek-ai\dsh-agent-loop\lib\index.js" -Force
```

---

## 5. 升级 DSH 之后

官方升级会重写 `resources\app`，补丁随之失效，但快照和插件都还在。升级后固定做两件事：

1. `node scripts\version-probe.mjs "<新的插件根>"` —— 看有没有非可选补丁变成 `skipped`
   且锚点 0 命中（那就是新版本又改写了这段代码，需要给 `lib/core.js` 补一代 `pattern`）。
2. 点一次「应用」，确认 `pending = 0`。

补代的写法见 `docs\dsh-compat-generations.md`：**只追加，不删旧代**，一个 pattern 管一个版本时代。
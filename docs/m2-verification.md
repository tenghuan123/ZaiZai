# M2 任务编辑、重复计划与日期历史验证

验证日期：2026-11-02，Asia/Shanghai。实现基于已提交的 M1 `46dae24`，M2 改动暂未提交。本轮按 [交互原型](dual-platform-prototype.html) 与 [原型设计](prototype-design.md) 接入真实任务界面，复用已有任务服务、数据库与 IPC；没有增加数据库迁移或页面直接写库路径。

## 实现与交互

| 用户入口 | 已实现行为 |
| --- | --- |
| 底部快捷新增 | 输入后回车/点 `＋` 创建今天的无时间任务；空输入点 `＋` 打开详情面板 |
| 定时/重复编辑器 | 一次性/每日类型切换；名称、执行日期、可选时间、提醒开关；保存后定位执行日期 |
| 一次性编辑 | 保留实例 ID，携带 `expectedVersion`；已到点或已完成的时间只读；名称与提醒偏好仍可修改 |
| 每日计划编辑 | 增删时间槽、就地改时间、起止日期与提醒开关；保留现有槽 ID，删除再新增才生成新槽；空槽、重复时间与非法范围明确提示 |
| 三段导航 | 待办、已完成、重复计划；待办按时间、无时间居后；已完成按完成时间倒序，可撤销 |
| 行操作 | 编辑、删除本次；重复实例编辑所属计划；未来预览显式标识，完成/删除等写命令才落库 |
| 计划管理 | 生效中/已暂停列表；编辑、暂停/恢复、确认结束；已结束计划不再列出，历史仍可查看 |
| 日期历史 | 昨天/今天/明天、任意日期和已有记录日期；非今日常驻日期与返回今天；未运行空日期显示“没有生成记录” |
| 移到今天 | 历史未完成任务保留 ID 与来源日期，今日展示 `原 MM-DD`；旧日期不补副本 |
| 今日摘要 | 选中日期的进度只影响清单；菜单栏与仅桌宠胶囊始终使用主进程今日统计 |
| 失败与并发 | 保存失败保留草稿及创建请求 ID；版本冲突不自动覆盖，可主动载入最新记录；同一行命令串行；切日后的旧响应不能覆盖新视图 |

实现分布：`features/tasks/use-workspace.ts` 负责订阅、查询刷新和命令结果；`TaskList.tsx` 呈现已保存实例与未来预览；`features/editor/TaskEditor.tsx` 管理独立草稿；`features/plans/PlanList.tsx` 管理计划入口；`features/calendar/DateNavigator.tsx` 提供日期选择。App 负责视图、窗口与宠物反馈接线。

服务端继续拥有日期生成、去重、计划生效、提醒确认和历史保护规则。界面先订阅再读快照；每轮请求记录选中日期与序号，并检查会话、修订号。若快照、计划、日期与历史查询之间发生写入，会重新读取，避免将不同版本的数据拼在一起。默认今天视图跟随主进程日界线，主动选择的历史日期不会被普通刷新切走。

详情面板使用同一原生窗口内的 HTML dialog，约束尺寸、内部滚动与键盘焦点；不创建额外窗口。结束计划先展示影响范围，取消不会改变数据。完整完成动画和精灵图仍属于 M4，保存成功后才显示现有反馈。

## 验证范围

环境为 macOS 26.5.1（25F80）、Apple Silicon arm64，Node 24.16.0、Electron 45.2.1（Node 24.22.1，Chromium 156.0.8078.75）。

| 检查 | 结果与证据 |
| --- | --- |
| 类型检查与生产构建 | `npm run build` 通过，主进程、preload 和界面构建完成 |
| 规则与 SQLite 集成 | 既有 28 项测试通过，任务规则与数据约束复用 M1，无业务规则副本 |
| 真实 Electron 开发运行 | 任务编辑、未来完成/撤销、计划编辑/暂停/恢复/结束、历史迁移、草稿保留、重载冲突与重启恢复通过；开发通知身份失败状态保留 |
| macOS 本地包 | ad-hoc 本地签名，未公证；16 项严格回归通过，包含真实系统通知提交、受控跨天与退出重启 |
| 视觉检查 | 编辑器、计划列表、历史和冲突提示均在 356×560 逻辑像素窗口内检查；截图禁用表现动画以稳定取帧 |

自动化入口为 `scripts/smoke.mjs` 与 `scripts/workspace-smoke.mjs`。前者保留窗口、托盘、隐藏调度、通知、单实例与快照版本检查；后者通过真实 UI 操作覆盖 M2 主流程。测试只使用 `TIA_M0_DATA_DIR` 指定的隔离数据库。

通过触发器模拟真实 SQLite 保存失败，通过第二个命令模拟编辑版本冲突；两种情况下均断言编辑器未关闭、草稿未丢失。跨天测试只在测试进程内临时替换主进程 `Date.now`，验证默认今天视图跟随新日期、生成新实例且保留昨日完成与未完成记录，随后恢复时钟；它不代表实际等待到午夜或真实休眠测试。后台调度使用隔离库的秒级精度夹具，并断言领取发生在渲染线程被占用之后、恢复之前。

最终报告与截图见 [回归报告](m2-evidence/report.json)、[主进程事件](m2-evidence/events.ndjson)、[任务编辑器](m2-evidence/once-editor.png)、[重复编辑器](m2-evidence/repeat-editor.png)、[计划列表](m2-evidence/repeat-plans.png)、[历史视图](m2-evidence/history.png)、[冲突草稿](m2-evidence/edit-conflict.png) 与 [最终清单](m2-evidence/m2-final.png)。本机项目根路径已归一化；原始数据保留在 `.cache/m2-runs/`。

## 验收映射

| 场景 | 本轮证据 |
| --- | --- |
| A01 一次性任务 | 快捷新增、编辑名称/日期/时间/提醒、完成、撤销与删除的真实 UI 链路；修改前后 ID 一致 |
| A02 每日多时间 | 增删时间槽与重复时间校验；未来两次独立预览，操作后保留一个实例；受控跨天生成新一日实例 |
| A03 计划生命周期 | 从重复行打开计划；改时间保留槽和实例 ID；暂停/恢复身份不变；结束前取消和确认结束；已完成历史保留 |
| A04 跨天 | 主进程可控时钟与真实界面刷新；昨日完成与未完成都保留；真实午夜和休眠仍单独验收 |
| A05 历史迁移 | UI 移到今天、来源标签、重复移动与重启后唯一身份断言 |
| A13 空清单/删除 | 无记录日期、空列表统计与删除后切日/重启均不复活；只由成功完成命令触发全部完成反馈 |

复现命令：

```sh
npm test
npm run build
npm run smoke
npm run pack:mac -- --config.electronDist=node_modules/electron/dist
node scripts/smoke.mjs \
  '--executable=release/mac-arm64/Desktop Buddy M0.app/Contents/MacOS/Desktop Buddy M0' \
  --require-notification
```

M1 提交已完成且没有推送；本轮 M2 不自动提交。下一阶段继续 M3 提醒与生命周期。Windows 安装后验收、系统通知人工点击、真实休眠、多屏与缩放仍未完成；本机包不是正式分发版本。宠物资源库、精灵图及完整动画继续 M4/X1。

## 2026-11-03 动画交互补充

此节记录后续本地开发版的完成动效与菜单过渡，不改写上文 11 月 2 日的验收范围，也不代表 M4 全部完成。已有 V3 桌宠资源继续复用。

- 完成任务先通过原有服务落库，再播放弹性打勾、8 颗星星/爱心、动态删除线、猫爪完成章与飞向宠物的星光；成功后触发既有宠物庆祝和进度更新。反馈持续 620ms，随后用 260ms 折叠行高、淡出并右移，已完成数字轻弹。
- 620ms 内再次点击会发送明确的撤销命令；完成写入失败保留未完成行，撤销失败保留已保存的完成状态并显示错误。切换标签或日期不取消已提交操作，未来预览落库后仍只有一个任务实例。
- 清单与微缩胶囊保留 DOM，通过 340ms 裁剪、淡出、位移和缩放完成过渡；隐藏清单使用 `inert` 禁止交互。收起结束再缩小原生窗口，展开先扩大窗口；快速反向切换会清除旧的缩窗计时器。胶囊距宠物区域至少 16px。
- 减少动态效果时，完成命令直接刷新，没有粒子或延迟退出；菜单直接切换视觉状态。

验证环境仍为本机 macOS arm64 / Electron 45.2.1。`npm run build` 和 33 项规则测试通过；[动画验收 8 项](animation-evidence/report.json)、[桌宠回归 8 项](animation-evidence/pet-report.json)、[完整 Electron 开发回归 16 项](animation-evidence/workspace-report.json) 通过，未出现渲染错误。旧回归中需要立即判断移除的断言，现等待退出动画结束后再检查。完整开发回归的系统通知提交仍返回开发身份错误，本次没有将其记作通知投递成功。

截图见 [打勾与粒子](animation-evidence/completion-check.png)、[行退出](animation-evidence/completion-exit.png)、[菜单收起中](animation-evidence/menu-folding.png)、[仅桌宠模式](animation-evidence/compact.png) 和 [完整窗口](animation-evidence/expanded.png)。截图直接取自真实 Electron 窗口；原始隔离库与运行记录保留在 `.cache/animation-runs/`。

复现命令：`npm run build`，然后分别运行 `node scripts/animation-smoke.mjs`、`node scripts/pet-smoke.mjs` 和 `node scripts/smoke.mjs`。这些入口使用独立测试数据目录。本轮未提交、未推送，未重新生成安装包；Windows 动效与原生能力仍待真机验收。

## 2026-11-03 日期交互修订

基于本地提交 `3c57988`，将内嵌日期横幅替换为同窗口模态浮层。顶栏按最终反馈仅保留日历图标，悬停提示用途；浮层标题为「按日期查看任务」，简要说明「查看历史待办和未来安排，选一天即可切换」。月历点选及昨天/今天/明天选完关闭，任意日期输入后点「查看」跳转；有历史记录的日期标点。Escape、关闭按钮或点击浮层外可取消，焦点返回入口。

非今日视图的日期、进度、百分比和「回今天」合并为一行，不再叠加额外横幅。未来视图显示「新增这一天的待办」，快捷新增保存到所选日期且保持当前视图；历史视图提供「历史待办可点『移到今天』继续处理」说明，不显示快捷新增。任务服务与数据库规则继续复用，未修改数据库或主进程协议。

`npm run build` 通过；[日期专项 7 项](calendar-evidence/report.json)、[完整 Electron 开发回归 16 项](calendar-evidence/workspace-report.json)与[动效回归 8 项](calendar-evidence/animation-report.json)通过。专项通过比较打开前后、选择明天后的列表和底部输入栏坐标，确认没有位移或高度压缩；同时检查说明文字、自动关闭、取消及焦点、未来新增与失败重试、历史标点与迁移，以及闰年二月和六行月份在窗口内完整显示。开发通知身份错误继续按失败分支记录，不代表通知投递成功。

截图见 [日期浮层及用途说明](calendar-evidence/calendar.png)、[明天空清单](calendar-evidence/tomorrow-empty.png)、[未来快捷新增](calendar-evidence/tomorrow-task.png)、[历史视图](calendar-evidence/history.png)与[今日视图](calendar-evidence/today.png)。复现入口为 `node scripts/calendar-smoke.mjs`，使用隔离数据库；原始记录在 `.cache/calendar-runs/`。运行中的开发版通过热更新加载本轮界面，本轮未自动提交或打包；Windows 尚未实测。

## 2026-11-03 zaizai 图标与本机包

用户确认「贴贴分身」加草莓发夹版图标，应用显示名与包名改为 `zaizai`，标语为「我在这里，也在你身边。」内置 `image_gen` 生成与编辑的原图、透明底版、提示词及 PNG / ICNS / ICO 资源保存在 [branding](../resources/branding/README.md)。macOS 包使用正式 ICNS；bundle ID、通知身份和既有数据目录保留，避免因展示名变动切换数据。

本机交付为 `release/mac-arm64/zaizai.app` 和 `release/zaizai-0.1.0-mac-arm64.zip`。使用现有本地 Electron 运行时打包，ad-hoc 签名，无公证；不是跨平台正式发行包。压缩包 CRC 完整性检查与 `codesign --verify --deep --strict` 通过，包内图标与源 ICNS 的 SHA-256 一致。构建、文件大小、校验和及验证汇总见 [build.json](branding-evidence/build.json)。

33 项规则测试通过；打包后独立运行的[完整回归 16 项](branding-evidence/workspace-report.json)、[日期专项 7 项](branding-evidence/calendar-report.json)、[完成与菜单动效 8 项](branding-evidence/animation-report.json)、[桌宠 8 项](branding-evidence/pet-report.json)全部通过，共 39 项打包版检查。完整回归使用 `--require-notification`，实际系统通知返回 `submitted`；不代表人工点击或用户看见通知的验收。所有回归使用隔离数据目录。

视觉证据：[图标浅深背景](branding-evidence/icon-preview.png)、[打包版今日清单](branding-evidence/packaged-today.png)、[打包版日期浮层](branding-evidence/packaged-calendar.png)、[打包版仅桌宠模式](branding-evidence/packaged-compact.png)。Windows 只准备 ICO 资源和打包配置，没有生成或验收安装包。本轮按用户授权打包，未自动提交或推送。

## Windows x64 安装包（2026-11-03）

按用户追加要求，已在 macOS arm64 上交叉构建 `release/zaizai Setup 0.1.0.exe`，目标为 Windows x64，使用 Electron 45.2.1 和 NSIS。安装器支持选择目录、桌面和开始菜单快捷方式，卸载时保留应用数据；应用显示名、图标和本轮功能与当前 zaizai 源码一致。安装包未配置代码签名。

打包前 33 项规则测试、TypeScript 检查和生产构建通过。初次打包因 electron-rebuild 尝试跨平台执行 node-gyp 而失败；当前锁定的 `better-sqlite3@13.0.3` 已提供 Node-API 10 的 Windows x64 二进制，因此 `pack:win` 关闭额外重建，直接打入依赖自带模块。已确认包内模块为 PE32+ AMD64、位于 `app.asar.unpacked`，且 SHA-256 与依赖原文件一致。本机开发依赖继续保留 macOS 模块。

安装器及其内嵌 `app-64.7z` 均通过 7-Zip 完整性检查。应用 EXE 的产品名、版本、x64 架构和七档图标已核对，图标数据与源 ICO 一致；包内主进程、预加载、页面、七张 V3 精灵图和托盘图片均与本轮构建输出或源资源一致。安装器内解出的应用 EXE、ASAR 和 Windows SQLite 模块也与 `win-unpacked` 中的文件逐一比对。文件大小、校验和和检查结果见 [Windows 打包证据](windows-package-evidence/build.json)。

本轮完成的是安装包生成与静态完整性验证，尚未在 Windows 真机执行安装、启动、SQLite 读写、通知、托盘和卸载验收；这些项目继续保留为待验收。未提交或推送代码。

复现命令：`npm run icons:mac`、`npm run pack:mac -- --config.electronDist=node_modules/electron/dist`；回归脚本统一接受 `--executable=release/mac-arm64/zaizai.app/Contents/MacOS/zaizai`。完整回归入口 `scripts/smoke.mjs` 额外传 `--require-notification`。

## 2026-11-03 胡娴雅接入与角色切换

将已确认的 `resources/pets/hu-xianya` 接入应用，保留草莓兔女孩 V3。顶栏 `🐾` 面板新增「桌宠角色」选择，使用现有 `settings.petId`、版本校验与 SQLite 事务保存；重启后恢复。已有选择和历史占位 ID 对应规则继续保留，保存失败保持当前角色并可重试。回应与完成台词从所选包读取，七组动作继续由现有优先级控制器分发；角色切换不清除待处理提醒。

TypeScript 检查和生产构建通过，35 项规则测试通过。[构建版专项](pet-integration-evidence/built-report.json)与[macOS 打包版专项](pet-integration-evidence/packaged-report.json)各 10 项检查通过：两套角色各七组动作、真实 SQLite 写入失败后重试、角色台词、减少动态效果与隐藏暂停、两种窗口尺寸、单项 / 全部完成反馈、按场景提醒及重启恢复。打包版还在待处理喝水提醒期间切换两套角色，确认提醒 ID 与动作均保留。验收脚本在展开窗口后等待界面解除 inert 并完成过渡，再开始输入，避免原生尺寸已变化但界面尚未展开时的自动化输入丢失。

macOS 应用、ZIP 与 Windows x64 NSIS 安装包均已更新。构建仅包含两套角色共十四张精灵图；独立预览 HTML、APNG、绘制帧和生成资料未进入应用包。打包资产、签名与压缩完整性记录见 [build.json](pet-integration-evidence/build.json)。截图见[角色选择与动作](pet-integration-evidence/packaged-actions.png)、[仅桌宠模式](pet-integration-evidence/packaged-compact.png)和[重启后的角色](pet-integration-evidence/packaged-reopened.png)。本轮未操作用户实际数据库，未提交或推送；Windows 仍为交叉构建与静态验证，未完成真机运行验收。

复现：`npm test`、`npm run build`、`node scripts/pet-smoke.mjs`、`npm run pack:mac`、`node scripts/pet-smoke.mjs --executable=release/mac-arm64/zaizai.app/Contents/MacOS/zaizai`、`npm run pack:win`。

## 2026-11-03 滕环加入内置角色库

将用户确认的 `resources/pets/teng-huan` v1.0.2 登记为第三个内置角色，七组动作使用最终素材，摇铃为保留原始人物画风的局部修订版。渲染端登记 manifest 与七张精灵图，主进程沿用已有内置 ID 校验、`settings.petId`、版本控制和 SQLite 保存流程。启动最新构建，顶栏 `🐾` →「桌宠角色」可选择「滕环 · 前端工程师」。

TypeScript 检查和生产构建通过，36 项规则测试通过。[生产资源检查](teng-huan-integration-evidence/build.json)确认共 21 张精灵图，滕环七张图片的 SHA-256 与确认版逐一一致。[真实 Electron 构建版专项](teng-huan-integration-evidence/built-report.json)10 项检查通过：三角色各七组动作、v1.0.2 配置、真实保存失败及重试、角色台词、单项与全部完成反馈、摇铃 / 喝水 / 拉伸提醒、待处理提醒期间切换角色及完整重启后恢复。

截图见[角色动作](teng-huan-integration-evidence/built-actions.png)、[仅桌宠模式](teng-huan-integration-evidence/built-compact.png)、[重启后的滕环](teng-huan-integration-evidence/built-reopened.png)。本轮使用隔离数据目录；完成源码与生产构建接入，`release/` 中 macOS、Windows 安装包仍为上轮双角色版本，尚未重新打包。未提交或推送。

复现：`npm test`、`npm run build`、`node scripts/pet-smoke.mjs`。

## 2026-11-03 本地提交整理与回归

按素材归档、日期交互、角色切换、品牌打包、需求原型与验收文档六组整理本地提交。保留各代桌宠的素材、制作来源、独立预览和验证记录；滕俊龙仍是独立资源包，当前应用内登记的角色仍为草莓兔女孩 V3、胡娴雅和滕环。`output/` 中可重新导出的 ZIP 与 `out/`、`release/` 一样作为生成产物忽略，原文件保留在本地。

本次重新执行 `npm test`（36 项通过）、`npm run build`（类型检查与生产构建通过），并使用独立测试数据目录运行 [完整 Electron 回归 16 项](local-commit-evidence/workspace-report.json)、[日期专项 7 项](local-commit-evidence/calendar-report.json)、[动效专项 8 项](local-commit-evidence/animation-report.json)和[三角色专项 10 项](local-commit-evidence/pet-report.json)，共 77 项自动化检查通过。资源与证据 JSON 可解析，浏览器原型内联脚本语法检查通过。

本轮开发版系统通知仍返回 `UNErrorDomain错误1`，回归覆盖的是投递失败后的可处理状态，不能据此认定系统通知投递成功。未重新生成安装包，`release/` 仍是上轮双角色版本；Windows 真机、系统通知人工点击、真实休眠和多屏等验证缺口继续保留。本次仅做本地 Git 提交，未推送。

需求和浏览器原型 v0.3 的周/月计划、任务优先级、提醒声音、开机自启及自定义窗口尺寸仍为目标设计；已在数据模型和 README 中明确其与当前正式应用的实现边界。

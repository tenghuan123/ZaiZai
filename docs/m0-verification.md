# M0 桌面能力验证记录

验证日期：2026-11-02，Asia/Shanghai。范围为 Electron 工程、桌宠窗口、托盘、后台提醒与 SQLite 样本。

已在 macOS Apple Silicon 上跑通关键链路并生成本机应用包。Windows 仅有共用代码与打包配置，尚未运行；本机结果不代表双平台 M0 全部验收通过。

## 1 环境与产物

| 项目 | 本次环境 |
| --- | --- |
| 系统 | macOS 26.5.1，Apple Silicon arm64 |
| 开发 Node.js | 24.16.0 |
| Electron | 45.2.1 |
| Electron 内 Node.js | 24.22.1 |
| Chromium | 156.0.8078.75 |
| 构建 | electron-vite 6.0.0、Vite 8.3.5、TypeScript 7.0.2 |
| 界面 | React 19.3.1 |
| SQLite | better-sqlite3 13.0.3，已按 Electron ABI 编译 |
| 打包 | electron-builder 26.18.0 |
| 本机应用包 | `release/mac-arm64/Desktop Buddy M0.app` |
| 应用标识 | `com.desktopbuddy.m0` |
| 签名 | ad-hoc 本地临时签名，未公证，作为 M0 本机验证包 |

依赖版本已锁定。应用包约 285 MiB，来自本机 `du -sh`，不是压缩安装包大小。M0 应用暂用“桌面伙伴 / Desktop Buddy M0”展示名，仓库名称沿用 ZaiZai。

## 2 实现范围

- 真实透明无边框窗口，默认置顶，可在设置中关闭置顶。
- 完整清单 356 × 560 与仅桌宠 356 × 224 逻辑像素切换，实际调整原生窗口边界。
- 宠物点击反馈、双击切换与拖动手势；当前使用原型 SVG 和 CSS 动画，精灵图播放器后续接入。
- macOS 菜单栏图标与进度；Windows 系统托盘实现与彩色图标。
- 原生关闭三选一对话框，明确区分隐藏与退出。
- 界面或托盘添加延迟提醒，主进程调度，窗口隐藏仍继续。
- 系统通知结果与气泡，气泡完成和列表完成修改同一条 SQLite 记录。
- 提醒、完成、通知处理记录、下班时间、置顶、窗口位置与布局偏好持久化。
- 单实例限制和重启恢复，避免产生多个调度器。
- 休眠恢复、锁屏、显示器变化的处理入口，以及低频时间校验。

M0 使用 `m0.sqlite3` 和独立 `m0_*` 表，仅承载能力验证。完整任务模型、每日重复计划和日期预览按 [架构](architecture.md) 与 [数据模型](data-model.md) 在后续阶段接入。M0 的接口子集定义在 [contracts.ts](../src/shared/contracts.ts)。

## 3 已执行验证

| 项目 | 本机结果 | 证据与边界 |
| --- | --- | --- |
| 类型检查与生产构建 | 通过 | `npm run build` |
| 规则与 SQLite 集成 | 9 项通过 | `npm run test`，使用 Electron 的 Node ABI |
| 开发界面 | 主流程通过 | 连接实际 Vite 服务器完成窗口与持久化回归；开发身份的系统通知失败已记录 |
| 独立应用启动 | 通过 | 应用包、preload 与本地 `buddy-app://` 界面正常 |
| 透明窗与原生尺寸 | 通过 | 自动化读取真实窗口边界，验证 560 → 224 → 560 |
| macOS 菜单栏图标 | 创建通过 | 真实 Tray、图标与原生菜单；完整人工菜单点击待补 |
| 隐藏后调度 | 通过 | 到点记录 `windowVisible: false` |
| 渲染线程忙碌时调度 | 通过 | 刻意让渲染线程忙碌 8.5 秒，主进程仍在约 5 秒时领取提醒 |
| 系统通知提交 | 签名包通过 | 原生 Notification 的 `show` 事件确认提交，不等同于用户已看见 |
| 气泡完成 | 通过 | SQLite 状态更新、待处理气泡清除 |
| 单实例恢复 | 通过 | 第二次启动退出，原隐藏实例重新显示 |
| 退出及重启恢复 | 通过 | 提醒、完成和 compact 偏好保留，旧提醒不重复提交 |
| 原生关闭框 | 显示、取消与退出已人工验证 | 三个选项实际显示；取消保留窗口，退出结束应用 |
| 系统通知点击 | 尚未完成人工验收 | 已接入回调；气泡与单实例测试不能替代系统点击验收 |
| 真实休眠恢复 | 尚未完成 | 事件已接入，规则测试覆盖汇总；未实际让电脑休眠 |
| 多屏、缩放、Windows | 尚未完成 | 几何规则测试不替代对应真机验证 |

已归档本轮最终签名包测试的 [报告](m0-evidence/report.json)、[主进程事件](m0-evidence/events.ndjson)、[完整窗口截图](m0-evidence/expanded.png) 与 [仅桌宠截图](m0-evidence/compact.png)。归档仅将本机绝对路径归一化为项目相对路径；原始记录仍在 `.cache/m0-runs`。

自动化脚本为 [smoke.mjs](../scripts/smoke.mjs)，每次使用隔离数据目录，避免覆盖日常运行数据。加 `--require-notification` 时必须成功提交原生通知，否则失败退出；普通运行记录通知失败，便于检查开发身份的失败路径。

## 4 通知身份与失败处理

直接运行开发 Electron 时，本机原生通知返回过 `UNErrorDomain 错误 1`，应用保留待办并显示“通知未提交”。独立应用包使用 `com.desktopbuddy.m0` 和 ad-hoc 签名后，本机通知提交成功。

没有用网页通知模拟替代原生通知。`Notification.isSupported()` 仅表示系统支持，不代表已经授权。首次运行若询问通知权限，需要允许该应用。其他设备的权限、正式分发签名与公证仍需后续验证。

通知状态区分待处理、领取中、已提交、失败、结果不明和错过原日期。失败不会完成任务或循环重试；领取后异常退出会在重启时保留“结果不明”的应用内提醒。

## 5 复现命令

```sh
npm install
npm run dev
npm run test
npm run build
npm run smoke
```

独立 macOS 应用包严格验收：

```sh
npm run pack:mac
node scripts/smoke.mjs \
  '--executable=release/mac-arm64/Desktop Buddy M0.app/Contents/MacOS/Desktop Buddy M0' \
  --require-notification
```

Windows 构建应在 Windows 环境执行，并在安装后验证托盘、通知与点击回调：

```sh
npm install
npm run pack:win
```

## 6 数据与诊断

- 开发运行在 macOS 默认使用 `~/Library/Application Support/desktop-buddy-m0-dev`；独立包使用 `~/Library/Application Support/desktop-buddy-m0`。
- 其他平台使用 Electron 的应用数据目录，不写入安装目录。
- 自动化通过 `TIA_M0_DATA_DIR` 指定隔离目录，不覆盖日常体验数据。
- `m0-events.ndjson` 记录窗口、调度与通知结果；调度日志使用提醒 ID，不写入完整提醒正文。
- 正常操作即保存，退出停止定时器、结束通知对象并关闭数据库。
- 报告启动耗时含检查器连接；内存为多进程工作集且采样在忙碌测试之后，不是普通冷启动或空闲资源达标证明。

## 7 后续工作

补齐 Windows 安装后验收、系统通知点击、多屏与真实休眠恢复，完成双平台 M0 剩余证据。随后推进正式数据迁移和任务服务，再接入每日重复计划。宠物资源包、精灵图和导入继续按独立批次实现。

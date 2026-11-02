# ZaiZai

面向 Windows 和 macOS 的本地桌面应用，提供一次性任务、每日重复任务、定时提醒、互动宠物和固定下班倒计时。

已建立 Electron M0 工程，包含真实透明窗口、菜单栏或系统托盘、主进程提醒和 SQLite 保存。macOS Apple Silicon 核心链路已完成本机验证；Windows 和完整产品功能按后续阶段推进，尚未完成双平台验收。

## 运行 Electron M0

需要 Node.js 22.12 或更新版本。首次安装会下载 Electron 运行时并构建 SQLite 原生模块。

```sh
npm install
npm run dev
```

应用中可添加延迟提醒，点击“添加并隐藏”验证后台调度；双击宠物切换完整清单与仅桌宠模式。关闭按钮提供隐藏、退出、取消三个选项。

```sh
npm run test       # 使用 Electron Node ABI 验证 SQLite 与提醒规则
npm run build      # 类型检查与构建
npm run pack:mac   # 本机构建，M0 使用 ad-hoc 本地签名
```

macOS 本机应用包位于 `release/mac-arm64/Desktop Buddy M0.app`。Windows 使用 `npm run pack:win`，应在 Windows 构建和验收，当前尚无真机结果。系统通知优先使用独立应用包验证，开发运行时可能受 Electron 自身应用身份与系统授权影响。

## 体验交互原型

克隆仓库后，用浏览器打开 [双平台交互原型](docs/dual-platform-prototype.html)，或在仓库根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

然后访问 <http://127.0.0.1:8000/docs/dual-platform-prototype.html>。体验任务新增与完成、日期切换、重复计划、仅桌宠模式、宠物资源库，以及 Windows/macOS 两种桌面布局。

原型通过 CDN 加载 Tailwind CSS，需要联网。示例日期固定为 2026-11-02，数据仅保存在页面内存中，刷新后重置；系统通知、托盘、窗口隐藏与 SQLite 存储均为界面模拟。

## 文档导航

- [需求文档](docs/requirements.md)：已确认范围、业务规则、功能拆分与验收场景。
- [M0 验证记录](docs/m0-verification.md)：运行命令、本机实测、测试范围与未完成项。
- [应用架构](docs/architecture.md)：模块职责、目录结构、跨进程接口、提醒调度、窗口模式和宠物资源管理。
- [数据模型](docs/data-model.md)：六张核心表、实例身份、提醒记录、事务边界与历史保护规则。
- [双平台原型设计文档](docs/prototype-design.md)：界面布局、窗口尺寸、宠物与气泡状态机、宠物资源库配置规范、Windows/macOS 平台交互差异。
- [双平台交互原型 (HTML)](docs/dual-platform-prototype.html)：用浏览器体验任务、日期编辑、完成动画、仅桌宠模式和宠物资源库；系统通知、托盘与存储仍为演示。
- [跨平台技术选型](docs/technical-selection.md)：框架比较、建议架构和平台验证重点。
- [开发计划](docs/development-plan.md)：阶段任务、依赖、交付物与验收门槛。

建议先读需求文档了解规则与验收场景，再结合原型查看界面，最后阅读架构、数据模型与开发计划。

## 当前进度

| 内容 | 状态 |
| --- | --- |
| 需求与验收场景 | 已整理，建议默认值与待验证边界在文档内标明 |
| 浏览器交互原型 | 可体验，使用示例数据 |
| 应用架构与数据模型 | 设计基线，仍需实现与验证 |
| 双平台原生能力 | macOS M0 核心链路已测；Windows、真实休眠和多屏等尚待验证 |
| 本机应用包 | 已生成 macOS arm64 M0 包；正式分发属于后续里程碑 |

下一步按开发计划完成 M0：验证透明窗口、托盘/菜单栏、系统通知、休眠恢复与 SQLite 安装后读写，再推进正式任务闭环。

需求基线日期：2026-11-02。仓库名称为 ZaiZai，应用展示名称后续确定。

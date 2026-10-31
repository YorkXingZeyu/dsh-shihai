# 识海 · Shihai

一个**本地优先**的长期记忆库与 3D 语义星图，面向 DeepSeek Harness（DSH）。

识海不把聊天记录直接当记忆：它先从真实会话生成候选，经过人工或每周仪式确认，才写成带来源的 Markdown 正式记忆；索引、向量、布局、关系和星图都是可重建的派生层。

> 这个仓库**不包含任何人的记忆**。默认只有代码、空目录、schema 和安装脚本；你的记忆只写入你自己的本地目录。

## 它由三部分组成

- **记忆库**：Obsidian 兼容 Markdown；L0 原文 / L1 片段 / L2 原子 / L3 画像 / 故事。
- **加工层**：候选队列、来源证据、生命周期、人工确认；不自动升格。
- **视图**：BGE 语义布局、球面曲线、上下文聚焦、两跳关系、传输波前；支持桌面和窄屏。

## 快速开始

需要 Node.js 20+。建议把仓库 clone 到一个**独立的记忆目录**，不要放进 DSH 安装目录。

```bash
git clone https://github.com/YorkXingZeyu/dsh-shihai.git
cd dsh-shihai
node setup.mjs
node install-dsh.mjs
```

然后重启 DSH。DSH 输入区右侧会出现「识海」按钮；如果只想单独看查看器：

```bash
node tools/start-viewer.mjs
# 打开 http://127.0.0.1:4177/
```

## 在 DSH 对话框里安装

把下面这段发给 DSH（把路径换成你自己的）：

```text
@https://github.com/YorkXingZeyu/dsh-shihai
请只安装这个开源插件：把它 clone 到我的本地目录，运行 setup.mjs 和 install-dsh.mjs。
不要导入、读取、上传或合并任何已有记忆；不要提交 .private。
先问我准备把记忆库放在哪里，再开始。
```

这不是“点一下自动拥有记忆”。DSH 需要先获得你的本地文件/终端权限，并询问你的记忆库路径。安装完成后，记忆仍需由你或你的智能体按 schema 逐条写入。

## 目录

```text
识海视图/           查看器源码与构建
plugins/dsh-shihai/  DSH 内嵌插件
tools/              构建、导入、启动脚本
config/             来源配置（sources.json 本地生成，不提交）
20_共同经历/         L1 / 共同经历
30_片段/             L1 会话片段
35_原子/             L2 原子
40_项目/             项目状态
50_故事/             共同经历叙事
90_元数据/           索引、画像、故事集、布局
.private/            原始会话与候选（绝不提交）
```

## 记忆怎么写

正式记忆的 frontmatter 至少要有：

```yaml
---
id: ep_20260101_example
layer: L1
date: 2026-01-01
title: 一次可回看的经历
source:
  channel: dsh
  session: your-session-id
  messages: [12, 18]
  quote: "原始会话中的关键句"
evidence:
  - "30_片段/2026-01-01 一次可回看的经历.md#L12"
related: []
lifecycle: active
privacy: private
---
```

规则：

- 没有来源与证据的内容不进入正式层。
- L2 一条只写一个可复用结论，不写任务摘要。
- L3 画像是推导，不是逐字事实。
- 故事是叙事，不是事实源。
- 更正写新记忆，不覆盖原文。
- 不自动物理删除；“遗忘”只通过生命周期、强度和视觉衰减表达。

## 构建与验证

```bash
node setup.mjs                 # 初始化空 vault 并生成查看器
node 识海视图/build.mjs         # 重建查看器快照
node tools/start-viewer.mjs     # 启动 4177
npm run check:privacy           # 检查明显的私有路径/会话数据
```

如果你的记忆库已有 `90_元数据/notes.index.json`，查看器会读取它；索引不存在时先运行你的导入/索引脚本。

## 隐私

- 仓库默认不包含 `.private/`、正式记忆、画像、会话索引或截图。
- `config/sources.json` 与 `.private/` 被 `.gitignore` 排除。
- 不要把真实会话、身份证、邮箱、电话、聊天记录提交到公开仓库。
- 公开演示前先脱敏：标题、正文、项目、人物、来源、故事、交互文本全部替换为样本。
- 安全说明见 [SECURITY.md](SECURITY.md)。

## 当前边界

- 没有自动 L2/L3 升格。
- 没有真正的生物式遗忘；不物理删除原文。
- 没有 WebGL；是 Canvas 2D 上的 3D 投影。
- 没有 QQ 主动推送。
- 语义布局是投影，不是事实坐标。

## License

MIT

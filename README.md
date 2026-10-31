# 识海 · Shihai

一个**本地优先**的长期记忆库与 3D 语义星图，面向 DeepSeek Harness（DSH）。

识海不把聊天记录直接当记忆。它先把真实内容放进只追加的原始层，再生成候选，经人工或每周仪式确认，才写成带来源的 Markdown 正式记忆；索引、向量、布局、关系和星图都是可重建的派生层。

> **这个仓库不包含任何人的记忆。** 只有代码、空目录、schema、安装脚本和查看器。每个人的记忆写入自己的本地 vault，不会随仓库分发。

---

## 目录

- [它是什么](#它是什么)
- [快速开始](#快速开始)
- [在 DSH 对话框里安装](#在-dsh-对话框里安装)
- [安装细节](#安装细节)
- [第一次写记忆](#第一次写记忆)
- [记忆管理设计](#记忆管理设计)
- [从记忆到星图](#从记忆到星图)
- [命令速查](#命令速查)
- [目录结构](#目录结构)
- [隐私与安全](#隐私与安全)
- [当前边界](#当前边界)
- [常见问题](#常见问题)
- [License](#license)

---

## 它是什么

识海由三部分组成：

1. **真实记忆库**  
   Obsidian 兼容 Markdown。每条正式记忆有 id、层级、日期、来源、证据和生命周期。

2. **记忆加工层**  
   L0 原始 → L1 片段 → L2 原子 → L3 画像 / 故事。候选必须经过确认，不能自动升格。

3. **可解释的视图**  
   BGE 语义布局、语义社区、球面曲线、上下文聚焦、两跳关系和传输波前。视图是派生结果，不是事实源。

它适合：

- 希望智能体长期记得“发生过什么”的人；
- 想把 DSH 会话沉淀成可回查记忆的人；
- 需要区分“事实 / 推断 / 故事 / 候选”的人；
- 想要一张能解释关系、而不是只好看的关系图的人。

它不适合：

- 想一键自动导入所有聊天、自动生成完美记忆的人；
- 想把记忆交给云端、完全不看本地文件的人；
- 需要真正生物式遗忘或数据库级强一致的人。

---

## 快速开始

### 环境

- Node.js **20+**
- DeepSeek Harness（DSH）桌面版或 Web 版
- 可选：Python 3 + 相关库，用于 BGE embedding；不装时查看器仍可运行

### 三步安装

```bash
git clone https://github.com/YorkXingZeyu/dsh-shihai.git
cd dsh-shihai
node setup.mjs
node install-dsh.mjs
```

然后**重启 DSH**。

重启后，DSH 输入区右侧会出现「识海」按钮；点击即可在 DSH 内嵌 iframe 里打开。

如果只想单独看查看器：

```bash
node tools/start-viewer.mjs
# 浏览器打开 http://127.0.0.1:4177/
```

> `setup.mjs` 只创建空目录、空索引并生成空查看器，不会导入任何现有记忆。

---

## 在 DSH 对话框里安装

可以把下面这段直接发给 DSH。它需要本地终端/文件权限，并且应该先问你要把记忆库放在哪里：

```text
@https://github.com/YorkXingZeyu/dsh-shihai
请只安装这个开源插件：把它 clone 到我的本地目录，运行 setup.mjs 和 install-dsh.mjs。
不要导入、读取、上传或合并任何已有记忆；不要提交 .private。
先问我准备把记忆库放在哪里，再开始。
```

说明：

- `@GitHub 地址` 只是把仓库交给 DSH 作为上下文；**不是绕过权限的自动执行**。
- DSH 需要你确认安装位置和终端命令。
- 安装完成后得到的是**空识海**，不是别人的记忆。

---

## 安装细节

### `setup.mjs` 做了什么

```bash
node setup.mjs
```

会：

1. 创建 `20_共同经历 / 30_片段 / 35_原子 / 40_项目 / 50_故事 / 90_元数据 / .private` 等目录；
2. 如果没有索引，创建空的 `90_元数据/notes.index.json`；
3. 如果没有布局，创建空 `90_元数据/layout.json`；
4. 如果没有 `config/sources.json`，从 `sources.example.json` 复制一份；
5. 运行 `识海视图/build.mjs`，生成空查看器。

不会覆盖已有的正式记忆文件；已有索引也不会被重建。

### `install-dsh.mjs` 做了什么

```bash
node install-dsh.mjs
```

会：

1. 找到 DSH profile（默认 `~/.dsh/profiles/desktop`，可用 `DSH_PROFILE_DIR` 覆盖）；
2. 备份 `package.json` 为 `package.json.bak-before-shihai`；
3. 把 `plugins/dsh-shihai` 以 junction/symlink 方式加入 `node_modules`；
4. 把 `dsh-shihai` 加进 `dsh.profile.bundles`；
5. 等待 DSH 重启后加载。

插件默认：

- viewer：`http://127.0.0.1:4177/`
- memoryRoot：仓库根目录（也可在 `plugins/dsh-shihai/cordis.patch.yml` 的 `memoryRoot` 里显式配置）

### 单独打开查看器

```bash
node tools/start-viewer.mjs
```

只启动查看器，不安装 DSH 入口。适合先检查空库是否能打开。

### 卸载

```bash
# 在 DSH profile 的 package.json 中移除 dsh-shihai
# 删除 node_modules/dsh-shihai
# 用 package.json.bak-before-shihai 恢复原 manifest（如需要）
```

---

## 第一次写记忆

### 1. 建一个正式记忆

在 `30_片段/` 或 `20_共同经历/` 新建 `.md`：

```markdown
---
id: ep_20260101_example
layer: L1
date: 2026-01-01
title: 一次可回看的经历
source:
  channel: manual
  session: null
  messages: []
  quote: "当时的一句关键原话"
evidence: []
related: []
privacy: private
lifecycle: active
---

## 背景

发生了什么。

## 做了什么

做了什么。

## 结果

结果是什么。

## 这次之后

它改变了什么；写不出就空着，不要硬编。
```

### 2. 生成索引并刷新查看器

```bash
node tools/build-index.mjs
node 识海视图/build.mjs
```

`build-index.mjs` 会扫描：

```text
20_共同经历/  30_片段/  30_约定/  35_原子/
40_项目/      50_故事/  50_日常/  60_主题/
```

### 3. 打开查看器

```bash
node tools/start-viewer.mjs
```

如果已有自己的 `notes.index.json`，可以跳过 `build-index`，直接把索引放好。

> 当前 alpha 只提供“扫描 Markdown 生成索引”的最小入口；从 DSH/QQ 自动抽取候选、生成 L2/L3、做语义布局，需要按你的来源配置继续扩展。仓库不假装这些步骤已经自动完成。

---

## 记忆管理设计

### 一张总图

```text
DSH / QQ / 工作区
        │
        ▼
  L0 原始层（只追加）
        │  原文 + 附件元数据
        ▼
  候选队列（pending / approved / ignored）
        │  人工审阅 / 每周仪式
        ▼
  正式记忆（L1 / L2 / L3 / 故事）
        │  Markdown + 来源 + 证据
        ▼
  派生层（索引 / embedding / layout / 关系）
        │  可删除、可重建
        ▼
  识海视图（检索 / 上下文 / 星图）
```

唯一真相在正式记忆与原文；索引、向量、坐标、颜色、关系边都是派生结果。

### 四层记忆

| 层 | 回答的问题 | 典型内容 | 进入检索 |
|---|---|---|---|
| **L0 原始** | 当时到底说了什么？ | 会话原文、附件元数据 | 否，只用于回源 |
| **L1 片段** | 这次经历是什么？ | 背景、行动、结果、之后 | 是 |
| **L2 原子** | 哪条结论可复用？ | 偏好、决定、边界、承诺 | 是 |
| **L3 画像** | 跨记忆看，这个人/关系是什么样？ | 画像条目 + 证据 | 是，标“推导” |
| **故事** | 为什么这段值得记住？ | 多段记忆组成的叙事 | 否，用于理解和展示 |

规则：

- 一条 L2 只表达一个可复用结论，不写任务摘要。
- 故事不是事实源；L2 也不是 L1 的摘要。
- L3 是推导，不是逐字事实；与用户当前说法冲突时以当前为准。
- 没有来源的内容不进入正式层。

### 候选三态

| 状态 | 含义 | 后续 |
|---|---|---|
| `pending` | 已提取，尚未确认 | 人工/周仪式审阅 |
| `approved` | 确认值得进入正式层 | 写成 L1/L2，补来源 |
| `ignored` | 噪声、重复、临时信息 | 不进入正式层 |

**候选不是记忆。** 自动提取只负责“提出可能”，不负责“确认事实”。

### 纠正与遗忘

- 纠错：写一条新记忆，指向旧结论；旧原文保留。
- 遗忘：通过 `lifecycle`、`strength`、颜色/透明度衰减表达；不物理删除原文。
- 私密：`privacy: private` 的正式记忆默认不进入公开演示/导出。

---

## 从记忆到星图

### 位置

- 文本 → BGE 向量（没有模型时可用 TF-IDF 回退）
- kNN + `related` 权重 → 语义关系
- 3D 力导向 → 坐标
- 增量优先；旧星不因一次新交互全图重排
- 10 个语义社区 → 颜色
- 位置是语义投影，不是时间轴，也不是事实坐标

### 一次点击发生什么

1. 选中的星成为种子；
2. 直接相关的边和节点提亮；
3. 所有关系线仍然保留，无关边退到背景；
4. 右侧上下文面板按关系类型分组；
5. 默认一跳，用户可手动展开两跳；
6. 信号沿球面曲线传播：同源同时出发、同速、距离决定到达，先到节点再接力；
7. 关闭或点空白回到全景，不重排坐标。

### 视觉语法

| 元素 | 编码 | 不编码 |
|---|---|---|
| 位置 | 语义向量 + 关系力导向的投影 | 不是时间、不是重要性 |
| 形状 | L1 圆 / L2 菱形 / 故事四角星 / 交互双点 | 不表达项目 |
| 尺寸 | 强度/重要度分档 | 不表达新旧 |
| 明暗 | 新近程度、生命周期 | 不表达“真假” |
| 颜色 | 语义社区；金色只留给故事 | 不按项目名硬分色 |
| 曲线 | 可解释关系边 | 不是因果 |
| 金色虚线 | 候选/待确认 | 不是正式记忆 |

---

## 命令速查

```bash
node setup.mjs                       # 初始化空 vault + 空查看器
node install-dsh.mjs                 # 安装 DSH 入口（需重启 DSH）
node tools/start-viewer.mjs          # 启动 4177

node tools/build-index.mjs           # 扫描 Markdown，生成 notes.index.json
node 识海视图/build.mjs               # 重建查看器快照
node 识海视图/server.mjs              # 直接启动查看器服务器

npm run check:privacy                # 检查明显的私有路径/会话数据
```

可选：

```bash
node tools/import-dsh.mjs            # 导入 DSH 会话到 .private/raw（需配置 sources.json）
node tools/build-interactions.mjs    # 生成交互索引；会尝试 embedding/layout
python tools/embed-docs.py           # BGE 向量（可选）
node tools/build-layout.mjs          # 重算布局（可选）
```

> `build-interactions` / `build-layout` 依赖来源配置与可选模型；不是空库初始化的必经步骤。

---

## 目录结构

```text
识海视图/                查看器源码与构建
  src/app.js             Canvas 星图、上下文、曲线、波前
  src/shell.html         HTML 外壳
  src/style.css          样式
  build.mjs              生成只读快照
  data.mjs               读取 vault 数据
  server.mjs             SSE / API / 静态服务

plugins/dsh-shihai/      DSH 内嵌插件
tools/                   索引、导入、布局、启动脚本
config/                  来源配置模板
20_共同经历/             L1 / 共同经历
30_片段/                 L1 会话片段
30_约定/                 约定
35_原子/                 L2 原子
40_项目/                 项目状态
50_故事/                 共同经历叙事
50_日常/                 日常片段
60_主题/                 主题索引
90_元数据/               索引、画像、故事集、布局
.private/                原始会话与候选（绝不提交）
```

---

## 隐私与安全

### 这个仓库不包含

- 真实 DSH 会话或 QQ 聊天
- `.private/` 原始记录
- 真实记忆、画像、故事、交互索引
- 截图、视频或个人信息
- 真实来源路径

### 运行时

- 记忆只写入你选择的本地目录。
- `.private/` 与 `config/sources.json` 已被 `.gitignore` 排除。
- 公开演示/截图/视频前，必须把标题、正文、项目、人物、来源、故事、交互文本替换为样本。
- 不要把真实内容粘到公开 issue。

### 检查

```bash
npm run check:privacy
```

它会扫描明显的绝对用户路径、`.dsh`/`qqbot` 路径和会话数据引用。它不能替代人工审查，提交前仍应自己看一眼 `git diff`。

---

## 当前边界

- 没有自动 L2/L3 升格；候选必须人工确认。
- 没有真正的生物式遗忘；不物理删除原文。
- 没有 WebGL；是 Canvas 2D 上的 3D 投影。
- 没有 QQ 主动推送。
- 语义布局是投影，不是事实坐标。
- `build-index` 只做保守扫描；自动候选/语义画像需要额外配置。
- 默认空库；没有附带任何人的记忆。

---

## 常见问题

### 重启后没有「识海」按钮

1. 确认 `install-dsh.mjs` 成功；
2. 检查 DSH profile 的 `package.json` 是否有 `dsh-shihai` bundle；
3. 完全退出并重启 DSH，不只是刷新页面；
4. 检查 `plugins/dsh-shihai/index.js` 是否存在。

### 页面是空的

这是正常的：新库没有记忆。

```bash
node tools/build-index.mjs
node 识海视图/build.mjs
```

然后放入一条测试记忆，再刷新。

### 4177 端口被占用

设置环境变量：

```bash
SHIHAI_VIEW_PORT=4178 node 识海视图/server.mjs
```

并同步修改 `plugins/dsh-shihai/cordis.patch.yml` 的 `viewerUrl`。

### 我想用 Obsidian

直接把仓库根目录作为 Vault 打开。`.private` 以点开头，Obsidian 默认不显示。

---

## License

MIT

# myblog

一个自己写的静态博客生成器。**零第三方依赖**，只用到 Python 标准库（连 Markdown 解析器都是手写的）。

- 不需要 Hexo / Hugo / Jekyll / Astro
- 不需要 Node、不需要数据库、不需要宝塔
- 生成的就是纯 HTML + CSS + 图片，扔到任何静态托管上都能跑

---

## 快速开始

**双击 `preview.bat`** —— 就这么简单。它会自动构建、起一个本地服务、并打开浏览器。

关掉那个黑窗口就等于停止预览。

命令行等价写法：

```bash
python build.py --serve      # 构建 + 本地预览 http://127.0.0.1:8000
python build.py              # 只构建，产物在 dist/
```

---

## 本地看博客的两种方式

### 方式一：双击 `dist\index.html`（最省事）

生成的站点用的是**相对路径**，所以直接双击 HTML 文件就能看，不用装任何东西、不用开服务。
文章页 `dist\posts\xxx.html` 也一样双击就能开。

> 唯一看不到的是右下角的看板娘 —— 浏览器不允许 `file://` 页面读取本地 JSON 文件。
> 其他一切（样式、图片、链接、导航）都正常。

### 方式二：双击 `preview.bat`（完整效果）

起一个真正的本地服务器，看板娘也能正常跑。适合发布前完整检查一遍。

- 端口默认 8000，被占用会自动顺延
- 想换端口：`python build.py --serve --port 9000`
- 预览时禁用了缓存，改完文章重新跑一次就是最新的

### 本地看和线上看的区别

| | 本地 | 线上 |
| --- | --- | --- |
| 看的是什么 | 你刚改完还没发布的内容 | 已经发布出去的内容 |
| 别人能看吗 | 不能 | 能 |
| 怎么更新 | 重新跑一次 `build.py` | 再跑一次 `deploy.py` |

**写完文章先本地看一眼，满意了再发布。**

---

## 为什么生成的是相对路径

站点里所有站内链接、图片、CSS/JS 引用都是**相对当前页面的路径**（根目录页面写
`assets/style.css`，文章页写 `../assets/style.css`）。好处是：

- 直接双击 HTML 就能看（`file://` 下也能跑）
- 部署到域名根目录、子路径（`名字.github.io/blog/`）、或者以后绑自己的域名，**都不用改配置**
- 换托管商不用重新构建

---

## 写一篇新文章

**方法一（推荐）**：

```bash
python build.py --new "我的新文章"
```

会在 `posts/` 里生成 `2026-10-16-我的新文章.md`，里面已经带好模板，直接往里写就行。

**方法二**：自己往 `posts/` 里丢一个 `.md` 文件，文件名建议用 `日期-英文标题.md`，例如 `2026-10-20-my-note.md`。

写完后重新跑一次 `python build.py` 就完成了。

### 文章开头的元信息（可省略）

```markdown
---
title: "登录注入"
date: 2026-04-20
categories: [渗透测试, 笔记]
slug: login-injection
summary: "一句话摘要，会显示在首页列表里"
draft: false
---

正文从这里开始……
```

- 全部字段都可以不写，不写就按文件名推断标题和日期。
- `draft: true` 的文章不会被构建进站点。
- 分类想写多个就用 `[甲, 乙]`。

### 正文支持的 Markdown 语法

| 语法 | 写法 |
| --- | --- |
| 标题 | `## 二级标题`（`#` 到 `######`） |
| 加粗 / 斜体 / 删除线 | `**粗**` `*斜*` `~~删~~` |
| 行内代码 | `` `code` `` |
| 代码块 | 三个反引号包裹，或整段缩进 4 个空格 |
| 链接 / 图片 | `[文字](地址)` `![说明](/images/图.png)` |
| 列表 | `- 项` / `1. 项`，缩进两格即可嵌套 |
| 引用 | `> 引用内容` |
| 分割线 | `---` |
| 表格 | `\| 列 \| 列 \|` 加一行 `\|---\|---\|` |
| 原生 HTML | 直接写 `<div>` 等标签会原样输出 |

> 长文章会自动生成右侧「目录」（需要至少两个二/三级标题）。

### 图片放哪

图片放在 `images/` 目录下，正文里用 `/images/xxx.png` 引用：

```markdown
![截图](/images/2026/04/48.jpeg)
```

构建时 `images/` 会整个复制到站点里，所以原图放进去就行，不用管目录层级。

---

## 外观（Kratos 皮肤）

当前皮肤是从原来的 WordPress 主题 **Kratos（kratos-pjax-master）** 复刻过来的，配色和参数直接取自
原主题的实际配置：

| 项目 | 值 | 改哪里 |
| --- | --- | --- |
| 主题色 | `#51aded` | `assets/style.css` 的 `--accent` |
| 内容底色 | `#f5f5f5` | `--bg` |
| 导航条 | `rgba(22,23,26,.9)` | `--nav-bg` |
| 页脚 | `rgb(35,40,45)` | `--footer-bg` |
| 顶部大图 | `assets/background.jpg` | `config.json` → `banner.image` |
| Banner 文字 | `Rookie` / `我的第一个博客` | `config.json` → `banner.title` / `banner.subtitle` |
| 侧边栏头像 | `assets/photo.jpg` | `config.json` → `sidebar.avatar` |

对应的界面元素：固定顶部导航条 + 大图 banner + 卡片式文章列表（缩略图在左）+
右侧边栏（个人卡 / 最近文章 / 分类 / 标签）+ 深色页脚 + 右下角返回顶部。

**文章缩略图是自动取的**：优先用 front matter 里的 `cover:`，没写就自动抓正文里的第一张图。
都不想要可以在 front matter 里写 `cover: none`。

想关掉侧边栏：`config.json` 里删掉 `sidebar` 字段即可。

想加雪花特效：`config.json` → `"effects": { "snow": true }`。

## 看板娘（Live2D）

从原主题**原样移植**过来的，左下角的 Live2D 角色，可以摸头、拖动、换人、换装。

```json
"effects": { "waifu": true, "waifu_person": "33" }
```

| 悬停角色后出现的按钮 | 作用 |
| --- | --- |
| 🏠 房子 | 回到首页 |
| 💬 气泡 | 来一句「一言」 |
| 🔄 换人 | 在 22 / 33 两个角色之间切换 |
| 👕 衣服 | 换下一套衣服（共 21 套） |
| 📷 相机 | 把当前画面存成图片 |
| ℹ️ 信息 | 关于本站 |
| ✕ 关闭 | 把她藏起来，右下角会留一个按钮可以叫回来 |

角色还能**按住拖动**到页面任意位置，点她会说话，7 次以上会生气。

### 她为什么这么大

模型资源一共 13MB、190 个文件，全部随站点托管，**不依赖任何 CDN**。浏览器只加载当前这一套
衣服的贴图（约 100KB），其余的是换装时才按需拉取，所以日常访问不受影响。

依赖链：`jquery.min.js`（84KB）+ `live2d.js`（151KB）+ `waifu.js`。这三个加起来约 235KB，
只在 `waifu` 打开时才加载。

### 移植时改了两处

1. **模型配置原本是 PHP 动态生成的**（`inc/model/api.php`），静态站跑不了 PHP，
   已预先渲染成 `assets/live2d/<角色>-<衣服序号>.json`（42 个静态文件）。
   换模型的话要重新生成，逻辑见项目里的说明。
2. **删掉了一处向 `icanhazip.com` 查询访客公网 IP 的请求** —— 那会把每个访客的 IP
   发给第三方。改成了本地文案。
   另外「一言」保留，但请求失败时会回退到本地句子。

### 不想要她

```json
"effects": { "waifu": false }
```

重新构建即可，页面里不会再输出她的任何代码和资源引用。

```json
"banner":   { "image": "/assets/background.jpg", "title": "Rookie", "subtitle": "我的第一个博客" },
"sidebar":  { "avatar": "/assets/photo.jpg", "name": "Rookie-Chick", "bio": "一句话简介",
              "recent_count": 8, "show_categories": true, "show_tags": true,
              "links": [{ "text": "GitHub", "url": "https://github.com/你的名字" }] },
"social":   [{ "text": "GitHub", "url": "...", "icon": "github" }],
"effects":  { "snow": false }
```

导航图标可用的名字：`home` `archive` `folder` `info` `rss` `user` `mail` `github` `tag` `clock` `search`。

## 换个页面

- `pages/` 目录里的 `.md` 会生成成独立页面。已有的 `pages/about.md` → `/about.html`。
- 站点标题、导航栏、页脚在 `config.json` 里改。
- 配色、字体、最大宽度在 `assets/style.css` 顶部的 `:root` 里改。

---

## 部署

产物是一堆纯静态文件，随便放。

### GitHub Pages（仓库设置里选目录）

```bash
python build.py --out docs
```

然后把整个项目 `git push` 上去，在仓库 **Settings → Pages** 里把 Source 设为 `main` 分支的 `/docs` 目录。

### GitHub Pages（推到 gh-pages 分支）

用自带的脚本，免 git：

```bash
python deploy.py 用户名/仓库名
```

**Token 放哪：** 推荐直接写进项目根目录的 `token.txt`（一行，只放 token 本身），
脚本会自动读。这个文件已经在 `.gitignore` 里，不会被提交。

```
E://Blog//myblog//token.txt      ← 内容就一行 ghp_xxxxxxxx
```

也可以走环境变量（临时用一次更方便）：

```bash
set GITHUB_TOKEN=你的token        # Windows
export GITHUB_TOKEN=你的token     # macOS / Linux
```

Token 要什么权限：**classic token 勾 `repo`**（公开仓库只勾 `public_repo` 也行）；
fine-grained token 需要 `Contents: Read and write` + `Pages: Read and write`。

**别把 token 贴在聊天里或者提交进仓库。** 一旦泄漏（比如贴到网上、发到群里），
第一时间去 <https://github.com/settings/tokens> 把它 Delete 掉 —— 吊销是即时生效的，
旧 token 立刻作废，不会影响已经推送上去的内容。

脚本会构建 → 把 `dist/` 的内容推到 `gh-pages` 分支 → 自动开启 Pages。

部署成功后它还会**自动清理历史部署记录**，只保留最近 1 条（GitHub 的
`deployments` 页面每推送一次就多一条，久了会堆一长串）。想保留更多：

```bash
python deploy.py 用户名/仓库名 --keep-deployments 5   # 留最近 5 条
python deploy.py 用户名/仓库名 --keep-deployments 0   # 不清理
```

### 源码也一起备份

`config.json` 里写一行：

```json
"source_repo": "用户名/blog-src"
```

之后每次部署会**顺带把源码推到那个仓库**（`build.py`、`posts/*.md`、`assets/`、
`images/` 等），`token.txt`、`dist/`、`.build-cache/` 自动排除。
换台电脑 `git clone` 下来就能直接 `preview.bat` 干活。

```bash
--no-source                 这次只发站点，不备份源码
--source-repo 用户名/xxx     临时指定另一个源码仓库
```

> 源码仓库第一次推送时如果还是空的，脚本会自动建一个占位提交
> —— 因为 GitHub 对空仓库的 `git/blobs` 接口会返回 `409 Git Repository is empty`。

### Cloudflare Pages

- 构建命令：`python build.py`
- 输出目录：`dist`

### 部署在子路径下

不用做任何事。站内链接全是相对路径，放子路径（`名字.github.io/blog/`）和放域名根目录
都一样能跑，**不需要改配置**。

只有 `config.json` 里的 `url` 要填成最终的站点地址 —— 那是给 RSS 和 sitemap 用的绝对地址。

### 绑定自己的域名

加一个 `static/CNAME` 文件，里面写一行域名。`static/` 里的内容会原样复制到站点根目录。

---

## 目录结构

```
myblog/
├── preview.bat      双击这个：构建 + 本地预览（Windows）
├── build.py         生成器本体（唯一需要看的代码）
├── deploy.py        一键推到 GitHub Pages（可选）
├── config.json      站点配置
├── posts/           文章（Markdown，往这里丢就行）
├── pages/           独立页面（关于、友链…）
├── images/          文章里的图片
├── assets/          style.css 皮肤 / banner 与头像
│   ├── js/          看板娘用的 jQuery + live2d.js + waifu.js
│   └── live2d/      Live2D 模型与服装（13MB，190 个文件）
├── static/          原样复制到站点根目录的文件
│   ├── README.md    仓库首页的介绍（会部署到站点根目录）
│   └── billiards/   8 球台球小游戏（纯前端，108KB）
├── token.txt        GitHub token（别提交，已在 .gitignore 里）
├── .build-cache/    构建缓存（记录上次生成了哪些文件，别删）
└── dist/            构建产物（重新生成即可）
```

---

## 命令行参数

| 参数 | 说明 |
| --- | --- |
| （无） | 构建到 `dist/` |
| `--serve` | 构建并起本地预览服务 |
| `--port 8000` | 预览端口 |
| `--new "标题"` | 新建文章 |
| `--out docs` | 指定输出目录 |
| `--clean` | 清空输出目录 |

---

## 为什么自己做

WordPress 要 PHP + MySQL + 宝塔面板，维护成本高，还容易被扫。静态站点没有后台、没有数据库、没有可执行文件，攻击面几乎为零，托管还免费。

生成器本身只有约 900 行，出了任何问题都能自己改。

MIT License.

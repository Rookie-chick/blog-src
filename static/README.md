# Rookie-Chick

> Web 安全 / 渗透测试 / 学习笔记

**在线访问 → <https://rookie-chick.github.io/>**

---

## 这是什么

这是我的个人博客。记录一些学习过程中的东西：Kali、Metasploit、SqlMap、BurpSuite、
注入与 FUZZ、数字取证、自建节点……内容大多是自己踩坑时写下的笔记，不保证严谨，
但都是实际跑过的。

本仓库里存放的是**站点产物** —— 一堆纯静态的 HTML / CSS / JS / 图片。
没有数据库，没有后端，没有任何需要执行的程序。

---

## 技术栈

生成器是自己写的（`build.py`，约 900 行 Python，**只用标准库**），
没有用 Hexo、Hugo、Jekyll、Astro，也没有 Node 依赖。

| | |
| --- | --- |
| 页面生成 | 手写的 Markdown 解析器 + 模板 |
| 样式 | 一份 CSS，无框架 |
| 交互 | 原生 JS，无框架 |
| 看板娘 | Live2D（jQuery + live2d.js + 模型，全部自托管） |
| 托管 | GitHub Pages |
| 依赖体积 | 0 |

之所以自己写，是因为受够了 WordPress 那一套：要 PHP、要 MySQL、要面板，
装完 4GB，还得天天防着被扫。换成静态站点之后：

- 体积从 4GB 降到 60MB
- 服务器上**没有任何可执行文件**，也就没有什么可以被攻击的
- 托管免费，写作只要一个 Markdown 文件

---

## 站点长什么样

- **Kratos 主题皮肤** —— 从原来用的 WordPress 主题复刻，配色和参数是照着原站配置还原的
- **卡片式首页** —— 缩略图自动抓正文第一张图，不用手动设置封面
- **右侧边栏** —— 个人卡、最近文章、分类、标签云
- **归档 / 分类 / 标签** 三种浏览方式
- **RSS 订阅** —— 订阅页 <https://rookie-chick.github.io/rss.html> ，订阅地址 <https://rookie-chick.github.io/feed.xml>
- **全站响应式**，手机端有汉堡菜单
- **看板娘** —— 右下角的 Live2D 角色，可以摸头、拖动、换人、换装（21 套衣服）
- **🎱 8 球台球** —— <https://rookie-chick.github.io/billiards/> ，
  纯 Canvas + 原生 JS 写的人机对战小游戏，零依赖，三档 AI 难度

---

## 目录结构

```
.
├── index.html          首页（文章列表）
├── archive.html        按年份归档
├── categories.html     分类索引
├── about.html          关于
├── feed.xml            RSS 订阅
├── sitemap.xml         站点地图
├── 404.html
│
├── posts/              每篇文章一个 HTML
├── categories/         每个分类一个页面
├── tags/               每个标签一个页面
│
├── images/             文章配图（按 年/月 分目录）
└── assets/
    ├── style.css       整站样式
    ├── app.js          菜单 / 返回顶部 / 雪花
    ├── js/             看板娘脚本
    └── live2d/         Live2D 模型与服装
```

---

## 想自己搭一个

生成器源码不在这个仓库里。如果你也想自己写一个类似的，思路其实很简单：

1. 遍历 `posts/` 里的 Markdown，解析 front matter 和正文
2. 套模板生成 HTML
3. 把静态资源复制过去
4. 扔到任意静态托管

难的不是生成器，是**下决心离开 WordPress**。

---

## 版权与致谢

- 文章内容：除非特别注明，均为原创，转载请注明出处
- 主题皮肤：复刻自 [Kratos](https://github.com/xb2016/kratos-pjax)（GPL v3），
  页面底部保留原作者的版权信息符合其许可要求
- Live2D：模型资源来自 Kratos 主题自带，Live2D 运行时版权归 Live2D Inc. 所有
- 本站代码：MIT

---

<sub>Powered by myblog · 一个只有 900 行的静态站点生成器</sub>

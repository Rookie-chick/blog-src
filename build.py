#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
myblog —— 零依赖静态博客生成器（只用到 Python 标准库）

用法:
    python build.py                构建，产物在 dist/
    python build.py --new "标题"     新建一篇文章（自动带日期和 front matter）
    python build.py --serve         构建并启动本地预览 http://127.0.0.1:8000
    python build.py --clean         只清空 dist/

写文章: 往 posts/ 里丢一个 .md，再跑一次 python build.py 即可。
"""

import argparse
import datetime
import html
import json
import os
import re
import shutil
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

ROOT = os.path.dirname(os.path.abspath(__file__))
POSTS_DIR = os.path.join(ROOT, 'posts')
PAGES_DIR = os.path.join(ROOT, 'pages')
ASSETS_DIR = os.path.join(ROOT, 'assets')
IMAGES_DIR = os.path.join(ROOT, 'images')
STATIC_DIR = os.path.join(ROOT, 'static')
DIST_DIR = os.path.join(ROOT, 'dist')   # 可用 --out 覆盖

DEFAULT_CONFIG = {
    'title': 'Rookie-Chick',
    'description': 'Web 安全 / 渗透测试 / 学习笔记',
    'author': 'Rookie-Chick',
    'email': '',
    'url': '',            # 完整站点地址，用于 RSS / sitemap，例: https://rookie-chick.github.io/blog
    'lang': 'zh-CN',
    'theme': 'auto',      # auto / light / dark
    'summary_length': 140,
    'feed_count': 20,
    'footer': '',
    'nav': [
        {'text': '首页', 'url': '/'},
        {'text': '归档', 'url': '/archive.html'},
        {'text': 'RSS', 'url': '/feed.xml'},
    ],
}


# --------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------
def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def esc_attr(s):
    return esc(s)


def esc_text(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def strip_tags(h):
    h = re.sub(r'<pre>.*?</pre>', ' ', h, flags=re.S)
    h = re.sub(r'<[^>]+>', ' ', h)
    return html.unescape(h)


def normalize_text(s):
    """统一换行；清掉 WordPress/html2text 导出常见的 \\r\\r\\n、纯空白行、行尾空格。"""
    s = s.replace('﻿', '')
    s = s.replace('\r\n', '\n').replace('\r', '')
    s = re.sub(r'\n[ \t]+\n', '\n\n', s)   # 只有空白的行 -> 真空行
    s = re.sub(r'[ \t]+\n', '\n', s)       # 行尾空白
    s = re.sub(r'\n{3,}', '\n\n', s)       # 连续空行最多保留一个
    return s


def read_text(path):
    # newline='' 关掉 Python 的通用换行转换，交给 normalize_text 统一处理
    with open(path, 'r', encoding='utf-8-sig', errors='replace', newline='') as f:
        return normalize_text(f.read())


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def parse_date(s):
    s = (s or '').strip()
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d',
                '%Y/%m/%d %H:%M', '%Y/%m/%d', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            pass
    m = re.match(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})', s)
    if m:
        try:
            return datetime.datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    return datetime.datetime(1970, 1, 1)


def slugify(s):
    s = s.strip().lower()
    s = re.sub(r'[\s]+', '-', s)
    s = re.sub(r'[\\/:*?"<>|#?%&+,.;=~!@$^()\[\]{}]+', '', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s or 'post'


def href(prefix, path):
    """
    把站内路径转成"相对当前页面"的链接。
    prefix 是当前页面到站点根目录的相对前缀：根目录页面为 ''，posts/ 下为 '../'。
    全站用相对路径的好处：生成结果放哪儿都能跑 —— GitHub Pages 子路径、
    自定义域名、甚至直接双击本地 HTML 用 file:// 打开都不用改配置。
    """
    if not path:
        return prefix or './'
    path = str(path)
    if path.startswith(('http://', 'https://', '//', '#', 'mailto:', 'data:', 'javascript:')):
        return path
    if path == '/':
        return prefix or './'
    return prefix + (path[1:] if path.startswith('/') else path)


# --------------------------------------------------------------------------
# Front Matter（极简 YAML 子集）
# --------------------------------------------------------------------------
FM_RE = re.compile(r'^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)', re.S)


def parse_front_matter(text):
    m = FM_RE.match(text.lstrip('﻿'))
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).split('\n'):
        line = line.strip()
        if not line or line.startswith('#') or ':' not in line:
            continue
        k, v = line.split(':', 1)
        k, v = k.strip().lower(), v.strip()
        if v.startswith('[') and v.endswith(']'):
            inner = v[1:-1]
            meta[k] = [x.strip().strip('"').strip("'") for x in inner.split(',') if x.strip()]
        else:
            if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
                v = v[1:-1]
            meta[k] = v
    return meta, text[m.end():]


def as_list(v):
    if not v:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [x.strip() for x in re.split(r'[,，]', str(v)) if x.strip()]


# --------------------------------------------------------------------------
# Markdown -> HTML（自己写的解析器，够用且不引第三方库）
# 支持: 标题 / 段落 / 围栏代码块 / 缩进代码块 / 引用 / 列表(可嵌套) / 分割线 /
#       表格 / 行内代码 / 粗体 / 斜体 / 删除线 / 链接 / 图片 / 自动链接 / 换行
# --------------------------------------------------------------------------
def code_block(lines, lang):
    text = esc_text('\n'.join(lines)).rstrip('\n')
    cls = ' class="language-%s"' % esc_attr(lang) if lang else ''
    return '<pre><code%s>%s</code></pre>' % (cls, text)


def inline(text, prefix=''):
    # 归一化尖括号包裹的地址：  [x](<url>)   (</images/a.png>)
    text = re.sub(r'\(\s*<([^<>\s]+)>\s*\)', r'(\1)', text)
    s = esc_text(text)
    codes = []

    def stash(m):
        codes.append(m.group(1))
        return '\x00%d\x00' % (len(codes) - 1)

    s = re.sub(r'`([^`\n]+)`', stash, s)

    def aq(v):
        """s 里的内容已经被 esc_text 转义过，这里只补引号。"""
        return v.replace('"', '&quot;')

    def fix(u):
        return href(prefix, u.strip())

    def img_repl(m):
        alt, src, title = m.group(1), fix(m.group(2)), (m.group(3) or '')
        t = ' title="%s"' % aq(title) if title else ''
        return '<img src="%s" alt="%s"%s loading="lazy">' % (aq(src), aq(alt), t)

    s = re.sub(r'!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)', img_repl, s)

    def link_repl(m):
        txt, url, title = m.group(1), fix(m.group(2)), (m.group(3) or '')
        # WordPress 导出常见: [![缩略图](a-150x150.png)](a.png) —— 直接换成原图
        mi = re.match(r'^<img src="([^"]+)"', txt)
        if mi:
            big = re.sub(r'-\d+x\d+(?=\.[A-Za-z0-9]+$)', '', mi.group(1))
            if big != mi.group(1) and big == url:
                return '<a href="%s" class="img-link" target="_blank" rel="noopener">' \
                       '<img src="%s" alt="" loading="lazy"></a>' % (aq(url), aq(url))
        t = ' title="%s"' % aq(title) if title else ''
        ext = ' target="_blank" rel="noopener"' if url.startswith(('http://', 'https://', '//')) else ''
        return '<a href="%s"%s%s>%s</a>' % (aq(url), t, ext, txt)

    s = re.sub(r'\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)', link_repl, s)
    s = re.sub(r'&lt;((?:https?|mailto):[^&\s]+)&gt;',
               lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>' % (m.group(1), m.group(1)), s)

    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s, flags=re.S)
    s = re.sub(r'__(.+?)__', r'<strong>\1</strong>', s, flags=re.S)
    s = re.sub(r'(?<!\*)\*([^\s*](?:[^*\n]*[^\s*])?)\*(?!\*)', r'<em>\1</em>', s)
    s = re.sub(r'(?<![\w_])_([^_\n]+)_(?![\w_])', r'<em>\1</em>', s)
    s = re.sub(r'~~(.+?)~~', r'<del>\1</del>', s, flags=re.S)

    def restore(m):
        return '<code>%s</code>' % codes[int(m.group(1))]

    s = re.sub(r'\x00(\d+)\x00', restore, s)
    return s


HEADING_RE = re.compile(r'^(#{1,6})\s+(.*?)\s*#*\s*$')
HR_RE = re.compile(r'^\s*(-{3,}|\*{3,}|_{3,})\s*$')
FENCE_RE = re.compile(r'^\s*(```|~~~)\s*([A-Za-z0-9_+#.-]*)\s*$')
ITEM_RE = re.compile(r'^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$')
RAW_RE = re.compile(r'^\s*</?(div|iframe|figure|figcaption|video|audio|details|summary|section|'
                    r'article|table|thead|tbody|tr|td|th|p|br|hr|img|script|style|center)\b', re.I)


def md_to_html(md, prefix='', toc=None):
    lines = md.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    out = []
    i, n = 0, len(lines)

    def add_heading(level, text):
        ih = inline(text, prefix)
        hid = slugify(strip_tags(ih))
        if toc is not None and 2 <= level <= 4:
            toc.append((level, strip_tags(ih), hid))
        return '<h%d id="%s">%s</h%d>' % (level, hid, ih, level)

    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
            continue

        m = FENCE_RE.match(line)
        if m:
            fence, lang = m.group(1), m.group(2)
            buf = []
            i += 1
            while i < n and not re.match(r'^\s*%s+\s*$' % re.escape(fence[0]), lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append(code_block(buf, lang))
            continue

        if line.startswith('    ') or line.startswith('\t'):
            buf = []
            while i < n and (lines[i].startswith('    ') or lines[i].startswith('\t') or not lines[i].strip()):
                buf.append(lines[i])
                i += 1
            while buf and not buf[-1].strip():
                buf.pop()
            ded = [re.sub(r'^(    |\t)', '', b) for b in buf]
            out.append(code_block(ded, ''))
            continue

        if HR_RE.match(line):
            out.append('<hr>')
            i += 1
            continue

        m = HEADING_RE.match(line)
        if m:
            out.append(add_heading(len(m.group(1)), m.group(2)))
            i += 1
            continue

        if line.lstrip().startswith('>'):
            buf = []
            while i < n and lines[i].lstrip().startswith('>'):
                buf.append(re.sub(r'^\s*>\s?', '', lines[i]))
                i += 1
            out.append('<blockquote>\n%s\n</blockquote>' % md_to_html('\n'.join(buf), prefix))
            continue

        # 表格
        if '|' in line and i + 1 < n and '-' in lines[i + 1] and re.match(r'^\s*\|?[\s:|-]+\|[\s:|-]*$', lines[i + 1]):
            def cells(s):
                s = s.strip()
                if s.startswith('|'):
                    s = s[1:]
                if s.endswith('|') and not s.endswith('\\|'):
                    s = s[:-1]
                return [c.strip() for c in re.split(r'(?<!\\)\|', s)]

            head = cells(lines[i])
            aligns = []
            for a in cells(lines[i + 1]):
                a = a.strip()
                if a.startswith(':') and a.endswith(':'):
                    aligns.append('center')
                elif a.endswith(':'):
                    aligns.append('right')
                elif a.startswith(':'):
                    aligns.append('left')
                else:
                    aligns.append('')
            i += 2
            rows = []
            while i < n and lines[i].strip() and '|' in lines[i]:
                rows.append(cells(lines[i]))
                i += 1
            th = ''.join('<th%s>%s</th>' % (
                ' style="text-align:%s"' % a if a else '', inline(h, prefix)) for h, a in zip(head, aligns))
            tb = ''.join('<tr>%s</tr>' % ''.join(
                '<td%s>%s</td>' % (' style="text-align:%s"' % aligns[j] if j < len(aligns) and aligns[j] else '',
                                   inline(c, prefix))
                for j, c in enumerate(r)) for r in rows)
            out.append('<div class="table-wrap"><table>\n<thead><tr>%s</tr></thead>\n<tbody>%s</tbody>\n</table></div>'
                       % (th, tb))
            continue

        if ITEM_RE.match(line):
            lst, i = parse_list(lines, i, prefix)
            out.append(lst)
            continue

        if RAW_RE.match(line):
            buf = []
            while i < n and lines[i].strip():
                buf.append(lines[i])
                i += 1
            out.append('\n'.join(buf))
            continue

        buf = []
        while i < n and lines[i].strip():
            if buf and (FENCE_RE.match(lines[i]) or HEADING_RE.match(lines[i])
                        or ITEM_RE.match(lines[i]) or HR_RE.match(lines[i])
                        or lines[i].lstrip().startswith('>')):
                break
            buf.append(lines[i])
            i += 1
        if buf:
            out.append('<p>%s</p>' % inline('\n'.join(buf), prefix).replace('\n', '<br>\n'))
        else:
            i += 1

    return '\n'.join(out)


def parse_list(lines, i, prefix, indent=-1):
    n = len(lines)
    m0 = ITEM_RE.match(lines[i])
    tag = 'ol' if m0.group(2) else 'ul'
    items = []
    while i < n:
        line = lines[i]
        if not line.strip():
            if i + 1 < n and ITEM_RE.match(lines[i + 1]):
                i += 1
                continue
            break
        cur = len(line) - len(line.lstrip(' '))
        m = ITEM_RE.match(line)
        if not m:
            if items:
                items[-1] += ' ' + inline(line.strip(), prefix)
            i += 1
            continue
        is_ol = m.group(2) is not None
        if (is_ol and tag == 'ul') or (not is_ol and tag == 'ol'):
            break
        if indent < 0:
            indent = cur
        if cur > indent + 1 and items:
            sub, i = parse_list(lines, i, prefix, cur)
            items[-1] += sub
            continue
        content = m.group(3)
        i += 1
        extra = []
        while i < n and lines[i].strip() and not ITEM_RE.match(lines[i]) \
                and not HEADING_RE.match(lines[i]) and not lines[i].startswith('    '):
            extra.append(lines[i].strip())
            i += 1
        if extra:
            content += ' ' + ' '.join(extra)
        items.append(inline(content, prefix))
    body = '\n'.join('<li>%s</li>' % c for c in items)
    return '<%s>\n%s\n</%s>' % (tag, body, tag), i


# --------------------------------------------------------------------------
# 载入配置与文章
# --------------------------------------------------------------------------
def load_config():
    cfg = dict(DEFAULT_CONFIG)
    path = os.path.join(ROOT, 'config.json')
    if os.path.exists(path):
        try:
            cfg.update(json.loads(read_text(path)))
        except Exception as e:
            print('[warn] config.json 解析失败，使用默认配置:', e)
    return cfg


def build_doc(path, prefix, kind='post', default_cover=''):
    raw = read_text(path)
    meta, body = parse_front_matter(raw)
    stem = os.path.splitext(os.path.basename(path))[0]
    m = re.match(r'^(\d{4}-\d{2}-\d{2})[-_ ]?(.*)$', stem)
    if m:
        fdate, fslug = m.group(1), (m.group(2) or '').strip() or 'post'
    else:
        fdate, fslug = '', stem

    date = str(meta.get('date') or fdate or '')
    slug = str(meta.get('slug') or fslug).strip() or slugify(stem)
    title = str(meta.get('title') or '').strip() or fslug.replace('-', ' ') or stem

    cats = as_list(meta.get('categories') or meta.get('category'))
    tags = as_list(meta.get('tags') or meta.get('tag'))
    if not cats and tags:
        cats = tags

    # 正文里的图片/链接按本页的前缀渲染成相对路径
    toc = []
    content = md_to_html(body, prefix, toc)

    # 封面：优先 front matter 的 cover，没有就自动取正文第一张图（像 WP 特色图像那样）
    # 统一存成"站点绝对路径"（以 / 开头），渲染时再按页面层级转相对路径
    cover = str(meta.get('cover') or '').strip()
    if not cover:
        m = re.search(r'<img[^>]+src="([^"]+)"', content)
        cover = m.group(1) if m else (default_cover or '')
    if cover and not cover.startswith(('http://', 'https://', '//', 'data:')):
        cover = '/' + (cover[1:] if cover.startswith('/') else cover)

    summary = str(meta.get('summary') or meta.get('description') or '').strip()
    if not summary:
        plain = ' '.join(strip_tags(content).split())
        ln = 140
        summary = plain[:ln] + ('…' if len(plain) > ln else '')

    dt = parse_date(date)
    url = ('/posts/' if kind == 'post' else '/') + quote(slug) + '.html'

    return {
        'kind': kind,
        'title': title,
        'slug': slug,
        'url': url,
        'date': dt.strftime('%Y-%m-%d') if date else '',
        'datetime': dt.strftime('%Y-%m-%dT%H:%M:%S'),
        'dt': dt,
        'categories': cats,
        'tags': tags,
        'content': content,
        'summary': summary,
        'toc': toc,
        'cover': cover,
        'draft': str(meta.get('draft', '')).lower() in ('true', '1', 'yes'),
        'source': os.path.basename(path),
    }


def collect(default_cover=''):
    posts = []
    if os.path.isdir(POSTS_DIR):
        for fn in sorted(os.listdir(POSTS_DIR)):
            if not fn.lower().endswith(('.md', '.markdown')):
                continue
            if fn.startswith(('.', '_')):
                continue
            # 文章页在 posts/ 下，正文里的相对链接要退一级
            doc = build_doc(os.path.join(POSTS_DIR, fn), '../', 'post', default_cover)
            if doc['draft']:
                print('  skip draft:', fn)
                continue
            posts.append(doc)
    posts.sort(key=lambda p: (p['dt'], p['slug']), reverse=True)

    pages = []
    if os.path.isdir(PAGES_DIR):
        for fn in sorted(os.listdir(PAGES_DIR)):
            if not fn.lower().endswith(('.md', '.markdown')) or fn.startswith(('.', '_')):
                continue
            # 独立页面生成在根目录
            pages.append(build_doc(os.path.join(PAGES_DIR, fn), '', 'page', default_cover))
    return posts, pages


# --------------------------------------------------------------------------
# 页面模板（Kratos 皮肤）
# --------------------------------------------------------------------------
ICON_PATHS = {
    'calendar': '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9.5h18"/>',
    'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'folder': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    'tag': '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/>'
           '<circle cx="7" cy="7" r="1.2"/>',
    'arrow-right': '<path d="M5 12h13M12 6l6 6-6 6"/>',
    'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'menu': '<path d="M3 6h18M3 12h18M3 18h18"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    'home': '<path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.5 22V13h5v9"/>',
    'archive': '<rect x="2" y="4" width="20" height="5" rx="1"/>'
               '<path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13.5h4"/>',
    'rss': '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.4"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/>',
    'github': '<path d="M9 19c-4.3 1.3-4.3-2.2-6-2.6m12 5v-3.5a3 3 0 0 0-.9-2.4c3-.3 6.1-1.5'
              ' 6.1-6.7A5.2 5.2 0 0 0 18.8 5a4.9 4.9 0 0 0-.1-3.6s-1.2-.4-3.9 1.5a13.3 13.3 0 0 0-7 0'
              'C5.1 1 3.9 1.4 3.9 1.4A4.9 4.9 0 0 0 3.8 5a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.1 6.4 6.1 6.7'
              'A3 3 0 0 0 7.6 17.7V21"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-3.9-3.9"/>',
    'comment': '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-5'
               'a8.4 8.4 0 0 1-.9-3.8 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z"/>',
    'swap': '<path d="M16 3l4 4-4 4M20 7H8a4 4 0 0 0-4 4v1"/>'
            '<path d="M8 21l-4-4 4-4M4 17h12a4 4 0 0 0 4-4v-1"/>',
    'shirt': '<path d="M16 3l4 2-2 4-1-.6V21H7V8.4L6 9 4 5l4-2 4 2 4-2z"/>',
    'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4'
              'a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    'close': '<path d="M18 6L6 18M6 6l12 12"/>',
    'venus': '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>',
    'rune': '<path d="M12 3l8 9-8 9-8-9z"/><path d="M4 12h16"/>',
    'game': '<rect x="2" y="7" width="20" height="10" rx="5"/>'
            '<path d="M7.5 10v4M5.5 12h4"/><circle cx="16" cy="11" r="1"/>'
            '<circle cx="18" cy="13" r="1"/>',
}


def icon(name):
    return ('<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">%s</svg>'
            % ICON_PATHS.get(name, ICON_PATHS['info']))


def cat_links(cats, prefix):
    """分类色标（Kratos 的「原创」小标签样式）"""
    if not cats:
        return ''
    out = []
    for c in cats:
        out.append('<a class="badge" href="%s">%s</a>'
                   % (href(prefix, '/categories/%s.html' % quote(c)), esc_text(c)))
    return ''.join(out)


def nav_html(cfg, prefix, active=''):
    out = []
    for item in cfg.get('nav') or []:
        u = href(prefix, str(item.get('url', '')))
        t = esc_text(str(item.get('text', '')))
        ico = icon(str(item['icon'])) if item.get('icon') else ''
        cls = ' class="active"' if active and str(item.get('url', '')).rstrip('/').endswith(active) else ''
        # 站外链接、或者配置里写了 "blank": true 的（比如小游戏），新标签页打开
        ext = ''
        if u.startswith('http') or item.get('blank'):
            ext = ' target="_blank" rel="noopener"'
        out.append('<a href="%s"%s%s>%s%s</a>' % (esc_attr(u), cls, ext, ico, t))
    return '\n'.join(out)


def layout(cfg, title, body, desc='', body_class='', head_extra='', active='',
           banner_title='', banner_sub='', crumb='', main='', sidebar='', prefix=''):
    full_title = cfg['title'] if not title else '%s - %s' % (title, cfg['title'])
    banner_cfg = cfg.get('banner') or {}
    banner_img = banner_cfg.get('image') or ''
    effects = cfg.get('effects') or {}

    h = []
    h.append('<!DOCTYPE html>\n<html lang="%s">\n<head>' % esc_attr(cfg.get('lang', 'zh-CN')))
    h.append('<meta charset="utf-8">')
    h.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    h.append('<title>%s</title>' % esc_text(full_title))
    h.append('<meta name="description" content="%s">' % esc_attr(desc or cfg.get('description', '')))
    h.append('<meta name="author" content="%s">' % esc_attr(cfg.get('author', '')))
    h.append('<meta property="og:title" content="%s">' % esc_attr(title or cfg['title']))
    h.append('<meta property="og:description" content="%s">' % esc_attr(desc or cfg.get('description', '')))
    h.append('<meta property="og:type" content="%s">' % ('article' if body_class == 'post' else 'website'))
    h.append('<link rel="stylesheet" href="%s">' % href(prefix, '/assets/style.css'))
    h.append('<link rel="alternate" type="application/rss+xml" title="%s" href="%s">'
             % (esc_attr(cfg['title']), href(prefix, '/feed.xml')))
    h.append('<link rel="icon" href="%s">' % href(prefix, '/assets/photo.jpg'))
    if head_extra:
        h.append(head_extra)
    h.append('</head>')
    h.append('<body class="%s">' % esc_attr(body_class))
    h.append('<a class="skip" href="#main">跳到正文</a>')

    # 导航条
    h.append('<header class="topbar"><div class="container topbar-inner">')
    h.append('<a class="brand" href="%s">%s</a>'
             % (href(prefix, '/'), esc_text(cfg.get('brand') or cfg['title'])))
    h.append('<button class="menu-toggle" aria-label="菜单">%s</button>' % icon('menu'))
    h.append('<nav class="menu">%s</nav>' % nav_html(cfg, prefix, active))
    h.append('</div></header>')

    # Banner
    if banner_img or banner_title:
        cls = 'banner' if not crumb and body_class == 'home' else 'banner banner-inner'
        style = ' style="background-image:url(\'%s\')"' % esc_attr(href(prefix, banner_img)) if banner_img else ''
        h.append('<section class="%s"%s><div class="banner-mask"></div><div class="banner-text">' % (cls, style))
        h.append('<h1 class="banner-title">%s</h1>' % esc_text(banner_title))
        if banner_sub:
            h.append('<p class="banner-sub">%s</p>' % esc_text(banner_sub))
        if crumb:
            h.append('<p class="banner-crumb">%s</p>' % crumb)
        h.append('</div></section>')

    # 主体
    h.append('<div class="page-body"><div class="container layout">')
    h.append('<div class="main-col" id="main">%s</div>' % main)
    if sidebar:
        h.append('<aside class="sidebar">%s</aside>' % sidebar)
    h.append('</div></div>')

    # 页脚
    footer_cfg = cfg.get('footer_html') or ''
    h.append('<footer class="site-footer"><div class="container">')
    socials = cfg.get('social') or []
    if socials:
        links = []
        for s in socials:
            u = href(prefix, str(s.get('url', '')))
            links.append('<a href="%s" title="%s" target="_blank" rel="noopener">%s%s</a>'
                         % (esc_attr(u), esc_attr(str(s.get('text', ''))),
                            icon(str(s.get('icon', 'rss'))), ''))
        h.append('<div class="social">%s</div>' % ''.join(links))
    if footer_cfg:
        h.append(footer_cfg)
    else:
        h.append('<p>&copy; %d <a href="%s">%s</a>. All Rights Reserved.</p>'
                 % (datetime.date.today().year, href(prefix, '/'),
                    esc_text(cfg.get('author') or cfg['title'])))
    h.append('<p>Powered by myblog &middot; 静态自建</p>')
    h.append('</div></footer>')

    h.append('<a class="gotop" id="gotop" href="#" aria-label="返回顶部">%s</a>' % icon('arrow-up'))

    # 看板娘（Live2D）
    if effects.get('waifu'):
        tool = [('fa-home', 'home', '回到首页'),
                ('fa-comments', 'comment', '来一句话'),
                ('fa-drivers-license-o', 'swap', '换一个人物'),
                ('fa-street-view', 'shirt', '换一套衣服'),
                ('fa-camera', 'camera', '截图保存'),
                ('fa-info-circle', 'info', '关于本站'),
                ('fa-close', 'close', '把她藏起来')]
        spans = ''.join('<span class="fa %s" title="%s">%s</span>' % (c, t, icon(i))
                        for c, i, t in tool)
        h.append('<div class="waifu">')
        h.append('<div class="waifu-tips"></div>')
        h.append('<canvas id="live2d" width="220" height="250" class="live2d"></canvas>')
        h.append('<div class="waifu-tool">%s</div>' % spans)
        h.append('</div>')
        h.append('<div class="waifu-btn" title="看板娘">%s</div>' % icon('venus'))
        h.append('<script>window.__WAIFU__={base:"%s",person:"%s"};</script>'
                 % (esc_attr(prefix), esc_attr(str(effects.get('waifu_person') or '33'))))
        for f in ('jquery.min.js', 'live2d.js', 'waifu.js'):
            h.append('<script src="%s"></script>' % href(prefix, '/assets/js/' + f))

    if effects.get('snow'):
        h.append('<canvas id="snow-canvas"></canvas>')
    h.append('<script src="%s"></script>' % href(prefix, '/assets/app.js'))
    h.append('</body>\n</html>\n')
    return '\n'.join(h)


def build_sidebar(cfg, posts, cats, prefix, exclude=None, active_cat=''):
    sc = cfg.get('sidebar') or {}
    parts = []

    # 个人卡
    avatar = sc.get('avatar') or ''
    parts.append('<div class="widget widget-about">')
    if avatar:
        parts.append('<div class="avatar"><img src="%s" alt="%s"></div>'
                     % (esc_attr(href(prefix, avatar)), esc_attr(sc.get('name', ''))))
    parts.append('<div class="about-name">%s</div>' % esc_text(sc.get('name') or cfg.get('author', '')))
    if sc.get('bio'):
        parts.append('<div class="about-bio">%s</div>' % esc_text(sc['bio']))
    links = sc.get('links') or []
    if links:
        parts.append('<div class="about-links">%s</div>' % ''.join(
            '<a href="%s"%s>%s</a>' % (esc_attr(href(prefix, str(l.get('url', '')))),
                                       ' target="_blank" rel="noopener"'
                                       if str(l.get('url', '')).startswith('http') else '',
                                       esc_text(str(l.get('text', ''))))
            for l in links))
    parts.append('</div>')

    # 最近文章
    recent = [p for p in posts if p is not exclude][:int(sc.get('recent_count', 8))]
    if recent:
        rows = ''.join('<li><span class="dot"></span><a href="%s">%s</a></li>'
                       % (esc_attr(href(prefix, p['url'])), esc_text(p['title'])) for p in recent)
        parts.append('<div class="widget"><h3 class="widget-title">最近文章</h3>'
                     '<ul class="widget-list">%s</ul></div>' % rows)

    # 分类
    if cats and sc.get('show_categories', True):
        items = sorted(cats.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        rows = ''.join('<li><a href="%s"%s>%s</a><span class="num">%d</span></li>'
                       % (href(prefix, '/categories/%s.html' % quote(name)),
                          ' class="on"' if name == active_cat else '',
                          esc_text(name), len(ps)) for name, ps in items)
        parts.append('<div class="widget"><h3 class="widget-title">分类</h3>'
                     '<ul class="widget-list">%s</ul></div>' % rows)

    # 标签
    tags = {}
    for p in posts:
        for t in p['tags']:
            tags[t] = tags.get(t, 0) + 1
    if tags and sc.get('show_tags', True):
        cloud = ''.join('<a href="%s">%s</a>'
                        % (href(prefix, '/tags/%s.html' % quote(t)), esc_text(t))
                        for t, _ in sorted(tags.items(), key=lambda kv: -kv[1]))
        parts.append('<div class="widget"><h3 class="widget-title">标签</h3>'
                     '<div class="tagcloud">%s</div></div>' % cloud)

    return '\n'.join(parts)


def post_card(p, prefix):
    thumb = ''
    if p['cover']:
        thumb = '<a class="card-thumb" href="%s"><img src="%s" alt="%s" loading="lazy"></a>' % (
            esc_attr(href(prefix, p['url'])), esc_attr(href(prefix, p['cover'])), esc_attr(p['title']))
    cls = 'post-card' if p['cover'] else 'post-card no-thumb'
    meta = ['<span class="m-item">%s<time datetime="%s">%s</time></span>'
            % (icon('calendar'), esc_attr(p['datetime']), esc_text(p['date']))]
    for c in p['categories']:
        meta.append('<span class="m-item">%s<a href="%s">%s</a></span>'
                    % (icon('folder'), href(prefix, '/categories/%s.html' % quote(c)), esc_text(c)))
    meta.append('<a class="m-more" href="%s">阅读全文 %s</a>'
                % (esc_attr(href(prefix, p['url'])), icon('arrow-right')))
    return (
        '<article class="%s">\n%s'
        '<div class="card-body"><h2 class="card-title">%s<a href="%s">%s</a></h2>\n'
        '<p class="card-excerpt">%s</p></div>\n'
        '<div class="card-meta">%s</div>\n'
        '</article>\n'
    ) % (cls, thumb, cat_links(p['categories'], prefix), esc_attr(href(prefix, p['url'])),
         esc_text(p['title']),
         esc_text(p['summary']), '\n'.join(meta))


def render_index(cfg, posts, cats, sidebar, prefix=''):
    if not posts:
        body = ('<div class="empty"><h1>还没有文章</h1>'
                '<p>往 <code>posts/</code> 里放一个 .md，再跑一次 <code>python build.py</code>。</p></div>')
    else:
        body = '\n'.join(post_card(p, prefix) for p in posts)
    b = cfg.get('banner') or {}
    return layout(cfg, '', body, '', 'home', active='/', main=body, sidebar=sidebar, prefix=prefix,
                  banner_title=b.get('title') or cfg['title'],
                  banner_sub=b.get('subtitle') or cfg.get('description', ''))


def render_post(cfg, p, prev_p, next_p, sidebar, prefix='../'):
    toc = ''
    if len(p['toc']) >= 2:
        lis = []
        for lv, text, hid in p['toc']:
            lis.append('<li class="toc-%d"><a href="#%s">%s</a></li>' % (lv, hid, esc_text(text)))
        toc = '<nav class="toc"><div class="toc-title">目录</div><ul>%s</ul></nav>' % '\n'.join(lis)

    meta = ['<span class="m-item">%s<time datetime="%s">%s</time></span>'
            % (icon('calendar'), esc_attr(p['datetime']), esc_text(p['date']))]
    meta.append('<span class="m-item">%s<a href="%s">%s</a></span>'
                % (icon('user'), href(prefix, '/'), esc_text(cfg.get('author') or cfg['title'])))
    for c in p['categories']:
        meta.append('<span class="m-item">%s<a href="%s">%s</a></span>'
                    % (icon('folder'), href(prefix, '/categories/%s.html' % quote(c)), esc_text(c)))

    nav = []
    if prev_p:
        nav.append('<a class="pn prev" href="%s">%s %s</a>'
                   % (esc_attr(href(prefix, prev_p['url'])), icon('arrow-right'),
                      esc_text(prev_p['title'])))
    else:
        nav.append('<span class="pn prev disabled">已经没有上一篇了</span>')
    if next_p:
        nav.append('<a class="pn next" href="%s">%s %s</a>'
                   % (esc_attr(href(prefix, next_p['url'])), esc_text(next_p['title']),
                      icon('arrow-right')))
    else:
        nav.append('<span class="pn next disabled">已经是最后一篇了</span>')

    body = ('<article class="post-single">\n<header class="post-head">\n'
            '<h1 class="post-title">%s</h1>\n<div class="post-meta">%s</div>\n</header>\n'
            '%s\n<div class="post-content">\n%s\n</div>\n<nav class="pager">%s</nav>\n</article>') % (
        esc_text(p['title']), '\n'.join(meta), toc, p['content'], ''.join(nav))

    head = ''
    if p['cover']:
        head = '<meta property="og:image" content="%s">' % esc_attr(
            site_root(cfg) + p['cover'])
    crumb = '<a href="%s">首页</a> / <a href="%s">归档</a>' % (
        href(prefix, '/'), href(prefix, '/archive.html'))
    if p['categories']:
        crumb += ' / <a href="%s">%s</a>' % (
            href(prefix, '/categories/%s.html' % quote(p['categories'][0])),
            esc_text(p['categories'][0]))
    return layout(cfg, p['title'], body, p['summary'], 'post', head, active='',
                  banner_title=p['title'], banner_sub='', crumb=crumb,
                  main=body, sidebar=sidebar, prefix=prefix)


def render_archive(cfg, posts, sidebar, prefix=''):
    groups = {}
    for p in posts:
        groups.setdefault(p['dt'].year, []).append(p)
    parts = ['<div class="archive-box">',
             '<h1 class="page-title">归档</h1>',
             '<p class="page-sub">共 %d 篇文章</p>' % len(posts)]
    for year in sorted(groups.keys(), reverse=True):
        parts.append('<h2 class="year">%s</h2>' % year)
        rows = []
        for p in groups[year]:
            rows.append('<li><time datetime="%s">%s</time> <a href="%s">%s</a></li>' % (
                esc_attr(p['datetime']), esc_text(p['date'][5:] or p['date']),
                esc_attr(href(prefix, p['url'])), esc_text(p['title'])))
        parts.append('<ul class="archive-list">%s</ul>' % '\n'.join(rows))
    parts.append('</div>')
    body = '\n'.join(parts)
    return layout(cfg, '归档', body, '文章归档', 'archive', active='/archive.html',
                  banner_title='归档', banner_sub='共 %d 篇文章' % len(posts),
                  main=body, sidebar=sidebar, prefix=prefix)


def render_category(cfg, name, posts, sidebar, all_posts, cats, prefix='../'):
    rows = '\n'.join(post_card(p, prefix) for p in posts)
    body = ('<div class="archive-box"><h1 class="page-title">分类：%s</h1>'
            '<p class="page-sub">共 %d 篇</p></div>\n%s') % (esc_text(name), len(posts), rows)
    sb = build_sidebar(cfg, all_posts, cats, prefix, active_cat=name)
    return layout(cfg, '分类：' + name, body, '分类归档：' + name, 'archive',
                  banner_title='分类：' + name, banner_sub='共 %d 篇文章' % len(posts),
                  main=body, sidebar=sb, prefix=prefix)


def render_categories_index(cfg, cats, posts, sidebar, prefix=''):
    items = []
    for name, ps in sorted(cats.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        items.append('<li><a href="%s">%s</a> <span class="count">%d</span></li>' % (
            href(prefix, '/categories/%s.html' % quote(name)), esc_text(name), len(ps)))
    body = ('<div class="archive-box"><h1 class="page-title">全部分类</h1>'
            '<p class="page-sub">共 %d 个分类</p>'
            '<ul class="cat-list">%s</ul></div>') % (len(cats), '\n'.join(items))
    return layout(cfg, '分类', body, '全部分类', 'archive', active='/categories.html',
                  banner_title='全部分类', banner_sub='共 %d 个分类' % len(cats),
                  main=body, sidebar=sidebar, prefix=prefix)


def render_tag(cfg, name, posts, all_posts, cats, sidebar, prefix='../'):
    rows = '\n'.join(post_card(p, prefix) for p in posts)
    body = ('<div class="archive-box"><h1 class="page-title">标签：%s</h1>'
            '<p class="page-sub">共 %d 篇</p></div>\n%s') % (esc_text(name), len(posts), rows)
    return layout(cfg, '标签：' + name, body, '标签：' + name, 'archive',
                  banner_title='标签：' + name, banner_sub='共 %d 篇文章' % len(posts),
                  main=body, sidebar=sidebar, prefix=prefix)


def render_rss_page(cfg, posts, sidebar, prefix=''):
    """
    订阅页。

    浏览器打开 feed.xml 只会看到一堆标签 —— 那是给阅读器吃的格式。
    与其让访客以为网站坏了，不如给一个正经页面：解释 RSS、给出订阅地址、
    列出最近更新。裸 XML 仍然保留，给阅读器和老手用。
    """
    feed = site_root(cfg) + '/feed.xml'
    q = quote(feed, safe='')

    rows = []
    for p in posts[:12]:
        rows.append(
            '<li><time datetime="%s">%s</time><a href="%s">%s</a></li>'
            % (esc_attr(p['datetime']), esc_text(p['date']),
               esc_attr(href(prefix, p['url'])), esc_text(p['title'])))

    body = RSS_BODY % {
        'icon': icon('rss'),
        'feed': esc_attr(feed),
        'q': q,
        'rows': ''.join(rows),
        'count': int(cfg.get('feed_count', 20)),
    }

    return layout(cfg, '订阅', body, 'RSS 订阅：把新文章推送到你的阅读器', 'page',
                  active='/rss.html', banner_title='RSS 订阅',
                  banner_sub='订阅后，新文章自动送到你的阅读器',
                  main=body, sidebar=sidebar, prefix=prefix)


RSS_BODY = """
<div class="rss-box">
  <div class="rss-head">
    <span class="rss-mark">%(icon)s</span>
    <div>
      <h1 class="page-title">RSS 订阅</h1>
      <p class="page-sub">把新文章推到你自己的阅读器里，不用一个个网站去翻</p>
    </div>
  </div>

  <p class="rss-lead">
    如果你在浏览器里点开 <code>feed.xml</code> 看到一堆尖括号 —— 那是正常的。
    它是给 <strong>RSS 阅读器</strong>读的机器格式，本来就不是给人看的网页。
    想订阅，用下面的地址。
  </p>

  <div class="rss-sub">
    <div class="rss-label">订阅地址</div>
    <div class="rss-row">
      <input id="feedUrl" readonly value="%(feed)s" onclick="this.select()">
      <button id="copyBtn" class="rss-btn">复制</button>
    </div>
    <div class="rss-readers">
      <a class="rss-chip" href="https://feedly.com/i/subscription/feed/%(q)s" target="_blank" rel="noopener">Feedly</a>
      <a class="rss-chip" href="https://www.inoreader.com/?add_feed=%(q)s" target="_blank" rel="noopener">Inoreader</a>
      <a class="rss-chip" href="%(feed)s" target="_blank" rel="noopener">查看原始 XML</a>
    </div>
  </div>

  <h2 class="rss-h2">最近更新</h2>
  <ul class="rss-list">%(rows)s</ul>

  <p class="rss-foot">
    共收录 %(count)d 篇 · 这个地址长期有效，加进阅读器后每篇新文章都会自动出现
  </p>
</div>

<script>
(function () {
  var btn = document.getElementById('copyBtn');
  var box = document.getElementById('feedUrl');
  if (!btn || !box) return;
  btn.onclick = function () {
    box.select();
    box.setSelectionRange(0, 99999);
    var done = function () {
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(box.value).then(done, done);
    } else {
      try { document.execCommand('copy'); done(); } catch (e) {}
    }
  };
})();
</script>
"""


def render_arcade_page(cfg, sidebar, prefix=''):
    """
    游戏厅：把接进来的第三方小游戏列成卡片。

    这些游戏都是 MIT 协议、零依赖的单文件 HTML，直接放在 static/arcade/ 下。
    这里只负责目录展示，不做任何包装/嵌入。
    """
    items = cfg.get('arcade') or []
    cards = []
    for g in items:
        cards.append(
            '<a class="arc-card" href="%s" target="_blank" rel="noopener">'
            '<div class="arc-genre">%s</div>'
            '<h3 class="arc-title">%s<span>%s</span></h3>'
            '<p class="arc-desc">%s</p>'
            '<div class="arc-play">开玩 &rarr;</div>'
            '</a>' % (
                esc_attr(href(prefix, '/arcade/' + str(g['slug']) + '.html')),
                esc_text(str(g.get('genre', ''))),
                esc_text(str(g.get('title', ''))),
                esc_text(str(g.get('sub', ''))),
                esc_text(str(g.get('desc', '')))
            ))

    body = ARCADE_BODY % {
        'cards': ''.join(cards),
        'count': len(items),
        'source': esc_attr(cfg.get('arcade_source', '')),
    }

    return layout(cfg, '游戏厅', body, '几款能随手玩两分钟的开源小游戏', 'page',
                  active='/arcade.html', banner_title='游戏厅',
                  banner_sub='随手玩两分钟，不用注册、不用装东西',
                  main=body, sidebar=sidebar, prefix=prefix)


ARCADE_BODY = """
<div class="arc-box">
  <p class="arc-lead">
    一共 %(count)d 款。全部是<b>单文件 HTML</b>、零依赖、打开就能玩，
    存档走浏览器本地存储，不上传任何数据。
  </p>

  <div class="arc-grid">%(cards)s</div>

  <p class="arc-foot">
    这些游戏来自开源仓库
    <a href="%(source)s" target="_blank" rel="noopener">mini-browser-games</a>，
    MIT 协议，原作者 wangzifan396-wzf。仓库里还有一百多款，喜欢可以去翻。
  </p>
</div>
"""

def site_root(cfg):
    """站点根地址（带协议，不带结尾斜杠）—— 只给 RSS / sitemap / og:image 这种
    必须用绝对地址的地方用。站内链接一律走 href() 生成相对路径。"""
    return (cfg.get('url') or '').rstrip('/')


def render_feed(cfg, posts):
    root = site_root(cfg)

    def x(s):
        return esc_text(s or '')

    items = []
    for p in posts[:int(cfg.get('feed_count', 20))]:
        link = root + p['url']
        items.append(
            '<item>\n<title>%s</title>\n<link>%s</link>\n<guid>%s</guid>\n'
            '<pubDate>%s</pubDate>\n<description><![CDATA[%s]]></description>\n</item>' % (
                x(p['title']), x(link), x(link),
                p['dt'].strftime('%a, %d %b %Y %H:%M:%S +0000'),
                p['summary']))

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>\n'
        '<title>%s</title>\n<link>%s</link>\n<description>%s</description>\n'
        '<language>%s</language>\n<lastBuildDate>%s</lastBuildDate>\n%s\n</channel></rss>\n'
    ) % (x(cfg['title']), x(root + '/'), x(cfg.get('description', '')), x(cfg.get('lang', 'zh-CN')),
         datetime.datetime.now(datetime.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000'),
         '\n'.join(items))


def render_sitemap(cfg, posts, pages, cats, tags=None):
    root = site_root(cfg)
    urls = [(root + '/', '1.0'), (root + '/archive.html', '0.5')]
    for p in posts:
        urls.append((root + p['url'], '0.8'))
    for p in pages:
        urls.append((root + p['url'], '0.6'))
    for name in cats:
        urls.append((root + '/categories/' + quote(name) + '.html', '0.4'))
    for name in (tags or {}):
        urls.append((root + '/tags/' + quote(name) + '.html', '0.3'))
    body = '\n'.join('<url><loc>%s</loc><priority>%s</priority></url>' % (esc_text(u), pr) for u, pr in urls)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s\n</urlset>\n' % body


def render_404(cfg):
    body = ('<div class="empty"><h1>404</h1><p>页面不存在。</p>'
            '<p><a href="%s">回首页</a></p></div>' % href('', '/'))
    return layout(cfg, '404', body, '', 'error', banner_title='404', banner_sub='页面不存在',
                  main=body, prefix='')


# --------------------------------------------------------------------------
# 构建
# --------------------------------------------------------------------------
def set_out(path):
    """覆盖输出目录（默认 dist/）。"""
    global DIST_DIR
    DIST_DIR = path if os.path.isabs(path) else os.path.join(ROOT, path)


def manifest_path():
    name = os.path.basename(os.path.normpath(DIST_DIR)) or 'out'
    return os.path.join(ROOT, '.build-cache', name + '.json')


def sync_tree(src, dst, prefix):
    """把 src 增量同步到 dst（内容没变就跳过），返回写入的相对路径集合。"""
    written = set()
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = [d for d in dirnames if d not in ('__pycache__', '.git')]
        rel_dir = os.path.relpath(dirpath, src)
        target_dir = dst if rel_dir == '.' else os.path.join(dst, rel_dir)
        os.makedirs(target_dir, exist_ok=True)
        for fn in filenames:
            s = os.path.join(dirpath, fn)
            d = os.path.join(target_dir, fn)
            same = (os.path.exists(d) and os.path.getsize(d) == os.path.getsize(s)
                    and os.path.getmtime(d) >= os.path.getmtime(s))
            if not same:
                shutil.copy2(s, d)
            rel = fn if rel_dir == '.' else os.path.join(rel_dir, fn)
            rel = rel.replace('\\', '/')
            # prefix 为空时不能拼成 '/xxx'：带前导斜杠的路径在 Windows 上会被
            # os.path.join 当成绝对路径，prune() 就永远找不到那个文件，
            # 结果就是产物目录里的过期文件一直删不掉。
            written.add((prefix + '/' + rel) if prefix else rel)
    return written


def copy_assets():
    written = set()
    if os.path.isdir(ASSETS_DIR):
        written |= sync_tree(ASSETS_DIR, os.path.join(DIST_DIR, 'assets'), 'assets')
    if os.path.isdir(IMAGES_DIR):
        written |= sync_tree(IMAGES_DIR, os.path.join(DIST_DIR, 'images'), 'images')
    if os.path.isdir(STATIC_DIR):
        written |= sync_tree(STATIC_DIR, DIST_DIR, '')
    return written


def prune(out, current):
    """删掉上次构建生成的、这次不再生成的文件（正常情况下是 0 个）。"""
    mp = manifest_path()
    old = []
    if os.path.exists(mp):
        try:
            old = json.loads(read_text(mp))
        except Exception:
            old = []
    def norm(r):
        return r.lstrip('/').replace('\\', '/')

    current = set(norm(r) for r in current)
    removed = []
    for rel in old:
        if norm(rel) not in current:
            f = os.path.join(out, norm(rel).replace('/', os.sep))
            if os.path.isfile(f):
                try:
                    os.remove(f)
                    removed.append(rel)
                except OSError:
                    pass
    # 兜底：清单本身可能被上一次构建覆盖过，更早的产物会变成"孤儿"文件
    # （不在任何清单里，永远删不掉）。这里直接扫一遍产物目录，凡是不在本次
    # 清单里的文件一律清掉。
    for dirpath, dirnames, filenames in os.walk(out, topdown=False):
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, out).replace('\\', '/')
            if rel not in current:
                try:
                    os.remove(full)
                    removed.append(rel)
                except OSError:
                    pass
        if dirpath != out and not os.listdir(dirpath):
            try:
                os.rmdir(dirpath)
            except OSError:
                pass
    os.makedirs(os.path.dirname(mp), exist_ok=True)
    write_text(mp, json.dumps(sorted(current), ensure_ascii=False))
    return removed


def build():
    cfg = load_config()
    print('[1/5] 读取文章 ...')
    posts, pages = collect(str(cfg.get('default_cover') or ''))
    print('      文章 %d 篇 / 独立页面 %d 个' % (len(posts), len(pages)))

    cats, tags = {}, {}
    for p in posts:
        for c in p['categories']:
            cats.setdefault(c, []).append(p)
        for t in p['tags']:
            tags.setdefault(t, []).append(p)
    # 侧边栏里的链接也是相对路径，所以根目录页面和子目录页面要各生成一份
    sidebar = build_sidebar(cfg, posts, cats, '')            # 给根目录页面用
    sidebar_sub = build_sidebar(cfg, posts, cats, '../')     # 给 tags/ 之类的子目录页面用

    out_name = os.path.relpath(DIST_DIR, ROOT)
    print('[2/5] 准备输出目录 %s ...' % out_name)
    os.makedirs(DIST_DIR, exist_ok=True)
    os.makedirs(os.path.join(DIST_DIR, 'posts'), exist_ok=True)

    written = set()

    def emit(relpath, content):
        write_text(os.path.join(DIST_DIR, relpath.replace('/', os.sep)), content)
        written.add(relpath)

    print('[3/5] 生成页面 ...')
    emit('index.html', render_index(cfg, posts, cats, sidebar))
    emit('archive.html', render_archive(cfg, posts, sidebar))
    emit('rss.html', render_rss_page(cfg, posts, sidebar))
    emit('arcade.html', render_arcade_page(cfg, sidebar))
    emit('404.html', render_404(cfg))

    for i, p in enumerate(posts):
        prev_p = posts[i - 1] if i > 0 else None
        next_p = posts[i + 1] if i + 1 < len(posts) else None
        emit('posts/%s.html' % p['slug'],
             render_post(cfg, p, prev_p, next_p,
                         build_sidebar(cfg, posts, cats, '../', exclude=p)))

    for p in pages:
        body = ('<article class="post-single"><header class="post-head">'
                '<h1 class="post-title">%s</h1></header>\n'
                '<div class="post-content">%s</div></article>' % (esc_text(p['title']), p['content']))
        emit('%s.html' % p['slug'],
             layout(cfg, p['title'], body, p['summary'], 'page',
                    banner_title=p['title'], banner_sub='',
                    crumb='<a href="%s">首页</a>' % href('', '/'),
                    main=body, sidebar=sidebar, prefix=''))

    for name, ps in cats.items():
        emit('categories/%s.html' % name, render_category(cfg, name, ps, sidebar, posts, cats))
    emit('categories.html', render_categories_index(cfg, cats, posts, sidebar))

    for name, ps in tags.items():
        emit('tags/%s.html' % name, render_tag(cfg, name, ps, posts, cats, sidebar_sub))

    emit('feed.xml', render_feed(cfg, posts))
    emit('sitemap.xml', render_sitemap(cfg, posts, pages, cats, tags))
    emit('robots.txt', 'User-agent: *\nAllow: /\nSitemap: %s/sitemap.xml\n' % site_root(cfg))
    emit('.nojekyll', '')

    print('[4/5] 同步静态资源 ...')
    written |= copy_assets()

    removed = prune(DIST_DIR, written)
    if removed:
        print('      清理过期文件 %d 个' % len(removed))

    print('[5/5] 完成 -> %s' % DIST_DIR)
    print('      文章 %d 篇 / 页面 %d 个 / 分类 %d 个' % (len(posts), len(pages), len(cats)))
    if not cfg.get('url'):
        print('      提示：config.json 里的 "url" 还没填，RSS 和 sitemap 里的链接会是不完整的地址。')
    return cfg


def new_post(title):
    os.makedirs(POSTS_DIR, exist_ok=True)
    now = datetime.datetime.now()
    slug = slugify(title) or 'post'
    fn = '%s-%s.md' % (now.strftime('%Y-%m-%d'), slug)
    path = os.path.join(POSTS_DIR, fn)
    if os.path.exists(path):
        fn = '%s-%s-%s.md' % (now.strftime('%Y-%m-%d'), slug, now.strftime('%H%M%S'))
        path = os.path.join(POSTS_DIR, fn)
    write_text(path,
               '---\ntitle: "%s"\ndate: %s\ncategories: [随笔]\nslug: %s\nsummary: ""\n---\n\n'
               '在这里写正文。支持 Markdown：\n\n'
               '## 小标题\n\n普通段落，**加粗**，`行内代码`。\n\n'
               '- 列表项一\n- 列表项二\n\n'
               '```python\nprint("hello")\n```\n\n'
               '![图片说明](/images/example.png)\n' % (
                   title.replace('"', '\\"'), now.strftime('%Y-%m-%d %H:%M'), slug))
    print('已创建: posts/%s' % fn)
    return path


def serve(port=8000):
    build()
    os.chdir(DIST_DIR)

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass        # 静音，别把窗口刷满

        def end_headers(self):
            # 预览时禁用缓存，改完刷新就能看到新的
            self.send_header('Cache-Control', 'no-store')
            SimpleHTTPRequestHandler.end_headers(self)

    server = None
    start = port
    for p in range(start, start + 20):          # 端口被占用就顺延
        try:
            server = ThreadingHTTPServer(('127.0.0.1', p), Handler)
            port = p
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit('端口 %d ~ %d 都被占用了，换一个：--port 9000' % (start, start + 19))

    url = 'http://127.0.0.1:%d/' % port
    print()
    print('  +------------------------------------------------+')
    print('  |  本地预览已启动                                |')
    print('  |                                                |')
    print('  |    %s' % url.ljust(44) + '|')
    print('  |                                                |')
    print('  |  浏览器已自动打开。关掉这个窗口即停止。        |')
    print('  +------------------------------------------------+')
    print()
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  已停止。')
    finally:
        server.server_close()


def main():
    ap = argparse.ArgumentParser(description='myblog 静态博客生成器')
    ap.add_argument('--new', metavar='标题', help='新建一篇文章')
    ap.add_argument('--serve', action='store_true', help='构建并本地预览')
    ap.add_argument('--port', type=int, default=8000, help='预览端口，默认 8000')
    ap.add_argument('--clean', action='store_true', help='清空输出目录')
    ap.add_argument('--out', default='dist', metavar='目录',
                    help='输出目录，默认 dist（GitHub Pages 用 docs 更方便）')
    args = ap.parse_args()
    set_out(args.out)

    if args.new:
        new_post(args.new)
        return
    if args.clean:
        removed = prune(DIST_DIR, set())
        print('已清空 %s（删除 %d 个文件）' % (os.path.relpath(DIST_DIR, ROOT), len(removed)))
        return
    if args.serve:
        serve(args.port)
        return
    build()


if __name__ == '__main__':
    main()

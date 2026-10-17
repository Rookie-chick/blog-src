#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 dist/ 推到 GitHub 的 gh-pages 分支并开启 Pages。
只用 Python 标准库，绕开 git（网络受限的环境下也能用）。

用法:
    set GITHUB_TOKEN=xxxxx            # Windows
    export GITHUB_TOKEN=xxxxx         # macOS / Linux
    python deploy.py 用户名/仓库名

可选参数:
    --branch gh-pages   目标分支，默认 gh-pages
    --no-build          跳过构建，直接推送已有的 dist/
    --out dist          指定产物目录
    --token xxxxx       直接给 token（不推荐，会被写进命令行历史）
    --keep-deployments  只保留最近 N 条部署记录，默认 1（0 = 不清理）

源码备份:
    config.json 里写了 "source_repo": "用户名/blog-src" 的话，
    每次部署会顺带把源码（build.py / posts/*.md / assets / images）推到那个仓库。
    token.txt、dist/、.build-cache/ 会被自动排除。
        --no-source             这次不推源码
        --source-repo 用户名/x  临时指定源码仓库，覆盖配置

Token 权限: 需要 repo（私有仓库）或 public_repo（公开仓库）。
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
API = 'https://api.github.com'
TOKEN = None


def api(method, path, data=None, allow_404=False, retries=4):
    url = path if path.startswith('http') else API + path
    body = json.dumps(data).encode('utf-8') if data is not None else None
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header('Accept', 'application/vnd.github+json')
        req.add_header('User-Agent', 'myblog-deploy')
        if TOKEN:
            req.add_header('Authorization', 'Bearer ' + TOKEN)
        if body:
            req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read().decode('utf-8')
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')
            if allow_404 and e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait = 2 ** attempt
                print('    [重试 %d/%d] HTTP %s，%ds 后再试' % (attempt + 1, retries, e.code, wait))
                time.sleep(wait)
                last = 'HTTP %s: %s' % (e.code, detail[:300])
                continue
            raise SystemExit('请求失败 %s %s -> %s\n%s' % (method, url, e.code, detail[:800]))
        except (urllib.error.URLError, OSError) as e:
            # 连接被代理掐断（10053 之类）也重试
            if attempt < retries - 1:
                wait = 2 ** attempt
                print('    [重试 %d/%d] %s，%ds 后再试' % (attempt + 1, retries, e, wait))
                time.sleep(wait)
                last = str(e)
                continue
            raise SystemExit('网络请求失败 %s %s -> %s' % (method, url, last or e))
    raise SystemExit('请求失败 %s %s -> %s' % (method, url, last))


def walk_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('.git', '__pycache__')]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace('\\', '/')
            yield rel, full


def push(owner_repo, dist, branch):
    owner, _, repo = owner_repo.partition('/')
    if not repo:
        raise SystemExit('参数格式应为 用户名/仓库名')

    print('[*] 检查仓库 %s ...' % owner_repo)
    info = api('GET', '/repos/' + owner_repo)
    if not info:
        raise SystemExit('仓库不存在，请先在 GitHub 上创建 %s' % owner_repo)
    default_branch = info.get('default_branch', 'main')
    print('    仓库 OK，默认分支 %s，私有=%s' % (default_branch, info.get('private')))

    files = list(walk_files(dist))
    if not files:
        raise SystemExit('产物目录是空的：%s' % dist)

    # blob 缓存：断点续传用，内容没变就不重新上传
    cache_file = os.path.join(ROOT, '.build-cache',
                              'deploy-%s-%s.json' % (repo, branch))
    cache = {}
    if os.path.exists(cache_file):
        try:
            cache = json.loads(open(cache_file, encoding='utf-8').read())
        except Exception:
            cache = {}

    def save_cache():
        os.makedirs(os.path.dirname(cache_file), exist_ok=True)
        with open(cache_file, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(cache, f)

    print('[*] 上传 %d 个文件到分支 %s ...' % (len(files), branch))
    tree = []
    reused = 0
    for i, (rel, full) in enumerate(files, 1):
        st = os.stat(full)
        key = '%d-%d' % (st.st_size, int(st.st_mtime))
        hit = cache.get(rel)
        if hit and hit.get('k') == key and hit.get('sha'):
            tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': hit['sha']})
            reused += 1
            continue
        with open(full, 'rb') as f:
            content = f.read()
        blob = api('POST', '/repos/%s/git/blobs' % owner_repo, {
            'content': base64.b64encode(content).decode('ascii'),
            'encoding': 'base64',
        })
        tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        cache[rel] = {'k': key, 'sha': blob['sha']}
        if i % 10 == 0 or i == len(files):
            print('    %d/%d' % (i, len(files)))
            save_cache()
    save_cache()
    if reused:
        print('    复用已上传的 blob %d 个' % reused)

    print('[*] 创建 tree / commit ...')
    new_tree = api('POST', '/repos/%s/git/trees' % owner_repo, {'tree': tree})

    ref = api('GET', '/repos/%s/git/ref/heads/%s' % (owner_repo, branch), allow_404=True)
    parents = [ref['object']['sha']] if ref else []

    stamp = time.strftime('%Y-%m-%d %H:%M:%S')
    commit = api('POST', '/repos/%s/git/commits' % owner_repo, {
        'message': 'build: %s' % stamp,
        'tree': new_tree['sha'],
        'parents': parents,
    })

    if ref:
        api('PATCH', '/repos/%s/git/refs/heads/%s' % (owner_repo, branch),
            {'sha': commit['sha'], 'force': True})
    else:
        api('POST', '/repos/%s/git/refs' % owner_repo,
            {'ref': 'refs/heads/' + branch, 'sha': commit['sha']})

    print('[*] commit %s 已推送到 %s' % (commit['sha'][:7], branch))

    print('[*] 配置 Pages ...')
    pages = api('GET', '/repos/%s/pages' % owner_repo, allow_404=True)
    payload = {'source': {'branch': branch, 'path': '/'}}
    try:
        if pages:
            api('PUT', '/repos/%s/pages' % owner_repo, payload)
        else:
            api('POST', '/repos/%s/pages' % owner_repo, payload)
    except SystemExit as e:
        print('[!] Pages 配置失败（可能需要在网页上手动开启）：%s' % str(e)[:200])
    else:
        time.sleep(3)
        pages = api('GET', '/repos/%s/pages' % owner_repo, allow_404=True) or {}
        url = pages.get('html_url')
        if not url:
            url = 'https://%s/' % owner if repo.lower() == ('%s.github.io' % owner).lower() \
                else 'https://%s.github.io/%s/' % (owner, repo)
        print('\n完成！站点地址: %s' % url)
        print('Pages 状态: %s（首次发布通常要等 1-2 分钟）' % pages.get('status', 'unknown'))
    return commit['sha']


# --------------------------------------------------------------------------
# 源码备份：把整个项目（不含产物和令牌）推到另一个仓库
# --------------------------------------------------------------------------
SOURCE_SKIP_DIRS = {'dist', 'docs', '.build-cache', '__pycache__', '.git',
                    '.venv', '.idea', 'node_modules'}
SOURCE_SKIP_FILES = {'token.txt', 'token', '.env'}
SOURCE_SKIP_EXT = {'.pyc', '.pyo', '.log', '.tmp', '.bak'}


def load_site_config():
    try:
        with open(os.path.join(ROOT, 'config.json'), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def collect_source(root):
    """列出要备份的源码文件 —— 产物、缓存、令牌一律排除"""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SOURCE_SKIP_DIRS]
        for fn in filenames:
            if fn in SOURCE_SKIP_FILES:
                continue
            if os.path.splitext(fn)[1].lower() in SOURCE_SKIP_EXT:
                continue
            full = os.path.join(dirpath, fn)
            out.append((os.path.relpath(full, root).replace('\\', '/'), full))
    out.sort()
    # 兜底：绝不能让令牌文件混进去
    leak = [r for r, _ in out if 'token' in r.lower() or r.lower().endswith('.env')]
    if leak:
        raise SystemExit('源码里混进了疑似令牌文件，已中止：%s' % leak)
    return out


def ensure_repo(owner_repo, private=False, description=''):
    """仓库不存在就建一个（空仓库没法直接推 blob，后面还要占位提交）"""
    info = api('GET', '/repos/' + owner_repo, allow_404=True)
    if info:
        return info
    owner, _, name = owner_repo.partition('/')
    print('    源码仓库不存在，创建%s仓库 %s ...' % ('私有' if private else '公开', owner_repo))
    return api('POST', '/user/repos', {
        'name': name,
        'private': private,
        'auto_init': False,
        'description': description,
        'has_wiki': False,
        'has_projects': False,
        'has_issues': False,
    })


def push_source(owner_repo, branch='main'):
    """把源码推到备份仓库。不含 dist/、.build-cache/、token.txt。"""
    print('\n[*] 备份源码到 %s ...' % owner_repo)
    ensure_repo(owner_repo, description='个人博客源码：静态站点生成器 + Markdown 原文')
    time.sleep(1)

    files = collect_source(ROOT)
    total = sum(os.path.getsize(f) for _, f in files)
    print('    %d 个文件，%.1f MB' % (len(files), total / 1024.0 / 1024.0))

    # 空仓库连 git/refs 都会 409 "Git Repository is empty"，得先塞个占位提交
    try:
        has_ref = bool(api('GET', '/repos/%s/git/ref/heads/%s' % (owner_repo, branch)))
    except SystemExit:
        has_ref = False
    if not has_ref:
        print('    空仓库，先建占位提交 ...')
        api('PUT', '/repos/%s/contents/.gitkeep' % owner_repo,
            {'message': 'init', 'content': 'Cg=='})
        time.sleep(2)

    cache_file = os.path.join(ROOT, '.build-cache',
                              'deploy-%s-%s.json' % (owner_repo.split('/')[-1], branch))
    os.makedirs(os.path.dirname(cache_file), exist_ok=True)
    cache = {}
    if os.path.exists(cache_file):
        try:
            cache = json.loads(open(cache_file, encoding='utf-8').read())
        except Exception:
            cache = {}

    def save_cache():
        with open(cache_file, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(cache, f)

    tree, reused = [], 0
    for i, (rel, full) in enumerate(files, 1):
        st = os.stat(full)
        key = '%d-%d' % (st.st_size, int(st.st_mtime))
        hit = cache.get(rel)
        if hit and hit.get('k') == key and hit.get('sha'):
            tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': hit['sha']})
            reused += 1
            continue
        with open(full, 'rb') as f:
            blob = api('POST', '/repos/%s/git/blobs' % owner_repo, {
                'content': base64.b64encode(f.read()).decode('ascii'),
                'encoding': 'base64',
            })
        tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        cache[rel] = {'k': key, 'sha': blob['sha']}
        if i % 20 == 0 or i == len(files):
            print('      %d/%d' % (i, len(files)))
            save_cache()
    save_cache()

    new_tree = api('POST', '/repos/%s/git/trees' % owner_repo, {'tree': tree})
    ref = api('GET', '/repos/%s/git/ref/heads/%s' % (owner_repo, branch), allow_404=True)
    commit = api('POST', '/repos/%s/git/commits' % owner_repo, {
        'message': 'source: %s' % time.strftime('%Y-%m-%d %H:%M:%S'),
        'tree': new_tree['sha'],
        'parents': [ref['object']['sha']] if ref else [],
    })
    if ref:
        api('PATCH', '/repos/%s/git/refs/heads/%s' % (owner_repo, branch),
            {'sha': commit['sha'], 'force': True})
    else:
        api('POST', '/repos/%s/git/refs' % owner_repo,
            {'ref': 'refs/heads/' + branch, 'sha': commit['sha']})

    print('    源码已备份：commit %s（%d 个文件，复用 %d）' % (
        commit['sha'][:7], len(files), reused))
    return commit['sha']


def prune_deployments(owner_repo, keep=1, new_sha=''):
    """
    清掉多余的 Pages 部署记录，只保留最近 keep 条。

    每推送一次到 Pages 分支，GitHub 就会生成一条部署记录，久了会堆一长串。
    这些记录不影响站点（线上永远只跑最新那次），纯粹是历史列表。
    GitHub 不允许直接删除 active 状态的部署，所以要先提交一个
    "inactive" 状态把它标掉，然后才能删。

    坑：部署记录是推送之后**异步**才生成的。刚推完就去查，很可能只看到旧记录，
    于是误判"没什么可清理的"直接返回。所以要等新提交对应的记录出现再动手。
    """
    deps = []
    for _ in range(10):
        try:
            deps = api('GET', '/repos/%s/deployments?per_page=100' % owner_repo)
        except SystemExit as e:
            print('[!] 读取部署记录失败，跳过清理：%s' % str(e)[:120])
            return
        if not isinstance(deps, list):
            return
        if not new_sha or any(d.get('sha') == new_sha for d in deps):
            break
        time.sleep(3)
    if len(deps) <= keep:
        return
    stale = deps[keep:]
    print('[*] 清理 %d 条历史部署记录（保留最近 %d 条）...' % (len(stale), keep))
    for d in stale:
        try:
            api('POST', '/repos/%s/deployments/%s/statuses' % (owner_repo, d['id']),
                {'state': 'inactive'})
            api('DELETE', '/repos/%s/deployments/%s' % (owner_repo, d['id']))
            print('    已删除 %s (%s)' % (d['id'], d.get('sha', '')[:7]))
        except SystemExit as e:
            print('    跳过 %s：%s' % (d['id'], str(e)[:100]))


def main():
    global TOKEN
    ap = argparse.ArgumentParser(description='把站点推到 GitHub Pages')
    ap.add_argument('repo', help='用户名/仓库名，例如 Rookie-chick/blog')
    ap.add_argument('--branch', default='gh-pages')
    ap.add_argument('--out', default='dist')
    ap.add_argument('--no-build', action='store_true')
    ap.add_argument('--token', default='')
    ap.add_argument('--keep-deployments', type=int, default=1, metavar='N',
                    help='部署成功后只保留最近 N 条部署记录，默认 1（填 0 表示不清理）')
    ap.add_argument('--source-repo', default='', metavar='用户名/仓库名',
                    help='额外把源码备份到这个仓库（覆盖 config.json 里的 source_repo）')
    ap.add_argument('--no-source', action='store_true', help='这次不备份源码')
    args = ap.parse_args()

    TOKEN = args.token or os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN') or ''
    if not TOKEN:
        tk = os.path.join(ROOT, 'token.txt')
        if os.path.exists(tk):
            TOKEN = open(tk, encoding='utf-8').read().strip()
    if not TOKEN:
        raise SystemExit('没有找到 token。请设置环境变量 GITHUB_TOKEN，或把 token 写进 token.txt。')

    dist = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)

    if not args.no_build:
        sys.path.insert(0, ROOT)
        import build as B
        B.set_out(dist)
        B.build()

    if not os.path.isdir(dist):
        raise SystemExit('产物目录不存在：%s' % dist)

    sha = push(args.repo, dist, args.branch)

    if args.keep_deployments and args.keep_deployments > 0:
        prune_deployments(args.repo, args.keep_deployments, sha)

    # 顺带备份源码
    src_repo = args.source_repo or load_site_config().get('source_repo') or ''
    if src_repo and not args.no_source:
        push_source(src_repo)


if __name__ == '__main__':
    main()

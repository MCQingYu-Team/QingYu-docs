#!/usr/bin/env node
/**
 * 清屿服务器规则 · 静态站点生成器
 *
 * 零依赖（只用 Node 标准库）：把 Markdown 源文件编译成纯静态 HTML 站点，
 * 界面形态参照 VitePress 默认主题：顶栏导航 + 可折叠侧边栏 + 右侧大纲 + 上下页
 * + 站内搜索 + 首页 hero/特性卡片，浅色/深色双主题，mermaid 图按需加载。
 * 产物输出到 site/，可直接部署到任意静态托管。
 *
 * 用法：
 *   node scripts/build-site.mjs            构建
 *   node scripts/build-site.mjs --check    只校验链接与锚点，不写文件
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'site');
const ASSETS_DIR = join(ROOT, 'site-assets');
const REPO_URL = 'https://github.com/MCQingYu-Team/QingYu-docs';
const BRANCH = 'main';
const CHECK_ONLY = process.argv.includes('--check');

/* ------------------------------------------------------------------ *
 * 1. 导航结构（顶部菜单栏的三个分组 + 侧边栏的页面列表）
 * ------------------------------------------------------------------ */

const NAV = [
  {
    group: '快速开始',
    items: ['规则/指南/选择客户端.md', '规则/指南/入服与绑定.md', '规则/指南/常见问题.md', '服务器信息.md'],
  },
  {
    group: '规则',
    items: [
      '规则/清屿服务器玩家守则.md',
      '规则/清屿服务器管理员条例.md',
      '规则/清屿服务器地铁乘车管理条例.md',
      '规则/清屿服务器玩家身份与治理条例.md',
      '规则/清屿服务器七日阳光流程.md',
    ],
  },
  {
    group: '处罚',
    items: [
      '规则/处罚细目表.md',
      '规则/处罚细目/01-语言类.md',
      '规则/处罚细目/02-破坏类.md',
      '规则/处罚细目/03-作弊类.md',
      '规则/处罚细目/04-经济类.md',
      '规则/处罚细目/05-账号类.md',
      '规则/处罚细目/06-管理类.md',
      '规则/处罚细目/07-群聊社区.md',
    ],
  },
];

/** 顶栏导航：src 指向分组的第一页，href 为站外链接 */
const TOP_NAV = [
  { label: '主页', src: '规则/index.md' },
  { label: '快速开始', src: '规则/指南/选择客户端.md', group: '快速开始' },
  { label: '规则', src: '规则/清屿服务器玩家守则.md', group: '规则' },
  { label: '处罚', src: '规则/处罚细目表.md', group: '处罚' },
  { label: '官网', href: 'https://www.aqcraft.cn' },
];

/** 首页 hero 的名称、标语与入口按钮 */
const HOME_HERO = {
  name: '清屿服务器',
  text: '规则与使用文档',
  tagline: '生存 · 红石 · 建筑 · 地铁 · 赛事，快速上手服务器的规则与玩法',
  actions: [
    { src: '规则/指南/选择客户端.md', label: '快速开始', primary: true },
    { src: '规则/清屿服务器玩家守则.md', label: '玩家守则' },
    { src: '规则/处罚细目表.md', label: '处罚细目' },
  ],
};

/** 首页特性卡片 */
const HOME_FEATURES = [
  { title: '双端互通', details: 'Java 版与基岩版（Geyser）同一地址加入，同 ID 数据互通', src: '规则/指南/选择客户端.md' },
  { title: '即进即绑', details: '进服拿绑定码，发到 QQ 群，机器人自动加白名单', src: '规则/指南/入服与绑定.md' },
  { title: '规则公开', details: '玩家守则、管理员条例、地铁条例全部公开，处罚有据可查', src: '规则/清屿服务器玩家守则.md' },
  { title: '七日阳光', details: '规则不能偷偷改：任何修订公示 7 日，玩家可提意见与表决', src: '规则/清屿服务器七日阳光流程.md' },
  { title: '处罚细目', details: '七大类 175 条处罚对照，编号可直接搜索（如 L-003）', src: '规则/处罚细目表.md' },
  { title: '玩家共治', details: '无等级、单一身份「贡献者」，重大事项由玩家表决', src: '规则/清屿服务器玩家身份与治理条例.md' },
];

/** 不在导航里、但仍需生成的页面 */
const EXTRA_PAGES = ['规则/index.md', '规则/404.md'];

/** 源文件路径 → 输出文件路径 */
function outPath(src) {
  if (src === '规则/index.md') return 'index.html';
  return src.replace(/^规则\//, '').replace(/\.md$/, '.html');
}

/* ------------------------------------------------------------------ *
 * 2. Markdown 解析（覆盖现有文档用到的全部语法）
 * ------------------------------------------------------------------ */

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 标题 → 锚点：与文档内已有的手写链接（如 #第一章总则、#37-身份换不来的五样东西）保持一致 */
function slugify(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[*`]/g, '')
    .toLowerCase()
    .replace(/\u3000/g, '')
    .replace(/[^\p{Letter}\p{Number} -]/gu, '')
    .trim()
    .replace(/ +/g, '-')
    .replace(/-{2,}/g, '-');
}

/** 行内语法：先抽出代码段做占位，避免 ** 等标记干扰 */
function inline(text, page) {
  const codes = [];
  let t = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  t = escapeHtml(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${page.link(url)}" alt="${alt}">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${page.link(url)}">${label}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

/** 把一行表格拆成单元格 */
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/**
 * 解析一个 Markdown 文件
 * @returns {{html: string, headings: Array, text: string}}
 */
function renderMarkdown(source, page) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const textParts = [];
  let i = 0;

  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSeparator = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 围栏代码块
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const body = buf.join('\n');
      if (lang === 'mermaid') {
        page.hasMermaid = true;
        out.push(`<div class="mermaid">${escapeHtml(body)}</div>`);
        textParts.push(body);
      } else {
        out.push(`<pre><code class="language-${lang || 'text'}">${escapeHtml(body)}</code></pre>`);
      }
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const raw = heading[2].trim();
      const id = slugify(raw);
      const label = inline(raw, page);
      if (level <= 3) headings.push({ level, id, label });
      textParts.push(raw);
      out.push(
        `<h${level} id="${id}">${label}<a class="anchor" href="#${id}" aria-label="锚点">#</a></h${level}>`,
      );
      i += 1;
      continue;
    }

    // 表格
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(splitRow(lines[i]));
        i += 1;
      }
      const th = head.map((c) => `<th>${inline(c, page)}</th>`).join('');
      const rows = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c, page)}</td>`).join('')}</tr>`)
        .join('\n');
      out.push(`<div class="table-wrap"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table></div>`);
      textParts.push(...head, ...body.flat());
      continue;
    }

    // 引用块
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      const inner = buf
        .join(' ')
        .split(/\s{2,}/)
        .filter(Boolean)
        .map((p) => `<p>${inline(p, page)}</p>`)
        .join('');
      out.push(`<blockquote>${inner || '<p></p>'}</blockquote>`);
      textParts.push(...buf);
      continue;
    }

    // 列表（本项目文档不嵌套，缩进行视作上一项的续行）
    const listStart = line.match(/^([-*]|\d+\.)\s+(.*)$/);
    if (listStart) {
      const ordered = /\d/.test(listStart[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^([-*]|\d+\.)\s+(.*)$/);
        if (m) {
          items.push(m[2]);
          i += 1;
          continue;
        }
        if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t, page)}</li>`).join('')}</${tag}>`);
      textParts.push(...items);
      continue;
    }

    // 段落
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^([-*]|\d+\.)\s/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      buf.push(lines[i].trim());
      i += 1;
    }
    if (buf.length) {
      out.push(`<p>${inline(buf.join(' '), page)}</p>`);
      textParts.push(...buf);
    } else {
      i += 1;
    }
  }

  return { html: out.join('\n'), headings, text: textParts.join(' ') };
}

/* ------------------------------------------------------------------ *
 * 3. 读取源文件，建立页面模型
 * ------------------------------------------------------------------ */

function firstHeading(source) {
  const m = source.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '未命名';
}

const navOrder = NAV.flatMap((g) => g.items);
const allSources = [...navOrder, ...EXTRA_PAGES];
const outOf = new Map(allSources.map((src) => [src, outPath(src)]));

const pages = new Map();
for (const src of allSources) {
  const abs = join(ROOT, src);
  if (!existsSync(abs)) {
    console.error(`✗ 找不到源文件：${src}`);
    process.exit(1);
  }
  const source = readFileSync(abs, 'utf8');
  pages.set(src, { src, out: outOf.get(src), title: firstHeading(source), source });
}

/** 输出路径之间的相对链接 */
function relLink(fromOut, toOut) {
  const fromDir = dirname(join(OUT_DIR, fromOut));
  return relative(fromDir, join(OUT_DIR, toOut)).split('\\').join('/');
}

const blobUrl = (repoPath) => `${REPO_URL}/blob/${BRANCH}/${encodeURI(repoPath)}`;

const problems = [];

function makePageCtx(page) {
  return {
    hasMermaid: false,
    /** 把 Markdown 里的链接改写成站内地址；站外/不存在的一律指向 GitHub */
    link(url) {
      if (/^(https?:|mailto:|#|data:)/.test(url)) return url.replace(/&/g, '&amp;');
      const [target, hash = ''] = url.split('#');
      if (!target) return `#${hash}`;
      const abs = resolve(ROOT, dirname(page.src), decodeURIComponent(target));
      const repoPath = relative(ROOT, abs).split('\\').join('/');
      const out = outOf.get(repoPath);
      if (out) {
        const href = relLink(page.out, out);
        return `${href}${hash ? `#${hash}` : ''}`;
      }
      return blobUrl(repoPath);
    },
  };
}

/* ------------------------------------------------------------------ *
 * 4. 逐个页面渲染
 * ------------------------------------------------------------------ */

const rendered = new Map();
for (const [src, page] of pages) {
  const ctx = makePageCtx(page);
  const result = renderMarkdown(page.source, ctx);
  rendered.set(src, { ...page, ...result, hasMermaid: ctx.hasMermaid });
}

// 校验页内锚点
for (const [, page] of rendered) {
  const ids = new Set(page.headings.map((h) => h.id));
  for (const m of page.source.matchAll(/\]\(#([^)]+)\)/g)) {
    if (!ids.has(decodeURIComponent(m[1]))) {
      problems.push(`锚点不存在：${page.src} → #${decodeURIComponent(m[1])}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 5. 页面外壳
 * ------------------------------------------------------------------ */

const SITE_NAME = '清屿服务器文档';
const SITE_DESC = '清屿服务器官方文档：入服指南、玩家守则、管理员条例、地铁条例、身份与治理条例与处罚细目';

const baseHref = (page) => {
  const depth = page.out.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
};

const pagesByOut = new Map([...pages.values()].map((p) => [p.out, p]));

/** 首页的「规则体系」表格换成卡片墙。表格仍是唯一数据源：版本号由 check-references 与各文档头部核对。 */
function homeTiles(html) {
  const table = html.match(/<div class="table-wrap"><table>[\s\S]*?<\/table><\/div>/);
  if (!table) return html;

  const tbody = (table[0].match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]),
  );

  const tiles = rows
    .map((cells) => {
      const href = (cells[0].match(/href="([^"]+)"/) || [])[1] || '#';
      const target = pagesByOut.get(href);
      const title = target ? target.title : cells[0].replace(/<[^>]+>/g, '').replace(/\.md$/, '');
      return `<a class="tile" href="${href}">
<h3>${escapeHtml(title)}</h3>
<p class="tile__meta"><span class="badge">${cells[1] || ''}</span>${cells[2] || ''}</p>
<p class="tile__desc">${cells[3] || ''}</p>
</a>`;
    })
    .join('\n');

  return html.replace(table[0], `<div class="tiles">\n${tiles}\n</div>`);
}

/** 首页 hero + 特性卡片 */
function homeTop(page) {
  const link = (src) => relLink(page.out, pages.get(src).out);
  const actions = HOME_HERO.actions
    .map((a) => `<a class="button${a.primary ? ' button--brand' : ''}" href="${link(a.src)}">${a.label}</a>`)
    .join('');
  const features = HOME_FEATURES.map(
    (f) => `<a class="feature" href="${link(f.src)}">
  <h2>${escapeHtml(f.title)}</h2>
  <p>${escapeHtml(f.details)}</p>
  <span class="feature__more">开始阅读</span>
</a>`,
  ).join('\n');

  return `<section class="hero">
  <h1><span class="hero__name">${HOME_HERO.name}</span><span class="hero__text">${HOME_HERO.text}</span></h1>
  <p class="hero__tagline">${HOME_HERO.tagline}</p>
  <div class="hero__actions">${actions}</div>
</section>
<section class="features">
${features}
</section>`;
}

/** 当前页属于哪个导航分组 */
const groupOf = (src) => (NAV.find((g) => g.items.includes(src)) || {}).group;

function shell(page) {
  const base = baseHref(page);
  const isHome = page.src === '规则/index.md';
  const curGroup = groupOf(page.src);

  const topNav = TOP_NAV.map((n) => {
    if (n.href) return `<a class="nav-link" href="${n.href}" target="_blank" rel="noopener">${n.label}<span class="ext" aria-hidden="true">↗</span></a>`;
    const active = (n.group && n.group === curGroup) || (!n.group && n.src === page.src);
    return `<a class="nav-link${active ? ' nav-link--active' : ''}" href="${relLink(page.out, pages.get(n.src).out)}">${n.label}</a>`;
  }).join('');

  const sidebar = NAV.map((g) => {
    const open = g.group === curGroup || !curGroup;
    const items = g.items
      .map((src) => {
        const p = pages.get(src);
        const active = src === page.src ? ' side-link--active' : '';
        const aria = src === page.src ? ' aria-current="page"' : '';
        return `<li><a class="side-link${active}" href="${relLink(page.out, p.out)}"${aria}>${escapeHtml(p.title)}</a></li>`;
      })
      .join('');
    return `<details class="side-group"${open ? ' open' : ''}>
  <summary class="side-title">${escapeHtml(g.group)}</summary>
  <ul class="side-list">${items}</ul>
</details>`;
  }).join('\n');

  const outline = page.headings
    .filter((h) => h.level >= 2 && h.level <= 3)
    .map((h) => `<li><a class="toc-link toc-link--h${h.level}" href="#${h.id}">${h.label.replace(/<a [^>]*>|<\/a>/g, '')}</a></li>`)
    .join('');

  // 上一页 / 下一页按侧边栏顺序
  const idx = navOrder.indexOf(page.src);
  const prev = idx > 0 ? pages.get(navOrder[idx - 1]) : null;
  const next = idx >= 0 && idx < navOrder.length - 1 ? pages.get(navOrder[idx + 1]) : null;
  const pagerLink = (p, dir) =>
    p
      ? `<a class="pager__link pager__link--${dir}" href="${relLink(page.out, p.out)}"><span class="pager__label">${dir === 'prev' ? '上一页' : '下一页'}</span><span class="pager__title">${escapeHtml(p.title)}</span></a>`
      : '<span></span>';
  const pager = idx >= 0 ? `<nav class="pager" aria-label="翻页">${pagerLink(prev, 'prev')}${pagerLink(next, 'next')}</nav>` : '';

  const docTitle = isHome ? SITE_NAME : `${page.title} | ${SITE_NAME}`;

  const footer = `<footer class="site-footer">
  <p>规则文档依据<a href="${REPO_URL}/blob/${BRANCH}/LICENSE" target="_blank" rel="noopener">清屿服务器规则许可协议</a>发布 · 修订须遵循七日阳光流程</p>
  <p>Copyright © 2026 清屿运营团队 · QQ 群 1102137231</p>
</footer>`;

  let main;
  if (isHome) {
    // 首页正文去掉 h1 与导语段落（由 hero 承担）
    const body = homeTiles(page.html)
      .replace(/<h1 [^>]*>[\s\S]*?<\/h1>/, '')
      .replace(/^\s*<p>[\s\S]*?<\/p>/, '');
    main = `<main class="home" id="content">
${homeTop(page)}
<article class="md home__body">${body}</article>
</main>
${footer}`;
  } else {
    main = `<div class="layout">
  <aside class="sidebar" id="sidebar" aria-label="文档目录">
${sidebar}
  </aside>
  <div class="content">
    <main class="doc" id="content">
      ${curGroup ? `<p class="doc__group">${escapeHtml(curGroup)}</p>` : ''}
      <article class="md">${page.html}</article>
      <div class="doc__edit"><a href="${REPO_URL}/edit/${BRANCH}/${encodeURI(page.src)}" target="_blank" rel="noopener">在 GitHub 上编辑此页</a></div>
      ${pager}
    </main>
    ${outline ? `<aside class="aside" aria-label="本页大纲"><div class="outline"><p class="outline__title">本页目录</p><ul class="outline__list">${outline}</ul></div></aside>` : ''}
  </div>
</div>`;
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(docTitle)}</title>
<meta name="description" content="${escapeHtml(SITE_DESC)}">
<script>try{var t=localStorage.getItem('qy-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2314b8a6'/%3E%3Cpath d='M9 22V10h3.5l3.5 5.5 3.5-5.5H23v12h-3v-7l-4 6-4-6v7z' fill='%23fff'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}assets/site.css">
</head>
<body class="${isHome ? 'is-home' : 'is-doc'}">
<a class="skip" href="#content">跳到正文</a>
<header class="navbar">
  <div class="navbar__inner">
    <a class="navbar__title" href="${relLink(page.out, 'index.html')}"><span class="navbar__logo" aria-hidden="true">屿</span>${SITE_NAME}</a>
    <button class="search-btn" id="search-btn" type="button" aria-label="搜索"><span class="search-btn__icon" aria-hidden="true"></span><span class="search-btn__text">搜索文档</span><kbd>Ctrl K</kbd></button>
    <nav class="navbar__menu" aria-label="主导航">${topNav}</nav>
    <div class="navbar__extra">
      <a class="icon-btn icon-btn--gh" href="${REPO_URL}" target="_blank" rel="noopener" aria-label="GitHub 仓库"></a>
      <button class="icon-btn icon-btn--theme" id="theme-btn" type="button" aria-label="切换深色模式"></button>
    </div>
    <button class="hamburger" id="menu-btn" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="mobile-nav"><span></span><span></span><span></span></button>
  </div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="移动端导航" hidden>${topNav}</nav>
</header>
${isHome ? '' : `<div class="localnav">
  <button class="localnav__menu" id="nav-btn" type="button" aria-controls="sidebar" aria-expanded="false">菜单</button>
  ${outline ? '<button class="localnav__top" id="top-btn" type="button">返回顶部</button>' : ''}
</div>`}
${main}

<div class="search" id="search" hidden>
  <div class="search__panel" role="dialog" aria-modal="true" aria-label="站内搜索">
    <input id="search-input" type="search" placeholder="搜索规则、编号（如 L-003）、条款…" autocomplete="off" aria-label="搜索关键词">
    <div class="search__results" id="search-results"></div>
    <div class="search__foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></div>
  </div>
</div>

<script>window.SITE_BASE=${JSON.stringify(base)};</script>
<script src="${base}assets/search-index.js"></script>
<script src="${base}assets/site.js"></script>
${page.hasMermaid ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>window.mermaid && mermaid.initialize({ startOnLoad: true, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });</script>` : ''}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * 6. 站内搜索索引
 * ------------------------------------------------------------------ */

function buildSearchIndex() {
  const entries = [];
  for (const [, page] of rendered) {
    if (page.out === '404.html') continue;
    const sections = page.html.split(/(?=<h2 )/);
    const url = (hash) => `${page.out}${hash ? `#${hash}` : ''}`;

    entries.push({
      t: page.title,
      u: url(''),
      h: page.title,
      s: page.text.replace(/\s+/g, ' ').slice(0, 200),
    });

    for (const section of sections.slice(1)) {
      const m = section.match(/<h2 id="([^"]+)">([\s\S]*?)<a class="anchor"/);
      if (!m) continue;
      const heading = m[2].replace(/<[^>]+>/g, '');
      const body = section
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 240);
      entries.push({ t: page.title, u: url(m[1]), h: heading, s: body });
    }
  }
  return `window.SITE_SEARCH=${JSON.stringify(entries)};\n`;
}

/* ------------------------------------------------------------------ *
 * 7. 输出
 * ------------------------------------------------------------------ */

if (problems.length) {
  console.log('链接与锚点检查：');
  for (const p of problems) console.log(`  ✗ ${p}`);
} else {
  console.log('链接与锚点检查：通过');
}

if (CHECK_ONLY) process.exit(problems.length ? 1 : 0);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(join(OUT_DIR, 'assets'), { recursive: true });

for (const [, page] of rendered) {
  const target = join(OUT_DIR, page.out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, shell(page));
}

writeFileSync(join(OUT_DIR, 'assets', 'search-index.js'), buildSearchIndex());
for (const asset of ['site.css', 'site.js']) {
  writeFileSync(join(OUT_DIR, 'assets', asset), readFileSync(join(ASSETS_DIR, asset), 'utf8'));
}

console.log(`✓ 已生成 ${rendered.size} 个页面 → site/`);

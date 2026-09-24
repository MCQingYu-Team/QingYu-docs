#!/usr/bin/env node
/**
 * 清屿服务器规则 · 静态站点生成器
 *
 * 零依赖（只用 Node 标准库）：把 Markdown 源文件编译成纯静态 HTML 站点，
 * 界面形态对齐官网（www.aqcraft.cn）使用的 Forty 模板：固定顶栏 + 左侧文档栏
 * + 页内目录 + 站内搜索 + 首页卡片，深色单主题，mermaid 图按需加载。
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
  { group: '总览', items: ['规则/index.md', '服务器信息.md'] },
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

/** 首页头图的入口按钮；带 href 的是站外链接 */
const HOME_ACTIONS = [
  { src: '规则/清屿服务器玩家守则.md', label: '读玩家守则', primary: true },
  { src: '规则/处罚细目表.md', label: '看处罚细目表' },
  { href: 'https://www.aqcraft.cn', label: '访问官网' },
];

/** 不在导航里、但仍需生成的页面 */
const EXTRA_PAGES = ['规则/404.md'];

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
const groupOf = new Map();
for (const g of NAV) for (const src of g.items) groupOf.set(src, g.group);

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

const SITE_NAME = '清屿服务器规则';
const SITE_DESC = '清屿服务器官方规则文档：玩家守则、管理员条例、地铁条例、身份与治理条例与处罚细目';

const baseHref = (page) => {
  const depth = page.out.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
};

const pagesByOut = new Map([...pages.values()].map((p) => [p.out, p]));

/** 取文档首个普通段落，作为首页头图的导语 */
function firstParagraph(source) {
  return (
    source
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !/^(#{1,6}\s|>\s?|[-*+]\s|\||`|\d+\.\s)/.test(l)) || ''
  );
}

/**
 * 首页的「规则体系」表格换成套色卡片。表格仍是唯一数据源：
 * 版本号由 scripts/check-references.mjs 与各文档头部核对。
 */
function homeTiles(html) {
  const table = html.match(/<div class="table-wrap"><table>[\s\S]*?<\/table><\/div>/);
  if (!table) return html;

  const tbody = (table[0].match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]),
  );

  const tiles = rows
    .map((cells, i) => {
      const href = (cells[0].match(/href="([^"]+)"/) || [])[1] || '#';
      const target = pagesByOut.get(href);
      const title = target ? target.title : cells[0].replace(/<[^>]+>/g, '').replace(/\.md$/, '');
      return `<article class="tile tile--c${(i % 6) + 1}">
<h3><a href="${href}">${escapeHtml(title)}</a></h3>
<p class="tile__meta">${cells[1] || ''} · ${cells[2] || ''}</p>
<p class="tile__desc">${cells[3] || ''}</p>
</article>`;
    })
    .join('\n');

  return html.replace(table[0], `<div class="tiles">\n${tiles}\n</div>`);
}

/** 首页头图：标题 + 导语 + 主要入口按钮 */
function homeHero(page, lead) {
  const actions = HOME_ACTIONS.map((a) => {
    const href = a.href || relLink(page.out, pages.get(a.src).out);
    const cls = `button${a.primary ? ' button--primary' : ''}`;
    const ext = a.href ? ' target="_blank" rel="noopener"' : '';
    return `<li><a class="${cls}" href="${href}"${ext}>${a.label}</a></li>`;
  }).join('');

  return `<div class="hero">
  <div class="inner">
    <h1>${escapeHtml(page.title)}</h1>
    <p class="hero__lead">${lead}</p>
    <ul class="actions">${actions}</ul>
  </div>
</div>`;
}

function shell(page) {
  const base = baseHref(page);
  const currentGroup = groupOf.get(page.src);
  const isHome = page.src === '规则/index.md';

  const tabs = NAV.map((g) => {
    const active = g.group === currentGroup;
    const first = pages.get(g.items[0]);
    return `<a class="tab tab--group${active ? ' tab--active' : ''}" href="${relLink(page.out, first.out)}">${escapeHtml(g.group)}</a>`;
  }).join('');

  const sidebar = NAV.map(
    (g) => `      <nav class="side-group">
        <div class="side-title">${escapeHtml(g.group)}</div>
        <ul class="side-list">${g.items
          .map((src) => {
            const p = pages.get(src);
            const active = src === page.src ? ' side-link--active' : '';
            return `<li><a class="side-link${active}" href="${relLink(page.out, p.out)}">${escapeHtml(p.title)}</a></li>`;
          })
          .join('')}</ul>
      </nav>`,
  ).join('\n');

  const tocItems = page.headings
    .filter((h) => h.level >= 2 && h.level <= 3)
    .map(
      (h) =>
        `<li><a class="toc-link toc-link--h${h.level}" href="#${h.id}">${h.label}</a></li>`,
    )
    .join('');

  // 首页的标题与导语由头图承担，正文里去掉这两处，避免同一段话出现两次
  const lead = isHome ? inline(firstParagraph(page.source), makePageCtx(page)) : '';
  let body = page.html;
  if (isHome) {
    body = homeTiles(body)
      .replace(/<h1 [^>]*>[\s\S]*?<\/h1>/, '')
      .replace(`<p>${lead}</p>`, '');
  }

  const docTitle = page.title === SITE_NAME ? SITE_NAME : `${page.title} · ${SITE_NAME}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(docTitle)}</title>
<meta name="description" content="${escapeHtml(SITE_DESC)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23242943'/%3E%3Cpath d='M8 22V10h4l4 6 4-6h4v12h-3v-7l-5 7-5-7v7z' fill='%239bf1ff'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}assets/site.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,300italic,600,600italic&display=swap" media="print" onload="this.media='all'">
</head>
<body>
<header class="topbar">
  <a class="topbar__logo" href="${relLink(page.out, 'index.html')}"><strong>清屿</strong><span>服务器规则</span></a>
  <nav class="topbar__nav">${tabs}
    <button class="tab tab--menu" id="nav-btn" aria-controls="sidebar" aria-label="文档目录">☰ 目录</button>
    <button class="tab" id="search-btn" aria-label="站内搜索">搜索</button>
  </nav>
</header>

<div class="wrapper">
${isHome ? `${homeHero(page, lead)}\n` : ''}  <div class="layout">
    <aside class="sidebar" id="sidebar">
${sidebar}
    </aside>

    <div class="inner">
${tocItems ? `      <details class="toc">\n        <summary class="toc__summary">本页目录</summary>\n        <ul class="toc__list">${tocItems}</ul>\n      </details>\n` : ''}      <article class="md">${body}</article>
      <footer class="page-footer">
        <span>© 清屿运营团队 · 修订须遵循「七日阳光流程」</span>
        <ul class="footer-links">
          <li><a href="https://www.aqcraft.cn" target="_blank" rel="noopener">官网</a></li>
          <li><a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a></li>
          <li><a href="${REPO_URL}/edit/${BRANCH}/${encodeURI(page.src)}" target="_blank" rel="noopener">编辑本页</a></li>
        </ul>
      </footer>
    </div>
  </div>
</div>

<div class="search" id="search" hidden>
  <div class="search__panel">
    <input id="search-input" type="search" placeholder="搜索规则、编号（如 L-003）、条款…" autocomplete="off">
    <div class="search__results" id="search-results"></div>
  </div>
</div>

<script src="${base}assets/search-index.js"></script>
<script src="${base}assets/site.js"></script>
${page.hasMermaid ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>window.mermaid && mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>` : ''}
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

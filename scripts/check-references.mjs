#!/usr/bin/env node
/**
 * 清屿服务器规则仓库 · 文档一致性检查器
 *
 * 检查项：
 *   1. 编号引用 —— 文档中引用的处罚编号（如 L-003、P-002）必须存在于处罚细目
 *   2. 章节引用 —— "玩家守则 8.4.1"、"管理员条例 第十二条" 等引用目标必须存在
 *   3. 内部链接 —— 仓库内相对 Markdown 链接的目标文件必须存在
 *   4. 版本一致 —— README 规则矩阵标注的版本号必须与文档头部一致
 *   5. 头部规范 —— 规则文档头部应包含版本号与 YYYY.MM.DD 格式的更新日期
 *
 * 用法：
 *   node scripts/check-references.mjs               常规检查（彩色输出）
 *   node scripts/check-references.mjs --json        输出 JSON 报告（供 CI / 脚本解析）
 *   node scripts/check-references.mjs --no-color    禁用颜色输出
 *
 * 退出码：发现问题时返回 1，否则返回 0。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const USE_JSON = ARGS.has('--json');
const USE_COLOR = !ARGS.has('--no-color') && !USE_JSON;

// 文档名别名 → 仓库内路径。文本里出现 "玩家守则 8.4.1" 这类引用时据此定位目标文档。
const DOC_ALIASES = [
  ['玩家守则', '规则/清屿服务器玩家守则.md'],
  ['管理员条例', '规则/清屿服务器管理员条例.md'],
  ['地铁乘车管理条例', '规则/清屿服务器地铁乘车管理条例.md'],
  ['地铁条例', '规则/清屿服务器地铁乘车管理条例.md'],
  ['处罚细目表', '规则/处罚细目表.md'],
];

// 需要校验头部版本号与更新日期的规则文档
const RULE_DOCS = new Set([
  '清屿服务器玩家守则.md',
  '清屿服务器管理员条例.md',
  '清屿服务器地铁乘车管理条例.md',
  '处罚细目表.md',
  '01-语言类.md',
  '02-破坏类.md',
  '03-作弊类.md',
  '04-经济类.md',
  '05-账号类.md',
  '06-管理类.md',
  '07-群聊社区.md',
]);

// 处罚编号所在目录（编号的定义来源）
const PUNISHMENT_DIR = join('规则', '处罚细目');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'site', '.venv', 'dist']);

const ID_RE = /(?<![A-Za-z0-9])[LPCEAMQ]-\d{3}/g;
const ID_DEF_RE = /^\|\s*([LPCEAMQ]-\d{3})\s*\|/gm;
// "第十二条"、"第五章"、"第五部分"
const CLAUSE_RE = /第[一二三四五六七八九十百零]+(?:条|章|部分)/;
// "8.4.1" 形式的编号
const DECIMAL_RE = /\d+(?:\.\d+)+/;

// ---------- 输出工具 ----------
const c = (code, s) => (USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => c('31', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const dim = (s) => c('2', s);

const problems = [];
const sections = [];
let currentSection = null;

function init(name) {
  currentSection = { name, problems: [], checked: 0 };
  sections.push(currentSection);
}

function err(where, message) {
  const p = { where, message };
  currentSection.problems.push(p);
  problems.push({ check: currentSection.name, ...p });
}

function rel(p) {
  return relative(ROOT, p).split('\\').join('/');
}

// ---------- 收集 Markdown 文件 ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (extname(name) === '.md') out.push(full);
  }
  return out;
}

const mdFiles = walk(ROOT);
const docs = new Map();
for (const f of mdFiles) {
  docs.set(rel(f), { path: f, text: readFileSync(f, 'utf8') });
}

function getDoc(relPath) {
  return docs.get(relPath.split('\\').join('/'));
}

/** 取标题行（# 开头，跳过文档一级标题） */
function headings(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (m) out.push(m[2]);
  }
  return out;
}

/** 该文档中出现的全部条款引用目标（"第十二条" / "8.4.1" 等） */
function clauseInventory(relPath) {
  const doc = getDoc(relPath);
  const heads = doc ? headings(doc.text) : [];
  const clauses = new Set();
  const numbers = new Set();
  for (const h of heads) {
    const cm = h.match(new RegExp(CLAUSE_RE.source, 'g'));
    if (cm) for (const x of cm) clauses.add(x);
    const nm = h.match(/^\s*(\d+(?:\.\d+)*)/);
    if (nm) numbers.add(nm[1]);
  }
  return { clauses, numbers };
}

const inventories = new Map();
function inventory(relPath) {
  if (!inventories.has(relPath)) inventories.set(relPath, clauseInventory(relPath));
  return inventories.get(relPath);
}

// ---------- 1. 编号引用 ----------
init('编号引用');
{
  const defined = new Set();
  for (const [relPath, doc] of docs) {
    if (!relPath.startsWith(PUNISHMENT_DIR.split('\\').join('/') + '/')) continue;
    for (const m of doc.text.matchAll(ID_DEF_RE)) defined.add(m[1]);
  }

  for (const [relPath, doc] of docs) {
    doc.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(ID_RE)) {
        currentSection.checked++;
        if (!defined.has(m[0])) {
          err(`${relPath}:${i + 1}`, `引用了不存在的处罚编号 ${red(m[0])}`);
        }
      }
    });
  }
}

// ---------- 2. 章节引用 ----------
init('章节引用');
{
  // 匹配 "玩家守则 8.4.1" / "《管理员条例》第十二条" / "地铁条例 4.1.3"
  const refRe = new RegExp(
    `(?:${DOC_ALIASES.map(([a]) => a).join('|')})\\s*[》\\]]*\\s*(${CLAUSE_RE.source}|\\d+(?:\\.\\d+)+)`,
    'g',
  );
  // 别名的长优先匹配（"地铁乘车管理条例" 先于 "地铁条例"）
  const aliasSorted = [...DOC_ALIASES].sort((a, b) => b[0].length - a[0].length);

  for (const [relPath, doc] of docs) {
    doc.text.split('\n').forEach((line, i) => {
      // 去掉行内链接的书写形式（[文本](路径) → 文本），避免路径文字干扰引用匹配；
      // 同时跳过缩进代码块
      if (/^\s{4,}/.test(line)) return;
      const cleaned = line.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1');
      for (const m of cleaned.matchAll(refRe)) {
        const alias = aliasSorted.find(([a]) => m[0].startsWith(a));
        if (!alias) continue;
        const target = alias[1];
        const ref = m[1];

        // "处罚细目表" 不是条款容器，仅检查文档存在
        if (target === '规则/处罚细目表.md') continue;

        currentSection.checked++;
        const inv = inventory(target);
        if (!inv) {
          err(`${relPath}:${i + 1}`, `引用目标文档不存在：${target}`);
          continue;
        }

        if (CLAUSE_RE.test(ref)) {
          if (!inv.clauses.has(ref)) {
            err(`${relPath}:${i + 1}`, `${alias[0]} 中不存在 ${red(ref)}`);
          }
        } else {
          const ok = [...inv.numbers].some((n) => n === ref || n.startsWith(ref + '.'));
          if (!ok) {
            err(`${relPath}:${i + 1}`, `${alias[0]} 中不存在条款 ${red(ref)}`);
          }
        }
      }
    });
  }
}

// ---------- 3. 内部链接 ----------
init('内部链接');
{
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;

  for (const [relPath, doc] of docs) {
    const dir = dirname(doc.path);
    doc.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(linkRe)) {
        let target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        target = target.split('#')[0];
        if (!target) continue;

        currentSection.checked++;
        const abs = resolve(dir, decodeURIComponent(target));
        if (!existsSync(abs)) {
          err(`${relPath}:${i + 1}`, `链接目标不存在：${red(target)}`);
        }
      }
    });
  }
}

// ---------- 4. 版本一致 ----------
init('版本一致');
{
  const rowRe = /\[([^\]]+\.md)\]\(([^)]+)\)\s*\|\s*(v\d+\.\d+\.\d+)/g;

  for (const [relPath, doc] of docs) {
    const dir = dirname(doc.path);
    doc.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(rowRe)) {
        const targetRel = rel(resolve(dir, decodeURIComponent(m[2])));
        const targetDoc = docs.get(targetRel);
        if (!targetDoc) continue;

        currentSection.checked++;
        const headVersion = targetDoc.text.slice(0, 600).match(/v\d+\.\d+\.\d+/)?.[0];
        if (!headVersion) {
          err(`${relPath}:${i + 1}`, `${m[1]} 文档头部缺少版本号，无法比对`);
        } else if (headVersion !== m[3]) {
          err(
            `${relPath}:${i + 1}`,
            `${m[1]}：矩阵标注 ${red(m[3])}，文档头部为 ${yellow(headVersion)}`,
          );
        }
      }
    });
  }
}

// ---------- 5. 头部规范 ----------
init('头部规范');
{
  for (const [relPath, doc] of docs) {
    if (!RULE_DOCS.has(basename(relPath))) continue;
    currentSection.checked++;

    const head = doc.text.slice(0, 600);
    if (!/v\d+\.\d+\.\d+/.test(head)) {
      err(relPath, '头部 600 字内缺少版本号（形如 v1.0.0）');
    }
    if (!/更新日期：\*{0,2}\s*\d{4}\.\d{1,2}\.\d{1,2}/.test(head)) {
      err(relPath, '头部 600 字内缺少"更新日期：YYYY.MM.DD"');
    }
  }
}

// ---------- 输出 ----------
if (USE_JSON) {
  console.log(
    JSON.stringify(
      {
        ok: problems.length === 0,
        total: sections.reduce((n, s) => n + s.problems.length, 0),
        sections: sections.map((s) => ({
          name: s.name,
          checked: s.checked,
          problems: s.problems,
        })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(dim(`检查目录：${ROOT}`));
  console.log('');
  for (const s of sections) {
    const count = s.problems.length;
    const badge = count === 0 ? green('通过') : red(`${count} 处问题`);
    console.log(`${s.name}  ${badge}  ${dim(`（检查 ${s.checked} 项）`)}`);
    for (const p of s.problems) {
      console.log(`  ${red('✗')} ${p.where}  ${p.message}`);
    }
  }
  console.log('');
  if (problems.length === 0) {
    console.log(green('✓ 文档一致性检查通过'));
  } else {
    console.log(red(`✗ 共发现 ${problems.length} 处问题`));
  }
}

process.exit(problems.length === 0 ? 0 : 1);

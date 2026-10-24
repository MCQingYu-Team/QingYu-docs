import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = 'https://github.com/MCQingYu-Team/QingYu-docs';
const BRANCH = 'main';
const BASE = '/';

/** 源文件路径 → 站点路径：规则/ 前缀去掉，规则/index.md 即首页 */
const rewrite = (src) => (src === '规则/index.md' ? 'index.md' : src.replace(/^规则\//, ''));
const isPage = (src) => (src.startsWith('规则/') && src !== '规则/404.md') || src === '服务器信息.md';
const link = (src) => '/' + rewrite(src).replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');

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

/**
 * 文档里的链接按源文件目录书写（GitHub 上可直接点）。这里统一改成站点绝对路径；
 * 指向非页面文件（CHANGELOG.md、LICENSE 等）的链接改为 GitHub 地址。
 */
function repoLinks(md) {
  md.core.ruler.push('qingyu-repo-links', (state) => {
    const file = state.env.realPath || state.env.path;
    if (!file) return;
    const fromDir = dirname(file);
    const fix = (token) => {
      if (token.type !== 'link_open') return;
      const href = token.attrGet('href');
      if (!href || /^([a-z]+:|#|\/)/i.test(href)) return;
      const [target, hash] = href.split('#');
      const repoPath = relative(ROOT, resolve(fromDir, decodeURIComponent(target))).split('\\').join('/');
      const suffix = hash ? `#${hash}` : '';
      if (isPage(repoPath) && existsSync(resolve(ROOT, repoPath))) {
        token.attrSet('href', '/' + rewrite(repoPath) + suffix);
      } else {
        token.attrSet('href', `${REPO_URL}/blob/${BRANCH}/${encodeURI(repoPath)}${suffix}`);
      }
    };
    for (const token of state.tokens) {
      fix(token);
      token.children?.forEach(fix);
    }
  });
}

export default withMermaid(
  defineConfig({
    lang: 'zh-CN',
    title: '清屿服务器文档',
    description: '清屿服务器官方文档：入服指南、玩家守则、管理员条例、地铁条例、身份与治理条例与处罚细目',
    base: BASE,
    outDir: 'site',
    lastUpdated: true,
    sitemap: { hostname: 'https://wiki.aqcraft.cn' },

    srcExclude: ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/**', '规则/404.md'],
    rewrites: {
      '规则/index.md': 'index.md',
      '规则/:path(.*)': ':path',
    },

    head: [
      ['link', { rel: 'icon', type: 'image/png', href: `${BASE}logo.png` }],
      ['link', { rel: 'apple-touch-icon', href: `${BASE}logo.png` }],
      ['meta', { name: 'theme-color', content: '#0d9488' }],
    ],

    markdown: {
      anchor: { slugify },
      config: repoLinks,
    },

    themeConfig: {
      logo: '/logo.png',
      siteTitle: '清屿服务器',

      nav: [
        { text: '主页', link: '/' },
        { text: '快速开始', link: link('规则/指南/选择客户端.md'), activeMatch: '^/(指南/|服务器信息)' },
        { text: '规则', link: link('规则/清屿服务器玩家守则.md'), activeMatch: '^/清屿服务器' },
        { text: '处罚', link: link('规则/处罚细目表.md'), activeMatch: '^/处罚细目' },
        { text: '官网', link: 'https://www.aqcraft.cn' },
      ],

      sidebar: [
        {
          text: '快速开始',
          items: [
            { text: '选择客户端', link: link('规则/指南/选择客户端.md') },
            { text: '入服与绑定', link: link('规则/指南/入服与绑定.md') },
            { text: '常见问题', link: link('规则/指南/常见问题.md') },
            { text: '服务器信息', link: link('服务器信息.md') },
          ],
        },
        {
          text: '规则',
          items: [
            { text: '玩家守则', link: link('规则/清屿服务器玩家守则.md') },
            { text: '管理员条例', link: link('规则/清屿服务器管理员条例.md') },
            { text: '地铁乘车管理条例', link: link('规则/清屿服务器地铁乘车管理条例.md') },
            { text: '玩家身份与治理条例', link: link('规则/清屿服务器玩家身份与治理条例.md') },
            { text: '七日阳光流程', link: link('规则/清屿服务器七日阳光流程.md') },
          ],
        },
        {
          text: '处罚',
          items: [
            { text: '处罚细目表', link: link('规则/处罚细目表.md') },
            { text: '01 语言类', link: link('规则/处罚细目/01-语言类.md') },
            { text: '02 破坏类', link: link('规则/处罚细目/02-破坏类.md') },
            { text: '03 作弊类', link: link('规则/处罚细目/03-作弊类.md') },
            { text: '04 经济类', link: link('规则/处罚细目/04-经济类.md') },
            { text: '05 账号类', link: link('规则/处罚细目/05-账号类.md') },
            { text: '06 管理类', link: link('规则/处罚细目/06-管理类.md') },
            { text: '07 群聊社区', link: link('规则/处罚细目/07-群聊社区.md') },
          ],
        },
      ],

      socialLinks: [{ icon: 'github', link: REPO_URL }],

      editLink: {
        pattern: `${REPO_URL}/edit/${BRANCH}/:path`,
        text: '在 GitHub 上编辑此页',
      },

      footer: {
        message: '规则文档依据清屿服务器规则许可协议发布 · 修订须遵循七日阳光流程',
        copyright: 'Copyright © 2026 清屿运营团队 · QQ 群 1102137231',
      },

      search: {
        provider: 'local',
        options: {
          translations: {
            button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
            modal: {
              displayDetails: '显示详细列表',
              resetButtonTitle: '清除查询',
              backButtonTitle: '关闭搜索',
              noResultsText: '没有找到结果',
              footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
            },
          },
        },
      },

      outline: { level: [2, 3], label: '本页目录' },
      docFooter: { prev: '上一页', next: '下一页' },
      lastUpdated: { text: '最后更新' },
      notFound: {
        title: '页面走丢了',
        quote: '这个地址没有对应的规则文档。可能是链接写错了，或者那一页在改版时被并到了别处。',
        linkText: '回首页',
      },
      langMenuLabel: '语言',
      returnToTopLabel: '回到顶部',
      sidebarMenuLabel: '菜单',
      darkModeSwitchLabel: '外观',
      lightModeSwitchTitle: '切换到浅色模式',
      darkModeSwitchTitle: '切换到深色模式',
      skipToContentLabel: '跳到正文',
    },

    mermaid: {},
  }),
);

/* 清屿服务器文档 · 静态站交互
   深色模式、移动端菜单与侧边栏、站内搜索、大纲高亮 */
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var base = window.SITE_BASE || '';

  /* ---------- 深色模式 ---------- */
  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var dark = root.classList.toggle('dark');
      try {
        localStorage.setItem('qy-theme', dark ? 'dark' : 'light');
      } catch (e) {}
    });
  }

  /* ---------- 移动端顶栏菜单 ---------- */
  var menuBtn = document.getElementById('menu-btn');
  var mobileNav = document.getElementById('mobile-nav');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', function () {
      var open = mobileNav.hidden;
      mobileNav.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------- 侧边栏抽屉（窄屏） ---------- */
  var navBtn = document.getElementById('nav-btn');

  function closeNav() {
    body.classList.remove('nav-open');
    if (navBtn) navBtn.setAttribute('aria-expanded', 'false');
  }

  if (navBtn) {
    navBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = body.classList.toggle('nav-open');
      navBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (body.classList.contains('nav-open') && !e.target.closest('.sidebar')) closeNav();
    });
  }

  var topBtn = document.getElementById('top-btn');
  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 站内搜索 ---------- */
  var data = window.SITE_SEARCH || [];
  var overlay = document.getElementById('search');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var hits = [];
  var cursor = -1;
  var lastFocus = null;

  function openSearch() {
    if (!overlay) return;
    closeNav();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    input.value = '';
    render('');
    input.focus();
  }

  function closeSearch() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      hits = data.slice(0, 12);
    } else {
      hits = data
        .filter(function (e) {
          return (
            e.t.toLowerCase().indexOf(q) >= 0 ||
            e.h.toLowerCase().indexOf(q) >= 0 ||
            e.s.toLowerCase().indexOf(q) >= 0
          );
        })
        .slice(0, 40);
    }
    cursor = hits.length ? 0 : -1;

    if (!hits.length) {
      results.innerHTML = '<div class="search__empty">没有找到匹配的内容</div>';
      return;
    }
    // 索引里的地址相对站点根目录，子目录页面需要补上 base
    results.innerHTML = hits
      .map(function (e, i) {
        return (
          '<a class="search__hit' +
          (i === 0 ? ' search__hit--active' : '') +
          '" href="' +
          escapeHtml(base + e.u) +
          '"><b>' +
          escapeHtml(e.h) +
          '</b><small>' +
          escapeHtml(e.t) +
          ' · ' +
          escapeHtml(e.s.slice(0, 90)) +
          '</small></a>'
        );
      })
      .join('');
  }

  function move(delta) {
    if (!hits.length) return;
    cursor = (cursor + delta + hits.length) % hits.length;
    var nodes = results.querySelectorAll('.search__hit');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('search__hit--active', i === cursor);
    }
    if (nodes[cursor]) nodes[cursor].scrollIntoView({ block: 'nearest' });
  }

  var searchBtn = document.getElementById('search-btn');
  if (searchBtn) searchBtn.addEventListener('click', openSearch);
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSearch();
    });
  }
  if (input) {
    input.addEventListener('input', function () {
      render(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter' && hits[cursor]) {
        window.location.href = base + hits[cursor].u;
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeSearch();
      closeNav();
    }
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (!typing && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
      e.preventDefault();
      openSearch();
    }
  });

  /* ---------- 大纲高亮 ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) {
      map[decodeURIComponent(a.getAttribute('href').slice(1))] = a;
    });
    var current = null;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var link = map[entry.target.id];
          if (!link || link === current) return;
          if (current) current.classList.remove('toc-link--active');
          link.classList.add('toc-link--active');
          current = link;
        });
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();

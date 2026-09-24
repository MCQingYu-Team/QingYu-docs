/* 清屿服务器规则 · 静态站交互
   亮暗切换、移动端导航、站内搜索、页内目录高亮 */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- 主题 ---------- */
  function applyTheme(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem('qy-theme', theme); } catch (e) {}
  }

  var saved = null;
  try { saved = localStorage.getItem('qy-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    applyTheme('light');
  }

  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- 移动端导航 ---------- */
  var menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('nav-open')) return;
      if (e.target.closest('.sidebar') || e.target.closest('#menu-btn')) return;
      document.body.classList.remove('nav-open');
    });
  }

  /* ---------- 站内搜索 ---------- */
  var data = window.SITE_SEARCH || [];
  var overlay = document.getElementById('search');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var hits = [];
  var cursor = -1;

  function openSearch() {
    if (!overlay) return;
    overlay.hidden = false;
    input.value = '';
    render('');
    input.focus();
  }

  function closeSearch() {
    if (!overlay) return;
    overlay.hidden = true;
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
    results.innerHTML = hits
      .map(function (e, i) {
        return (
          '<a class="search__hit' + (i === 0 ? ' search__hit--active' : '') + '" href="' + e.u + '">' +
          '<b>' + escapeHtml(e.h) + '</b>' +
          '<small>' + escapeHtml(e.t) + ' · ' + escapeHtml(e.s.slice(0, 90)) + '</small>' +
          '</a>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && hits[cursor]) { window.location.href = hits[cursor].u; }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSearch();
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (!typing && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
      e.preventDefault();
      openSearch();
    }
  });

  /* ---------- 页内目录高亮 ---------- */
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
      { rootMargin: '-80px 0px -70% 0px' }
    );
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();

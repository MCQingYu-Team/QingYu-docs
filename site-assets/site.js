/* 清屿服务器规则 · 静态站交互
   左侧文档栏、站内搜索、页内目录高亮 */
(function () {
  'use strict';

  /* ---------- 左侧文档栏（窄屏从左侧滑出） ---------- */
  var navBtn = document.getElementById('nav-btn');

  function closeNav() {
    document.body.classList.remove('nav-open');
  }

  if (navBtn) {
    navBtn.addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('nav-open')) return;
      // 点遮罩或栏外任意处收起，点按钮与栏内链接不处理
      if (e.target.closest('.sidebar') || e.target.closest('#nav-btn')) return;
      closeNav();
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
    closeNav();
    overlay.hidden = false;
    input.value = '';
    render('');
    input.focus();
  }

  function closeSearch() {
    if (!overlay) return;
    overlay.hidden = true;
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
    results.innerHTML = hits
      .map(function (e, i) {
        return (
          '<a class="search__hit' +
          (i === 0 ? ' search__hit--active' : '') +
          '" href="' +
          e.u +
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
        window.location.href = hits[cursor].u;
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
      { rootMargin: '-80px 0px -70% 0px' },
    );
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();

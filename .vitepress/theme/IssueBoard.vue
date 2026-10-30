<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const REPO = 'MCQingYu-Team/QY-SERVER-IUSSE';
const REFRESH_MS = 5 * 60 * 1000;
// 未登录的 GitHub API 每个 IP 每小时 60 次，缓存避免频繁切页时重复请求
const CACHE_KEY = 'qy-issue-board';
const CACHE_MS = 2 * 60 * 1000;

const open = ref([]);
const closed = ref([]);
const loading = ref(true);
const error = ref('');
const updatedAt = ref(null);
let timer;

const api = (state, n) =>
  fetch(`https://api.github.com/repos/${REPO}/issues?state=${state}&per_page=${n}&sort=updated`, {
    headers: { Accept: 'application/vnd.github+json' },
  }).then((r) => {
    if (r.status === 403 || r.status === 429) throw new Error('GitHub 接口访问过于频繁，请稍后再试');
    if (!r.ok) throw new Error(`GitHub 接口返回 ${r.status}`);
    return r.json();
  });

const slim = (list) =>
  list
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      user: i.user?.login,
      labels: i.labels.map((l) => ({ name: l.name, color: l.color })),
      assignees: i.assignees.map((a) => a.login),
      comments: i.comments,
      created: i.created_at,
      updated: i.updated_at,
      closed: i.closed_at,
    }));

async function load(force = false) {
  error.value = '';
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (!force && cached && Date.now() - cached.at < CACHE_MS) {
      apply(cached);
      return;
    }
    const [o, c] = await Promise.all([api('open', 100), api('closed', 15)]);
    const data = { at: Date.now(), open: slim(o), closed: slim(c).slice(0, 10) };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    apply(data);
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

function apply(data) {
  open.value = data.open;
  closed.value = data.closed;
  updatedAt.value = new Date(data.at);
  loading.value = false;
}

const PRIORITY = { 'priority: urgent': 0, 'priority: high': 1 };
const rank = (i) => Math.min(2, ...i.labels.map((l) => PRIORITY[l.name] ?? 2));
const sortedOpen = computed(() =>
  [...open.value].sort((a, b) => rank(a) - rank(b) || new Date(b.updated) - new Date(a.updated)),
);
const inProgress = computed(() => sortedOpen.value.filter((i) => i.assignees.length));
const waiting = computed(() => sortedOpen.value.filter((i) => !i.assignees.length));

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}
const textColor = (hex) => {
  const n = parseInt(hex, 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#1f2328' : '#fff';
};

onMounted(() => {
  load();
  timer = setInterval(() => document.visibilityState === 'visible' && load(true), REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="qy-issues">
    <div class="qy-issues-bar">
      <span class="qy-issues-stat"><strong>{{ open.length }}</strong> 个问题未关闭</span>
      <span v-if="updatedAt" class="qy-issues-time">更新于 {{ updatedAt.toLocaleTimeString('zh-CN') }}，每 5 分钟自动刷新</span>
      <button type="button" class="qy-issues-refresh" :disabled="loading" @click="loading = true; load(true)">
        {{ loading ? '加载中' : '刷新' }}
      </button>
    </div>

    <p v-if="error" class="qy-issues-error" role="alert">
      {{ error }}。也可以直接去 <a :href="`https://github.com/${REPO}/issues`" target="_blank" rel="noopener">GitHub</a> 查看。
    </p>
    <p v-else-if="loading && !updatedAt" class="qy-issues-empty">正在从 GitHub 获取问题列表</p>

    <template v-if="updatedAt">
      <template v-for="group in [
        { title: '处理中', hint: '已有负责人跟进', list: inProgress },
        { title: '待处理', hint: '已收到，等待分配', list: waiting },
        { title: '最近已关闭', hint: '最近 10 条', list: closed, done: true },
      ]" :key="group.title">
        <h2 class="qy-issues-h">{{ group.title }} <small>{{ group.list.length }} · {{ group.hint }}</small></h2>
        <p v-if="!group.list.length" class="qy-issues-empty">暂无</p>
        <ul v-else class="qy-issues-list">
          <li v-for="i in group.list" :key="i.number" :class="{ done: group.done }">
            <a :href="i.url" target="_blank" rel="noopener" class="qy-issues-title">
              <span class="qy-issues-num">#{{ i.number }}</span>{{ i.title }}
            </a>
            <span class="qy-issues-labels">
              <span v-for="l in i.labels" :key="l.name" class="qy-issues-label"
                :style="{ background: `#${l.color}`, color: textColor(l.color) }">{{ l.name }}</span>
            </span>
            <span class="qy-issues-meta">
              {{ i.user }} 提交于 {{ ago(i.created) }}
              <template v-if="i.assignees.length"> · 负责人 {{ i.assignees.join('、') }}</template>
              <template v-if="i.comments"> · {{ i.comments }} 条评论</template>
              <template v-if="group.done"> · 关闭于 {{ ago(i.closed) }}</template>
              <template v-else> · 更新于 {{ ago(i.updated) }}</template>
            </span>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.qy-issues-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 16px 0 8px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.qy-issues-stat strong {
  font-size: 1.25em;
  color: var(--vp-c-brand-1);
}
.qy-issues-time {
  flex: 1;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.qy-issues-refresh {
  padding: 4px 14px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-size: 14px;
}
.qy-issues-refresh:hover:not(:disabled) {
  background: var(--vp-c-brand-soft);
}
.qy-issues-refresh:disabled {
  opacity: 0.6;
}
.qy-issues-refresh:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.qy-issues-error {
  color: var(--vp-c-danger-1);
}
.qy-issues-empty {
  color: var(--vp-c-text-2);
}
.vp-doc h2.qy-issues-h {
  margin-top: 32px;
  padding-top: 16px;
}
.qy-issues-h small {
  margin-left: 6px;
  font-size: 13px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}
.vp-doc ul.qy-issues-list {
  list-style: none;
  padding: 0;
}
.vp-doc .qy-issues-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin: 0;
  padding: 12px 4px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.qy-issues-list li.done .qy-issues-title {
  color: var(--vp-c-text-2);
}
.vp-doc a.qy-issues-title {
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-decoration: none;
}
.vp-doc a.qy-issues-title:hover {
  color: var(--vp-c-brand-1);
}
.qy-issues-num {
  margin-right: 6px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}
.qy-issues-labels {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.qy-issues-label {
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 20px;
}
.qy-issues-meta {
  flex-basis: 100%;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>

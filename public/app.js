const state = {
  query: '',
  source: 'all',
  tag: 'all',
  sources: [],
  news: [],
  loading: false
};

const filters = document.querySelector('#filters');
const searchInput = document.querySelector('#searchInput');
const sourceSelect = document.querySelector('#sourceSelect');
const tagSelect = document.querySelector('#tagSelect');
const refreshButton = document.querySelector('#refreshButton');
const sourceSummary = document.querySelector('#sourceSummary');
const sourceList = document.querySelector('#sourceList');
const feedMeta = document.querySelector('#feedMeta');
const newsList = document.querySelector('#newsList');
const newsTemplate = document.querySelector('#newsTemplate');
const signalCanvas = document.querySelector('#signalCanvas');

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

init();

function init() {
  bindEvents();
  loadAll();
  window.setInterval(loadAll, 5 * 60 * 1000);
}

function bindEvents() {
  filters.addEventListener('submit', (event) => {
    event.preventDefault();
    loadNews();
  });

  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value.trim();
    loadNews();
  }, 250));

  sourceSelect.addEventListener('change', () => {
    state.source = sourceSelect.value;
    loadNews();
  });

  tagSelect.addEventListener('change', () => {
    state.tag = tagSelect.value;
    loadNews();
  });

  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = '...';

    try {
      await api('/api/refresh', { method: 'POST' });
      await loadAll();
    } catch (error) {
      showEmpty(`刷新失败：${error.message}`);
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = '↻';
    }
  });
}

async function loadAll() {
  state.loading = true;
  feedMeta.textContent = '正在拉取 RSS 来源...';

  try {
    const [sourceData] = await Promise.all([
      api('/api/sources'),
      loadNews()
    ]);
    state.sources = sourceData.sources || [];
    renderSources(sourceData);
    renderFilterOptions();

    if (!sourceData.updatedAt && !state.news.length) {
      window.setTimeout(loadAll, 3500);
    }
  } catch (error) {
    showEmpty(`加载失败：${error.message}`);
  } finally {
    state.loading = false;
  }
}

async function loadNews() {
  const params = new URLSearchParams({
    q: state.query,
    source: state.source,
    tag: state.tag,
    limit: '120'
  });

  const data = await api(`/api/news?${params.toString()}`);
  state.news = data.news || [];
  renderNews(data);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      accept: 'application/json'
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function renderFilterOptions() {
  const currentSource = sourceSelect.value || 'all';
  const currentTag = tagSelect.value || 'all';
  const tags = [...new Set(state.sources.flatMap((source) => source.tags || []))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  replaceOptions(sourceSelect, [
    { value: 'all', label: '全部来源' },
    ...state.sources.map((source) => ({
      value: source.id,
      label: source.name
    }))
  ], currentSource);

  replaceOptions(tagSelect, [
    { value: 'all', label: '全部标签' },
    ...tags.map((tag) => ({
      value: tag,
      label: tag
    }))
  ], currentTag);
}

function replaceOptions(select, options, selectedValue) {
  select.replaceChildren(...options.map((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === selectedValue;
    return option;
  }));

  if (!options.some((item) => item.value === selectedValue)) {
    select.value = 'all';
  }
}

function renderSources(data) {
  const sources = data.sources || [];
  const okCount = sources.filter((source) => source.status === 'ok').length;
  sourceSummary.textContent = `${okCount}/${sources.length} 正常`;

  sourceList.replaceChildren(...sources.map((source) => {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.dataset.status = source.status;
    row.title = source.error || source.url;

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = source.name;

    const count = document.createElement('span');
    count.className = 'source-count';
    const retained = Number(source.retainedCount || source.count || 0);
    count.textContent = `${retained} 条`;

    row.append(dot, name, count);
    return row;
  }));

  drawSignal(sources);
}

function renderNews(data) {
  const news = data.news || [];
  const updatedAt = data.updatedAt ? fullDateFormatter.format(new Date(data.updatedAt)) : '等待首次刷新';
  feedMeta.textContent = `${news.length} 条结果 · 最近刷新 ${updatedAt}`;

  if (!news.length) {
    showEmpty('暂无匹配资讯。可以换个关键词，或等待 RSS 源刷新。');
    return;
  }

  newsList.replaceChildren(...news.map((item) => {
    const node = newsTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector('a');
    const source = node.querySelector('.source-pill');
    const time = node.querySelector('time');
    const summary = node.querySelector('.summary');
    const tagRow = node.querySelector('.tag-row');

    link.href = item.url;
    link.textContent = item.title;
    source.textContent = item.source.name;
    time.dateTime = item.publishedAt;
    time.textContent = dateFormatter.format(new Date(item.publishedAt));
    summary.textContent = item.summary || '原文未提供摘要。';

    tagRow.replaceChildren(...(item.tags || []).map((tag) => {
      const tagNode = document.createElement('span');
      tagNode.className = 'tag';
      tagNode.textContent = tag;
      return tagNode;
    }));

    return node;
  }));
}

function showEmpty(message) {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = message;
  newsList.replaceChildren(empty);
}

function drawSignal(sources) {
  const canvas = signalCanvas;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#07100f';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(51, 242, 220, 0.16)';
  context.lineWidth = 1;
  for (let x = 18; x < width; x += 34) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 18; y < height; y += 34) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(51, 242, 220, 0.32)';
  context.lineWidth = 2;

  sources.forEach((source, index) => {
    const angle = (Math.PI * 2 * index / Math.max(sources.length, 1)) - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(x, y);
    context.stroke();

    context.beginPath();
    context.fillStyle = source.status === 'ok' ? '#57f28f' : '#ff645f';
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fill();
  });

  context.beginPath();
  context.fillStyle = '#33f2dc';
  context.arc(centerX, centerY, 16, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#e9fffb';
  context.font = 'bold 18px Microsoft YaHei, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('RSS', centerX, centerY + 42);
}

function debounce(callback, delay) {
  let timer = null;

  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

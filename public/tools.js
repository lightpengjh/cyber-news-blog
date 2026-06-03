const TAG_ORDER = [
  '效率软件',
  '环境基础',
  'Web工具',
  '编码解密',
  '文本工具',
  '隐写工具',
  '取证工具',
  'MISC解题',
  '密码学',
  '逆向工具',
  'PWN工具',
  'AWD工具'
];

const toolState = {
  tools: [],
  query: '',
  activeTags: new Set()
};

const toolGrid = document.querySelector('#toolGrid');
const toolEmpty = document.querySelector('#toolEmpty');
const tagBar = document.querySelector('#tagBar');
const searchInput = document.querySelector('#toolSearchInput');
const clearSearch = document.querySelector('#clearToolSearch');
const toolCount = document.querySelector('#toolCount');
const visibleCount = document.querySelector('#visibleCount');
const toolCountInline = document.querySelector('#toolCountInline');
const visibleCountInline = document.querySelector('#visibleCountInline');

let debounceTimer = null;

initTools();

function initTools() {
  if (!toolGrid || !tagBar) return;

  bindToolEvents();
  loadTools();
}

function bindToolEvents() {
  tagBar.addEventListener('click', (event) => {
    const button = event.target.closest('.tag-filter');
    if (!button) return;

    const tag = button.dataset.tag;
    if (tag === 'all') {
      toolState.activeTags.clear();
    } else if (toolState.activeTags.has(tag)) {
      toolState.activeTags.delete(tag);
    } else {
      toolState.activeTags.add(tag);
    }

    renderTagState();
    renderTools();
  });

  searchInput.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      toolState.query = searchInput.value.trim();
      clearSearch.classList.toggle('is-visible', Boolean(toolState.query));
      renderTools();
    }, 160);
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    toolState.query = '';
    clearSearch.classList.remove('is-visible');
    renderTools();
    searchInput.focus();
  });
}

async function loadTools() {
  try {
    const response = await fetch('/tools-data.json', {
      headers: {
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    toolState.tools = Array.isArray(data) ? data : [];
    setCount(toolCount, toolState.tools.length);
    setCount(toolCountInline, toolState.tools.length);
    buildTagBar();
    renderTools();
  } catch (error) {
    toolGrid.replaceChildren();
    toolEmpty.textContent = `工具数据加载失败：${error.message}`;
    toolEmpty.classList.add('is-visible');
  }
}

function buildTagBar() {
  const tagSet = new Set();
  toolState.tools.forEach((tool) => {
    (tool.tags || []).forEach((tag) => tagSet.add(tag));
  });

  const orderedTags = [
    ...TAG_ORDER.filter((tag) => tagSet.has(tag)),
    ...[...tagSet].filter((tag) => !TAG_ORDER.includes(tag)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  ];

  const fragment = document.createDocumentFragment();
  orderedTags.forEach((tag) => {
    const button = document.createElement('button');
    button.className = 'tag-filter';
    button.type = 'button';
    button.dataset.tag = tag;
    button.textContent = tag;
    fragment.append(button);
  });

  tagBar.append(fragment);
}

function renderTagState() {
  const hasActiveTags = toolState.activeTags.size > 0;

  tagBar.querySelectorAll('.tag-filter').forEach((button) => {
    const tag = button.dataset.tag;
    const isActive = tag === 'all' ? !hasActiveTags : toolState.activeTags.has(tag);
    button.classList.toggle('is-active', isActive);
  });
}

function renderTools() {
  const filtered = filterTools();
  setCount(visibleCount, filtered.length);
  setCount(visibleCountInline, filtered.length);

  if (!filtered.length) {
    toolGrid.replaceChildren();
    toolEmpty.textContent = '没有找到匹配的工具。';
    toolEmpty.classList.add('is-visible');
    return;
  }

  toolEmpty.classList.remove('is-visible');
  toolGrid.replaceChildren(...filtered.map(createToolCard));
}

function filterTools() {
  const keywords = toolState.query.toLowerCase().split(/\s+/).filter(Boolean);

  return toolState.tools.filter((tool) => {
    const tags = tool.tags || [];
    const haystack = [tool.name, tool.desc, ...tags].join(' ').toLowerCase();
    const matchesQuery = keywords.every((keyword) => haystack.includes(keyword));
    const matchesTag = !toolState.activeTags.size || tags.some((tag) => toolState.activeTags.has(tag));
    return matchesQuery && matchesTag;
  });
}

function createToolCard(tool) {
  const card = document.createElement('article');
  card.className = 'tool-card';

  const tags = document.createElement('div');
  tags.className = 'tool-tags';
  (tool.tags || []).forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    tags.append(pill);
  });

  const title = document.createElement('h3');
  title.textContent = tool.name || '未命名工具';

  const description = document.createElement('p');
  description.textContent = tool.desc || '暂无描述。';

  const link = createToolLink(tool.url);

  card.append(tags, title, description, link);
  return card;
}

function createToolLink(url) {
  const hasUrl = typeof url === 'string' && url.trim() && url.trim() !== '#';
  const link = document.createElement(hasUrl ? 'a' : 'span');
  link.className = `tool-link${hasUrl ? '' : ' is-disabled'}`;
  link.textContent = hasUrl ? '访问项目' : '暂无链接';

  if (hasUrl) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  return link;
}

function setCount(node, count) {
  if (node) node.textContent = String(count);
}

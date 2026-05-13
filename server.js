const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const express = require('express');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser();

const PORT = Number(process.env.PORT || 3000);
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_NEWS_ITEMS = 300;
const CACHE_PATH = path.join(__dirname, 'data', 'news-cache.json');

const SOURCES = [
  {
    id: 'freebuf',
    name: 'FreeBuf',
    url: 'https://www.freebuf.com/feed',
    tags: ['漏洞', '攻防', '行业']
  },
  {
    id: 'anquanke',
    name: '安全客',
    url: 'https://api.anquanke.com/data/v1/rss',
    tags: ['安全研究', '漏洞', '攻防']
  },
  {
    id: 'seebug-paper',
    name: 'Seebug Paper',
    url: 'https://paper.seebug.org/rss',
    tags: ['漏洞分析', '研究', '技术文章']
  },
  {
    id: '4hou',
    name: '嘶吼',
    url: 'https://www.4hou.com/feed',
    tags: ['安全资讯', '威胁情报', '行业']
  },
  {
    id: 'secwiki',
    name: 'SecWiki News',
    url: 'https://www.sec-wiki.com/news/rss',
    tags: ['安全资讯', '周报', '导航']
  }
];

let newsItems = [];
let lastRefreshAt = null;
let sourceStatus = SOURCES.map((source) => ({
  id: source.id,
  name: source.name,
  url: source.url,
  tags: source.tags,
  status: 'idle',
  count: 0,
  lastUpdated: null,
  error: null
}));
let refreshInFlight = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '0'
}));

app.get('/api/news', (req, res) => {
  const query = normalize(req.query.q || '');
  const source = normalize(req.query.source || 'all');
  const tag = normalize(req.query.tag || 'all');
  const limit = clampLimit(req.query.limit);

  const filtered = newsItems
    .filter((item) => source === 'all' || item.source.id === source)
    .filter((item) => tag === 'all' || item.tags.some((itemTag) => normalize(itemTag) === tag))
    .filter((item) => {
      if (!query) return true;
      const haystack = normalize([
        item.title,
        item.summary,
        item.source.name,
        ...item.tags
      ].join(' '));
      return haystack.includes(query);
    })
    .slice(0, limit);

  res.json({
    updatedAt: lastRefreshAt,
    count: filtered.length,
    news: filtered
  });
});

app.get('/api/sources', (req, res) => {
  res.json({
    updatedAt: lastRefreshAt,
    refreshIntervalMinutes: Math.round(REFRESH_INTERVAL_MS / 60000),
    sources: sourceStatus
  });
});

app.post('/api/refresh', async (req, res) => {
  try {
    const result = await refreshFeeds('manual');
    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: '刷新失败，请稍后再试。',
      error: error.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function main() {
  await loadCache();
  refreshFeeds('startup').catch((error) => {
    console.error('[rss] startup refresh failed:', error);
  });

  setInterval(() => {
    refreshFeeds('interval').catch((error) => {
      console.error('[rss] scheduled refresh failed:', error);
    });
  }, REFRESH_INTERVAL_MS).unref();

  app.listen(PORT, () => {
    console.log(`Cyber Compass is running at http://localhost:${PORT}`);
  });
}

async function refreshFeeds(reason) {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = refreshFeedsInternal(reason)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function refreshFeedsInternal(reason) {
  const startedAt = new Date().toISOString();
  const results = await Promise.all(SOURCES.map(async (source) => {
    try {
      const items = await fetchSourceItems(source);
      return {
        source,
        status: 'ok',
        items,
        error: null
      };
    } catch (error) {
      return {
        source,
        status: 'error',
        items: [],
        error: readableError(error)
      };
    }
  }));

  const successfulSourceIds = new Set(
    results
      .filter((result) => result.status === 'ok')
      .map((result) => result.source.id)
  );

  const retainedNews = newsItems.filter((item) => !successfulSourceIds.has(item.source.id));
  const freshNews = results.flatMap((result) => result.items);
  newsItems = dedupeNews([...freshNews, ...retainedNews])
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_NEWS_ITEMS);

  sourceStatus = SOURCES.map((source) => {
    const result = results.find((item) => item.source.id === source.id);
    const currentCount = newsItems.filter((item) => item.source.id === source.id).length;

    if (result && result.status === 'ok') {
      return {
        id: source.id,
        name: source.name,
        url: source.url,
        tags: source.tags,
        status: 'ok',
        count: result.items.length,
        retainedCount: currentCount,
        lastUpdated: startedAt,
        error: null
      };
    }

    return {
      id: source.id,
      name: source.name,
      url: source.url,
      tags: source.tags,
      status: 'error',
      count: 0,
      retainedCount: currentCount,
      lastUpdated: findPreviousStatus(source.id)?.lastUpdated || null,
      error: result ? result.error : '未知错误'
    };
  });

  lastRefreshAt = startedAt;
  await saveCache();

  return {
    reason,
    updatedAt: lastRefreshAt,
    total: newsItems.length,
    sources: sourceStatus
  };
}

async function fetchSourceItems(source) {
  const xml = await fetchText(source.url);
  const feed = await parser.parseString(xml);
  const items = Array.isArray(feed.items) ? feed.items : [];

  return items
    .map((item) => normalizeFeedItem(item, source))
    .filter(Boolean);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'user-agent': 'CyberNewsBlog/1.0 (+local learning project)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFeedItem(item, source) {
  const title = toPlainText(item.title);
  const url = safeHttpUrl(item.link || item.guid, source.url);

  if (!title || !url) {
    return null;
  }

  const publishedAt = parseDate(item.isoDate || item.pubDate || item.date || item.updated);
  const summary = truncateText(toPlainText(
    item.contentSnippet ||
    item.summary ||
    item.description ||
    item.content ||
    ''
  ), 220);

  return {
    id: createId(source.id, url, title, publishedAt),
    title,
    summary,
    url,
    source: {
      id: source.id,
      name: source.name
    },
    publishedAt,
    tags: source.tags
  };
}

function dedupeNews(items) {
  const seen = new Map();

  for (const item of items) {
    const key = canonicalNewsKey(item);
    const existing = seen.get(key);

    if (!existing || Date.parse(item.publishedAt) > Date.parse(existing.publishedAt)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}

function canonicalNewsKey(item) {
  try {
    const url = new URL(item.url);
    url.hash = '';
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalize(`${item.source.id}:${item.title}`);
  }
}

function createId(...parts) {
  return crypto
    .createHash('sha1')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 16);
}

function parseDate(value) {
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function safeHttpUrl(rawUrl, baseUrl) {
  if (!rawUrl) return null;

  try {
    const url = new URL(String(rawUrl).trim(), baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function toPlainText(value) {
  if (!value) return '';

  return decodeHtmlEntities(String(value))
    .replace(/<!\[CDATA\[(.*?)\]\]>/gis, '$1')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gis, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];

    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return match;
  });
}

function isValidCodePoint(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
}

function truncateText(text, maxLength) {
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  return `${chars.slice(0, maxLength - 1).join('').trim()}…`;
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 80;
  return Math.min(Math.max(parsed, 1), MAX_NEWS_ITEMS);
}

function readableError(error) {
  if (error.name === 'AbortError') {
    return '请求超时';
  }
  return error.message || '请求失败';
}

function findPreviousStatus(sourceId) {
  return sourceStatus.find((source) => source.id === sourceId);
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const cache = JSON.parse(raw);
    newsItems = Array.isArray(cache.news) ? cache.news : [];
    sourceStatus = Array.isArray(cache.sources) && cache.sources.length
      ? cache.sources
      : sourceStatus;
    lastRefreshAt = cache.updatedAt || null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[cache] failed to load cache:', error.message);
    }
  }
}

async function saveCache() {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify({
    updatedAt: lastRefreshAt,
    news: newsItems,
    sources: sourceStatus
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

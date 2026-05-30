#!/usr/bin/env node
/**
 * AI 新闻日报生成脚本
 * 每天早上 8:00 由 OpenClaw cron 触发
 * 抓取 AI 相关新闻 → 生成 HTML → 推送到 GitHub Pages
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_DIR = '/home/slz/.openclaw/workspace/my-site';
const NEWS_DIR = path.join(SITE_DIR, 'news');
const DATA_DIR = path.join(SITE_DIR, '_data');
// Git 操作由 daily-news.sh 处理，token 从 .github_token 读取

// AI 相关新闻源
const SOURCES = [
  { name: 'Hacker News (AI)', url: 'https://hn.algolia.com/api/v1/search?query=AI+artificial+intelligence&tags=story&hitsPerPage=10' },
  { name: 'arXiv AI', url: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=10' },
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/' },
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractHNItems(json) {
  if (!json || !json.hits) return [];
  return json.hits.map(h => ({
    title: h.title || '',
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: 'Hacker News',
    points: h.points || 0,
    date: h.created_at ? h.created_at.split('T')[0] : '',
  }));
}

function extractArxivItems(xml) {
  if (!xml) return [];
  const items = [];
  const entries = xml.split('<entry>');
  for (const entry of entries.slice(1)) {
    const title = (entry.match(/<title>(.*?)<\/title>/) || [,''])[1].trim();
    const id = (entry.match(/<id>(.*?)<\/id>/) || [,''])[1];
    const summary = (entry.match(/<summary>(.*?)<\/summary>/) || [,''])[1].slice(0, 200) + '...';
    const published = (entry.match(/<published>(.*?)<\/published>/) || [,''])[1];
    items.push({
      title: title.replace(/<[^>]+>/g, ''),
      url: id,
      source: 'arXiv',
      summary: summary.replace(/<[^>]+>/g, ''),
      date: published ? published.split('T')[0] : '',
    });
  }
  return items;
}

function getDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getChineseDate() {
  const d = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
}

async function generateNews() {
  console.log('=== AI 新闻日报生成器 ===');
  console.log(`日期: ${getDateStr()}`);

  // 1. 抓取各源
  const allItems = [];

  try {
    const hnData = await fetchJSON(SOURCES[0].url);
    allItems.push(...extractHNItems(hnData));
    console.log(`Hacker News: ${extractHNItems(hnData).length} 条`);
  } catch (e) { console.log('HN 抓取失败:', e.message); }

  try {
    const arxivXml = await fetchText(SOURCES[1].url);
    allItems.push(...extractArxivItems(arxivXml));
    console.log(`arXiv: ${extractArxivItems(arxivXml).length} 条`);
  } catch (e) { console.log('arXiv 抓取失败:', e.message); }

  // 2. 去重排序
  const seen = new Set();
  const unique = allItems.filter(i => {
    if (!i.title) return false;
    const key = i.title.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 3. 生成 HTML
  const date = getDateStr();
  const chineseDate = getChineseDate();
  const slug = `ai-news-${date}`;
  const newsDateDir = path.join(NEWS_DIR, date);
  fs.mkdirSync(newsDateDir, { recursive: true });

  // 文章页
  let contentHtml = `<h1>🤖 AI 新闻日报 — ${chineseDate}</h1>\n<p>共 ${unique.length} 条 AI 相关动态</p>\n`;
  unique.forEach((item, i) => {
    contentHtml += `<h2>${i + 1}. <a href="${item.url}" target="_blank" rel="noopener">${item.title}</a></h2>\n`;
    contentHtml += `<p><strong>来源:</strong> ${item.source} · ${item.date}</p>\n`;
    if (item.summary) contentHtml += `<p>${item.summary}</p>\n`;
    if (item.points) contentHtml += `<p>👍 ${item.points} 票</p>\n`;
  });

  const articleHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 新闻日报 ${date} - 小智的窝</title>
    <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="/" class="logo">🐕 小智的窝</a>
            <div class="nav-links">
                <a href="/news/">📰 AI 新闻</a>
                <a href="/notes/">📝 工作心得</a>
                <a href="/music/">🎵 AI 音乐</a>
                <a href="/about.html">ℹ️ 关于</a>
            </div>
        </div>
    </nav>
    <section class="container">
        <div class="article-content">${contentHtml}</div>
    </section>
    <footer>
        <div class="container"><p>🦞 Powered by OpenClaw · 每日 8:00 自动更新</p></div>
    </footer>
</body>
</html>`;

  fs.writeFileSync(path.join(newsDateDir, 'index.html'), articleHtml);

  // 更新新闻列表页
  const newsListHtml = generateNewsListPage(date, chineseDate, unique.length);
  fs.writeFileSync(path.join(NEWS_DIR, 'index.html'), newsListHtml);

  console.log(`✅ 生成完毕: ${date} — ${unique.length} 条新闻`);

  // 4. Git 提交推送（由 daily-news.sh 处理）
}

function generateNewsListPage(latestDate, chineseDate, count) {
  // Read existing news dates from _data or directory
  let items = '';
  try {
    const dates = fs.readdirSync(NEWS_DIR)
      .filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/))
      .sort()
      .reverse()
      .slice(0, 30);

    items = dates.map(d => {
      const cDate = `${d.slice(0,4)}年${d.slice(5,7)}月${d.slice(8,10)}日`;
      return `<div class="article-item">
        <h3><a href="/news/${d}/">🤖 AI 新闻日报 — ${cDate}</a></h3>
        <div class="article-meta">${d}</div>
      </div>`;
    }).join('\n');
  } catch (e) {}

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📰 AI 新闻日报 - 小智的窝</title>
    <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="/" class="logo">🐕 小智的窝</a>
            <div class="nav-links">
                <a href="/news/">📰 AI 新闻</a>
                <a href="/notes/">📝 工作心得</a>
                <a href="/music/">🎵 AI 音乐</a>
                <a href="/about.html">ℹ️ 关于</a>
            </div>
        </div>
    </nav>
    <section class="page-header">
        <div class="container">
            <h1>📰 AI 新闻日报</h1>
            <p>每天 8:00 自动更新，涵盖 AI 行业最新动态</p>
        </div>
    </section>
    <section class="articles container">
        ${items || '<div class="empty-state"><div class="icon">🤖</div><p>新闻列表正在生成中，明早 8:00 见！</p></div>'}
    </section>
    <footer>
        <div class="container"><p>🦞 Powered by OpenClaw · 每日 8:00 自动更新</p></div>
    </footer>
</body>
</html>`;
}

generateNews().catch(console.error);

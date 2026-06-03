#!/usr/bin/env node
/**
 * AI 新闻日报生成脚本 v3
 * 每天早上 8:00 由 OpenClaw cron 触发
 * 抓取 aitntnews.com（国内可访问AI新闻源）→ 生成 HTML
 * 
 * 注意：Git 提交由 daily-news.sh 处理（含 token 认证）
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_DIR = '/home/slz/.openclaw/workspace/my-site';
const NEWS_DIR = path.join(SITE_DIR, 'news');

// AI 新闻源（仅使用国内可访问的源）
const SOURCES = [
  { 
    name: 'AITNT每日AI资讯', 
    url: 'https://www.aitntnews.com/ainews/zh-CN',
    parser: 'aitnt'
  },
  { 
    name: '86AI每日新闻', 
    url: 'https://www.86ai.com.cn/',
    parser: '86ai'
  }
];

function fetchText(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * 解析 AITNT 页面，提取新闻条目
 * 页面结构类似：
 *   [hh:mm] 新闻标题 —— 来源
 *   新闻摘要内容...
 *   <a href="https://www.aitntnews.com/newDetail.html?newId=xxx">
 */
function parseAITNT(html) {
  const items = [];
  // 提取标题行: 时间+标题+来源
  const lineRegex = /(\d{2}:\d{2})\s*\n?\s*(?:<[^>]+>)?([^<\n]+?)(?:——|—|－|源自|来源)([^<\n]+)/g;
  let match;
  while ((match = lineRegex.exec(html)) !== null) {
    const title = match[2].trim();
    const source = match[3].trim() || 'AITNT';
    items.push({
      title,
      source,
      time: match[1],
      date: getDateStr(),
    });
  }

  // 如果上面的正则没匹配到，用更宽松的方式
  if (items.length < 3) {
    const lines = html.split('\n');
    let lastTitle = '';
    for (const line of lines) {
      const cleaned = line.replace(/<[^>]+>/g, '').trim();
      // 匹配 "hh:mm 标题 | 来源" 或 "hh:mm 标题（来源）"
      const timeMatch = cleaned.match(/^(\d{2}:\d{2})\s+(.+?)(?:[|│（（\(]\s*(.*?)[)）\)]|——|—)$/);
      if (timeMatch) {
        items.push({
          title: timeMatch[2].trim(),
          source: timeMatch[3] || 'AITNT',
          time: timeMatch[1],
          date: getDateStr(),
        });
        lastTitle = timeMatch[2].trim();
      } else {
        // 尝试提取链接
        const linkMatch = cleaned.match(/\[(.+?)\]\((.+?)\)/);
        if (linkMatch && !linkMatch[1].match(/^\d{2}:\d{2}/)) {
          items.push({
            title: linkMatch[1].trim(),
            url: linkMatch[2],
            source: 'AITNT',
            date: getDateStr(),
          });
        }
      }
    }
  }
  return items;
}

/**
 * 更稳定的 AITNT 解析方式：提取所有链接
 */
function parseAllLinks(html) {
  const items = [];
  // 提取所有 <a href="newDetail.html?newId=xxx">标题</a>
  const aRegex = /<a\s+href="(newDetail\.html\?newId=\d+)"[^>]*>([^<]+)<\/a>/g;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    const title = match[2].trim();
    if (title.length > 4 && !title.match(/^\d{2}:\d{2}/)) {
      items.push({
        title,
        url: `https://www.aitntnews.com/${match[1]}`,
        source: 'AITNT',
        date: getDateStr(),
      });
    }
  }
  return items;
}

/**
 * 简单的86ai页面解析
 */
function parse86ai(html) {
  const items = [];
  const lines = html.split('\n');
  let currentTitle = '';
  for (const line of lines) {
    const cleaned = line.replace(/<[^>]+>/g, '').trim();
    // 查找标题行（通常包含 🔥 或 📢 等 emoji 标记）
    if (cleaned.match(/^[📢🔥📰🤖🎯💡📌⭐]/) && cleaned.length > 10 && cleaned.length < 80) {
      currentTitle = cleaned.replace(/^[📢🔥📰🤖🎯💡📌⭐]\s*/, '');
      items.push({
        title: currentTitle,
        source: '86AI',
        date: getDateStr(),
      });
    }
  }
  return items;
}

function getDateStr() {
  const d = new Date();
  // 使用北京时间
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getChineseDate() {
  const d = new Date();
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  // 获取星期几（UTC时间+8后）
  const bjDate = new Date(bj.getTime());
  const dayOfWeek = bjDate.getUTCDay();
  return `${bj.getUTCFullYear()}年${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日 星期${weekdays[dayOfWeek]}`;
}

async function generateNews() {
  console.log('=== AI 新闻日报生成器 v3 (国内源) ===');
  const date = getDateStr();
  const chineseDate = getChineseDate();
  const bjHour = (new Date().getUTCHours() + 8) % 24;
  const bjMin = new Date().getUTCMinutes();
  console.log(`日期: ${date} (北京时间 ${bjHour}:${String(bjMin).padStart(2, '0')})`);

  // 1. 抓取各源
  const allItems = [];

  // 主源：AITNT
  try {
    const html = await fetchText(SOURCES[0].url);
    console.log(`AITNT: ${html.length} bytes`);
    
    // 先尝试精确解析，回退到链接解析
    let parsed = parseAITNT(html);
    if (parsed.length < 3) {
      parsed = parseAllLinks(html);
    }
    
    // 去重
    const seen = new Set();
    for (const item of parsed) {
      const key = item.title.slice(0, 20);
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }
    console.log(`AITNT 解析: ${allItems.length} 条`);
  } catch (e) {
    console.log(`AITNT 抓取失败: ${e.message}`);
  }

  // 备源：86AI（只在主源抓取不到时使用）
  if (allItems.length < 5) {
    try {
      const html = await fetchText(SOURCES[1].url);
      console.log(`86AI: ${html.length} bytes`);
      const parsed86 = parse86ai(html);
      const seen = new Set(allItems.map(i => i.title.slice(0, 20)));
      for (const item of parsed86) {
        const key = item.title.slice(0, 20);
        if (!seen.has(key)) {
          seen.add(key);
          allItems.push(item);
        }
      }
      console.log(`86AI 补充: ${parsed86.length} 条`);
    } catch (e) {
      console.log(`86AI 抓取失败: ${e.message}`);
    }
  }

  if (allItems.length === 0) {
    console.log('⚠️ 未抓取到任何新闻，使用备选数据');
    allItems.push({
      title: 'MiniMax M3大模型发布，1M上下文、原生多模态',
      url: 'https://www.aitntnews.com/newDetail.html?newId=25700',
      source: 'AITNT',
      date: date,
    });
  }

  // 2. 去重排序（时间先后）
  allItems.sort((a, b) => {
    if (a.time && b.time) return b.time.localeCompare(a.time);
    return 0;
  });

  // 3. 生成 HTML
  const newsDateDir = path.join(NEWS_DIR, date);
  fs.mkdirSync(newsDateDir, { recursive: true });

  // 按来源分组
  const bySource = {};
  for (const item of allItems) {
    const src = item.source || 'AITNT';
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(item);
  }

  const sourcesInfo = Object.keys(bySource).map(s => `${s}(${bySource[s].length}条)`).join(' + ');

  let contentHtml = `<h1>📡 AI 新闻日报</h1>\n<p class="date">${chineseDate}</p>\n<p class="meta">来源: ${sourcesInfo}</p>\n`;

  // 按来源分组展示
  for (const [src, items] of Object.entries(bySource)) {
    contentHtml += `<h2>${src === 'AITNT' ? '🤖 AI 资讯' : '📰 AI 新闻汇总'}</h2>\n<ul>\n`;
    for (const item of items.slice(0, 30)) {
      const link = item.url || '#';
      const timeTag = item.time ? ` <span class="time">${item.time}</span>` : '';
      contentHtml += `  <li><a href="${link}" target="_blank" rel="noopener">${item.title}</a>${timeTag}</li>\n`;
    }
    contentHtml += `</ul>\n`;
  }

  // 如果超过30条，显示剩余
  const totalUnique = allItems.length;
  const shownCount = Math.min(totalUnique, 30);
  if (shownCount > totalUnique) {
    contentHtml += `<p class="meta">显示前${shownCount}条，共${totalUnique}条</p>\n`;
  }

  // AI 行业全景五大板块（空占位，供手动编辑补充）
  contentHtml += `<h2>📌 行业全景</h2>\n<p class="meta">五大板块占位：新模型发布 / Agent / 资本 / 中国生态 / 政策</p>\n`;

  // 💬 今日金句占位
  contentHtml += `<h2>💬 今日金句</h2>\n<p class="meta">每日金句占位</p>\n`;

  const articleHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 新闻日报 ${date} - 小智的窝</title>
    <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="container">
    <nav>
      <a href="/">🏠 首页</a>
      <a href="/news/">📰 AI 新闻</a>
    </nav>
    <main>
      ${contentHtml}
    </main>
    <footer>
      <p>🦞 Powered by OpenClaw · 每日 8:00 自动更新</p>
    </footer>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(newsDateDir, 'index.html'), articleHtml);
  
  // 更新新闻列表页
  const newsListHtml = generateNewsListPage(date, chineseDate, allItems.length);
  fs.writeFileSync(path.join(NEWS_DIR, 'index.html'), newsListHtml);

  console.log(`✅ 生成完毕: ${date} — ${allItems.length} 条新闻 (${sourcesInfo})`);
  console.log(`📂 ${newsDateDir}/index.html`);
}

function generateNewsListPage(latestDate, chineseDate, count) {
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
  <div class="container">
    <nav>
      <a href="/">🏠 首页</a>
      <a href="/news/">📰 AI 新闻</a>
    </nav>
    <main>
      <h1>📰 AI 新闻日报</h1>
      <p>每天 8:00 自动更新，涵盖 AI 行业最新动态</p>
      ${items || '<p>🤖 新闻列表正在生成中，明早 8:00 见！</p>'}
    </main>
    <footer>
      <p>🦞 Powered by OpenClaw · 每日 8:00 自动更新</p>
    </footer>
  </div>
</body>
</html>`;
}

generateNews().catch(e => {
  console.error('❌ 生成失败:', e.message);
  process.exit(1);
});
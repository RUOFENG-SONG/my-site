#!/bin/bash
# 每日 AI 新闻生成脚本
# 由 OpenClaw cron 在每天 8:00 调用

set -e
SITE_DIR="/home/slz/.openclaw/workspace/my-site"
TOKEN_FILE="$SITE_DIR/.github_token"

if [ ! -f "$TOKEN_FILE" ]; then
    echo "❌ Token 文件不存在"
    exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")
DATE=$(date +%Y-%m-%d)
CHINESE_DATE=$(date "+%Y年%m月%d日")

echo "=== AI 新闻日报 $DATE ==="

# 1. 拉取最新代码
cd "$SITE_DIR"
git pull origin main 2>/dev/null || true

# 2. 抓取新闻并生成 HTML（Node.js 脚本不带 token）
node "$SITE_DIR/scripts/generate-news.js" 2>&1 || true

# 3. 提交推送
cd "$SITE_DIR"
git add -A
git diff --quiet && git diff --staged --quiet && echo "没有新内容" && exit 0

git commit -m "📰 AI 新闻日报 $DATE"
git push https://RUOFENG-SONG:${TOKEN}@github.com/RUOFENG-SONG/my-site.git main

echo "✅ 新闻已发布到 https://ruofeng-song.github.io/my-site/news/"

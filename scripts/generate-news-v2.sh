#!/bin/bash
# AI新闻日报 v2
set -e
SITE_DIR="/home/slz/.openclaw/workspace/my-site"
DATE=$(date +%Y-%m-%d)
NEWS_DIR="$SITE_DIR/news/$DATE"
TOKEN_FILE="$SITE_DIR/.github_token"

if [ ! -f "$TOKEN_FILE" ]; then
    echo "Token file not found"
    exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")
mkdir -p "$NEWS_DIR"

NEWS_LIST="$SITE_DIR/news/index.html"
if ! grep -q "$DATE" "$NEWS_LIST" 2>/dev/null; then
    sed -i "s|<ul>|<ul>\n        <li><a href=\"/news/$DATE/\">$DATE</a></li>|" "$NEWS_LIST"
fi

cd "$SITE_DIR"
git add -A
if git diff --quiet && git diff --staged --quiet; then
    echo "No new content"
    exit 0
fi
git commit -m "AI news daily $DATE"
git push "https://RUOFENG-SONG:${TOKEN}@github.com/RUOFENG-SONG/my-site.git" main
echo "Published"

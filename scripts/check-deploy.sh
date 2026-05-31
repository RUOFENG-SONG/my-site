#!/bin/bash
# check-deploy.sh - 检查网站是否有未部署的更改
# 用法：./scripts/check-deploy.sh

cd "$(dirname "$0")/.."

echo "🔍 检查网站部署状态..."
echo ""

# 1. 检查是否有未提交的更改
if ! git diff --quiet HEAD; then
    echo "❌ 有未提交的更改:"
    git diff --stat HEAD
    echo ""
    echo "💡 请运行: git add . && git commit -m '更新内容' && git push"
    exit 1
fi

# 2. 检查是否有未推送的提交
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
    echo "⚠️  没有设置远程仓库 upstream"
    exit 1
fi

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "❌ 本地有未推送的提交:"
    git log --oneline @{u}..HEAD
    echo ""
    echo "💡 请运行: git push origin main"
    exit 1
fi

# 3. 检查关键文件是否存在
for file in index.html assets/style.css news/index.html; do
    if [ ! -f "$file" ]; then
        echo "❌ 关键文件缺失: $file"
        exit 1
    fi
done

echo "✅ 网站状态正常"
echo "   - 所有更改已提交"
echo "   - 所有提交已推送到 GitHub"
echo "   - Vercel 应该已自动部署最新版本"
exit 0

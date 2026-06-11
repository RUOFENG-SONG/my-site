# 小智的窝 - 网站项目完整说明

> 给 Claude/AI 阅读用，目标：帮我解决网站国内无法访问的问题

## 基本信息

| 项目 | 内容 |
|------|------|
| **网站地址** | https://my-site-murex-one.vercel.app/ |
| **GitHub 仓库** | https://github.com/RUOFENG-SONG/my-site |
| **部署方式** | GitHub → Vercel 自动部署（`git push` 即触发） |
| **网页形式** | 纯静态 HTML + CSS（无框架，无后端） |
| **更新频率** | 每日 8:00 自动更新 AI 新闻 |
| **网站用途** | 个人博客/作品展示：AI 新闻日报 + 工作笔记 + AI 音乐 |

---

## 核心问题：国内无法访问

**症状：** 从国内网络访问 `https://my-site-murex-one.vercel.app/` → **HTTP 000（10 秒超时）**

**根因排查结果：**
- `vercel.app` 这个域名（包括所有 `*.vercel.app` 子域名）在中国内地被 **DNS 污染 + SNI 阻断**
- Vercel 的 CDN 节点依赖 Cloudflare / Meta CDN，国内没有直连节点
- 虽然 `vercel.com`（主站域名）国内能通（HTTP 200），但 `*.vercel.app` 统一被阻断
- DNS 解析到的 IP：`69.171.229.73`（Meta/Facebook CDN IP 段），国内直接丢包
- 从 WSL2 和 Windows 原生侧测试，结果一致（都是走国内电信/联通网络）

**影响范围：** 整个网站（首页、新闻页、关于页、所有内页）国内均无法访问

**环境说明：**
- 开发者在中国内地，WSL2 on Windows
- 没有翻墙工具（不能依赖代理）
- 有 GitHub 账号 + Git CLI
- 可以用 GitHub Actions 做 CI/CD
- 有 Tavily API（联网搜索）
- 国内 CDN/OSS 服务（阿里云 OSS、腾讯云 COS）均可通

---

## 项目结构

```
my-site/                      # GitHub 仓库根目录
├── index.html                # 首页（导航 + 卡片入口：AI新闻/工作心得/AI音乐）
├── about.html                # 关于页面
├── assets/
│   └── style.css             # 全局样式（暗黑主题）
├── news/
│   ├── index.html            # AI 新闻列表页
│   └── YYYY-MM-DD/
│       └── index.html        # 每日新闻详情页（自动生成）
├── notes/
│   └── index.html            # 工作心得列表页（手动更新，暂空）
├── music/
│   └── index.html            # AI 音乐作品页（手动更新，暂空）
├── scripts/
│   ├── generate-news.js       # Node.js 新闻抓取 + HTML 生成
│   ├── daily-news.sh          # 每日 cron 调用脚本
│   ├── check-deploy.sh        # 部署检查（未 push 检测）
│   └── pre-commit             # Git pre-commit hook
├── .github/workflows/
│   └── deploy.yml             # GitHub Pages 部署工作流
│                              # （当前未使用，实际部署走 Vercel）
├── .github_token              # GitHub Token，用于 git push 认证
├── .gitignore
└── PROJECT_SUMMARY.md         # 本文件
```

---

## 自动化流程

```mermaid
OpenClaw Cron
  每日 08:00 Asia/Shanghai
     │
     ▼
daily-news.sh
     │
     ├── git pull origin main        # 拉取最新代码
     ├── node generate-news.js        # 抓取AI新闻 → 生成 HTML
     │        │
     │        ├── https://www.aitntnews.com/  (主源，国内可访问)
     │        ├── https://www.86ai.com.cn/    (备源，国内可访问)
     │        └── 解析 → 生成 news/YYYY-MM-DD/index.html
     │
     ├── git add / git commit         # 提交新新闻
     └── git push (GitHub Token)       # 推送到 GitHub
           │
           ▼
     Vercel auto-deploy
           │
           ▼
     https://my-site-murex-one.vercel.app/news/YYYY-MM-DD/
           ⚠️ 国内无法访问
```

---

## 新闻生成脚本（generate-news.js）

- **语言**: Node.js（纯原生，无依赖包）
- **数据源**: 国内可访问的中文 AI 新闻聚合站
  - `https://www.aitntnews.com/ainews/zh-CN` — 主源，解析 HTML 提取新闻标题
  - `https://www.86ai.com.cn/` — 备源，当主源抓取不到时使用
- **输出**: 纯静态 HTML 文件，写入 `news/YYYY-MM-DD/index.html`
- **当前问题**: 新闻中引用的原文链接部分指向境外网站（英文站、被墙站），国内用户点不开
- **无 API key 依赖**: 纯页面爬取

---

## 需要 Claude 帮忙解决的问题清单

### [优先级 1] P0 — 必须解决
1. **网站国内不可访问**
   - 当前 `vercel.app` 被墙，导致整个站点在国内打不开
   - 需要迁移到国内可访问的部署方案
   - 约束条件：纯静态站，不能加后端

### [优先级 2] P1 — 改善
2. **新闻原文链接翻墙问题**
   - AI 新闻日报里的原文链接（境外源），国内用户点进去是 404/超时
   - 需要自动化筛选或替换为国内可访问的镜像链接

3. **页面设计较基础**
   - 当前是纯静态 HTML + CSS（v0.0.3），可以升级到 Astro/Hugo 等静态生成器

### [优先级 3] P2 — 锦上添花
4. **GitHub Token 硬编码**
   - Token 存在 `.github_token` 文件里，推送时明文使用
   - 应该用 GitHub Actions secrets

5. **工作心得 / AI 音乐页面**
   - 目前只有占位内容，等设计升级后一起填充

6. **无评论 / 搜索 / 标签功能**
   - 纯静态站，用户没法搜索历史新闻或留言互动

---

## 环境详情（供 Claude 判断方案可行性）

| 维度 | 详情 |
|------|------|
| **运行环境** | WSL2 (Ubuntu) on Windows 11 |
| **网络环境** | 中国内地，无翻墙，无代理 |
| **能用的服务** | GitHub (clone/push)、国内 CDN、Tavily API、国内域名备案可办 |
| **不能用的** | Vercel *.app 域名、Netlify、Google Cloud、Docker(无sudo) |
| **可用的开发工具** | Node.js、Git、bash、Python 3 |
| **网站托管历史** | 从 Vercel 迁移（或加国内反向代理） |

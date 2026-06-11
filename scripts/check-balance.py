#!/usr/bin/env python3
"""查询所有 API 服务商余额，生成静态 HTML"""
import json, os, urllib.request, sys
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(BASE_DIR, "balance", "index.html")

# ====== 各服务商查询函数 ======

def query_deepseek():
    """DeepSeek 余额查询"""
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not key:
        return {"name": "DeepSeek", "status": "error", "error": "未配置 DEEPSEEK_API_KEY"}
    try:
        req = urllib.request.Request(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"}
        )
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        if data.get("is_available") and data.get("balance_infos"):
            info = data["balance_infos"][0]
            return {
                "name": "DeepSeek",
                "status": "ok",
                "currency": info.get("currency", "CNY"),
                "total_balance": float(info.get("total_balance", 0)),
                "granted_balance": float(info.get("granted_balance", 0)),
                "topped_up_balance": float(info.get("topped_up_balance", 0)),
            }
        return {"name": "DeepSeek", "status": "error", "error": f"API返回异常: {data}"}
    except Exception as e:
        return {"name": "DeepSeek", "status": "error", "error": str(e)[:100]}

def query_minimax():
    """MiniMax Token Plan 余额查询"""
    key_path = "/tmp/mm_key.txt"
    key = ""
    if os.path.exists(key_path):
        with open(key_path) as f:
            key = f.read().strip()
    if not key:
        return {"name": "MiniMax", "status": "error", "error": "未配置 MiniMax key"}
    try:
        req = urllib.request.Request(
            "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
            headers={"Authorization": f"Bearer {key}"}
        )
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        if data.get("base_resp", {}).get("status_code") == 0 and data.get("model_remains"):
            models = []
            for m in data["model_remains"]:
                models.append({
                    "model": m.get("model_name", "?"),
                    "interval_remaining": m.get("remains_time", 0),
                    "interval_pct": m.get("current_interval_remaining_percent", 0),
                    "weekly_remaining": m.get("weekly_remains_time", 0),
                    "weekly_pct": m.get("current_weekly_remaining_percent", 0),
                })
            return {"name": "MiniMax", "status": "ok", "models": models}
        return {"name": "MiniMax", "status": "error", "error": f"API返回异常"}
    except Exception as e:
        return {"name": "MiniMax", "status": "error", "error": str(e)[:100]}

def format_tokens(n):
    """格式化 token 数量"""
    if n >= 1_000_000_000:
        return f"{n/1_000_000_000:.2f}B"
    elif n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.0f}K"
    return str(n)

# ====== 生成 HTML ======

def generate_html(providers):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cards = ""
    for p in providers:
        name = p["name"]
        if p["status"] == "error":
            cards += f"""
            <div class="balance-card error">
                <div class="provider-name">🔌 {name}</div>
                <div class="error-msg">⚠️ {p.get('error', '未知错误')}</div>
            </div>"""
        elif name == "DeepSeek":
            cards += f"""
            <div class="balance-card deepseek">
                <div class="provider-name">🟢 {name}</div>
                <div class="balance-main">
                    <span class="balance-number">¥{p['total_balance']:.2f}</span>
                    <span class="balance-unit">{p['currency']}</span>
                </div>
                <div class="balance-detail">
                    <span>充值: ¥{p['topped_up_balance']:.2f}</span>
                    <span>赠送: ¥{p['granted_balance']:.2f}</span>
                </div>
            </div>"""
        elif name == "MiniMax":
            models_html = ""
            for m in p["models"]:
                models_html += f"""
                <div class="model-row">
                    <span class="model-name">📦 {m['model']}</span>
                    <div class="model-bars">
                        <div class="bar-group">
                            <span class="bar-label">5h窗口</span>
                            <div class="bar-bg"><div class="bar-fill green" style="width:{m['interval_pct']}%"></div></div>
                            <span class="bar-val">{format_tokens(m['interval_remaining'])} ({m['interval_pct']}%)</span>
                        </div>
                        <div class="bar-group">
                            <span class="bar-label">本周</span>
                            <div class="bar-bg"><div class="bar-fill blue" style="width:{m['weekly_pct']}%"></div></div>
                            <span class="bar-val">{format_tokens(m['weekly_remaining'])} ({m['weekly_pct']}%)</span>
                        </div>
                    </div>
                </div>"""
            cards += f"""
            <div class="balance-card minimax">
                <div class="provider-name">🟣 {name}</div>
                {models_html}
            </div>"""
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>💰 API 余额 - 小智的窝</title>
    <link rel="stylesheet" href="/assets/style.css">
    <style>
        .balance-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 20px;
            margin: 24px 0;
        }}
        .balance-card {{
            background: #fff;
            border: 1px solid #eee;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }}
        .balance-card.error {{
            border-color: #fecaca;
            background: #fef2f2;
        }}
        .balance-card.deepseek {{
            border-left: 4px solid #2563eb;
        }}
        .balance-card.minimax {{
            border-left: 4px solid #7c3aed;
        }}
        .provider-name {{
            font-size: 1.1rem;
            font-weight: 700;
            margin-bottom: 16px;
            color: #1a1a2e;
        }}
        .balance-main {{
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 12px;
        }}
        .balance-number {{
            font-size: 2.2rem;
            font-weight: 800;
            color: #1a1a2e;
        }}
        .balance-unit {{
            font-size: 0.9rem;
            color: #888;
        }}
        .balance-detail {{
            display: flex;
            gap: 20px;
            font-size: 0.85rem;
            color: #666;
        }}
        .error-msg {{
            color: #dc2626;
            font-size: 0.9rem;
        }}
        .model-row {{
            margin-bottom: 16px;
        }}
        .model-name {{
            font-weight: 600;
            font-size: 0.9rem;
            color: #444;
            margin-bottom: 8px;
            display: block;
        }}
        .model-bars {{
            display: flex;
            flex-direction: column;
            gap: 8px;
        }}
        .bar-group {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .bar-label {{
            font-size: 0.75rem;
            color: #888;
            width: 50px;
            text-align: right;
        }}
        .bar-bg {{
            flex: 1;
            height: 8px;
            background: #f3f4f6;
            border-radius: 4px;
            overflow: hidden;
        }}
        .bar-fill {{
            height: 100%;
            border-radius: 4px;
            transition: width 0.5s ease;
        }}
        .bar-fill.green {{ background: #16a34a; }}
        .bar-fill.blue {{ background: #2563eb; }}
        .bar-fill.yellow {{ background: #ca8a04; }}
        .bar-val {{
            font-size: 0.78rem;
            color: #666;
            width: 120px;
        }}
        .update-time {{
            text-align: center;
            color: #999;
            font-size: 0.78rem;
            margin-top: 32px;
        }}
        .add-provider {{
            border: 2px dashed #e5e7eb;
            text-align: center;
            padding: 32px;
            color: #aaa;
            cursor: pointer;
            transition: border-color 0.2s;
        }}
        .add-provider:hover {{
            border-color: #1a73e8;
            color: #1a73e8;
        }}
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="/" class="logo">🐕 小智的窝</a>
            <div class="nav-links">
                <a href="/news/">📰 AI 新闻</a>
                <a href="/notes/">📝 工作心得</a>
                <a href="/music/">🎵 AI 音乐</a>
                <a href="/balance/">💰 余额</a>
                <a href="/about.html">ℹ️ 关于</a>
            </div>
        </div>
    </nav>

    <section class="page-header">
        <div class="container">
            <h1>💰 API 余额面板</h1>
            <p>实时查询各 AI 服务商 Token 余额与用量</p>
        </div>
    </section>

    <section class="container">
        <div class="balance-grid">
            {cards}
            <div class="balance-card add-provider" onclick="alert('联系小智添加新服务商')">
                <div style="font-size:2rem;margin-bottom:8px;">➕</div>
                <div>添加新服务商</div>
            </div>
        </div>
        <p class="update-time">🕐 更新时间: {now} · 自动刷新</p>
    </section>

    <footer>
        <div class="container">
            <p>🦞 Powered by OpenClaw · <a href="/">小智的窝</a></p>
        </div>
    </footer>
</body>
</html>"""

# ====== 主流程 ======
if __name__ == "__main__":
    print("查询余额中...")
    providers = [query_deepseek(), query_minimax()]
    
    for p in providers:
        if p["status"] == "ok":
            if p["name"] == "DeepSeek":
                print(f"  ✅ DeepSeek: ¥{p['total_balance']:.2f}")
            elif p["name"] == "MiniMax":
                for m in p.get("models", []):
                    print(f"  ✅ MiniMax {m['model']}: {format_tokens(m['weekly_remaining'])} tokens/week ({m['weekly_pct']}%)")
        else:
            print(f"  ❌ {p['name']}: {p.get('error', 'unknown')}")
    
    html = generate_html(providers)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n✅ 已生成: {OUTPUT}")

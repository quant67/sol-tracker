#!/bin/bash
# ============================================
# sol-tracker 部署/更新脚本
# 在 VPS 上运行: bash deploy/deploy.sh
# ============================================
set -e

APP_DIR="/opt/sol-tracker"
cd "$APP_DIR"

echo "=========================================="
echo "  sol-tracker 部署中..."
echo "=========================================="

# --- 1. 拉取最新代码 ---
echo ""
echo "[1/5] 拉取最新代码..."
git pull origin main

# --- 2. 安装依赖 ---
echo ""
echo "[2/5] 安装依赖..."
npm ci --production=false

# --- 3. 构建项目 ---
echo ""
echo "[3/5] 构建 Next.js..."
npm run build

# --- 4. 复制静态资源到 standalone 目录 ---
echo ""
echo "[4/5] 处理静态资源..."
# standalone 模式需要手动复制 public 和 static 文件
cp -r public .next/standalone/public 2>/dev/null || true
cp -r .next/static .next/standalone/.next/static

# --- 5. 启动/重启 PM2 ---
echo ""
echo "[5/5] 启动应用..."
if pm2 describe sol-tracker > /dev/null 2>&1; then
    echo "  重启现有进程..."
    pm2 restart ecosystem.config.js
else
    echo "  首次启动..."
    pm2 start ecosystem.config.js
    pm2 save
    # 设置开机自启
    pm2 startup | tail -1 | bash 2>/dev/null || true
fi

# --- 配置 Nginx (仅首次) ---
NGINX_CONF="/etc/nginx/conf.d/sol-tracker.conf"
if [ ! -f "$NGINX_CONF" ]; then
    echo ""
    echo "  配置 Nginx..."
    sudo cp deploy/nginx.conf "$NGINX_CONF"
    sudo nginx -t && sudo systemctl restart nginx
    sudo systemctl enable nginx
    echo "  ✅ Nginx 已配置并启动"
else
    echo "  Nginx 配置已存在，跳过"
fi

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo ""
echo "  应用地址: http://150.109.22.66"
echo ""
echo "  PM2 状态:"
pm2 status
echo ""
echo "  常用命令:"
echo "  pm2 logs sol-tracker    # 查看日志"
echo "  pm2 restart sol-tracker # 重启应用"
echo "  pm2 monit               # 监控面板"
echo "=========================================="

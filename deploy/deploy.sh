#!/bin/bash
# ============================================
# sol-tracker 部署/更新脚本
# 在 VPS 上运行: bash deploy/deploy.sh
# 也可由 GitHub Actions CI/CD 自动触发
# ============================================
set -e

# 确保非交互式 SSH 登录时能找到 node/npm
# (GitHub Actions SSH 不加载 .bashrc/.bash_profile)
export PATH="/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:$PATH"
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true
[ -f "$HOME/.bash_profile" ] && source "$HOME/.bash_profile" 2>/dev/null || true
[ -f "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null || true

APP_DIR="/opt/sol-tracker"
cd "$APP_DIR"

echo "=========================================="
echo "  sol-tracker 部署中..."
if [ -n "$CI" ]; then
    echo "  (CI/CD 自动部署模式)"
fi
echo "=========================================="

# --- 1. 拉取最新代码 ---
echo ""
echo "[1/6] 拉取最新代码..."
git pull origin main

# --- 2. 安装依赖 ---
echo ""
echo "[2/6] 安装依赖..."
npm ci --production=false

# --- 3. 构建项目 ---
echo ""
echo "[3/6] 构建 Next.js..."
npm run build

# --- 4. 复制静态资源到 standalone 目录 ---
echo ""
echo "[4/6] 处理静态资源..."
# standalone 模式需要手动复制 public 和 static 文件
cp -r public .next/standalone/public 2>/dev/null || true
cp -r .next/static .next/standalone/.next/static

# --- 5. 启动/重启 PM2 ---
echo ""
echo "[5/6] 启动应用..."
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

# --- 6. 健康检查 ---
echo ""
echo "[6/6] 健康检查..."
MAX_RETRIES=10
RETRY_INTERVAL=3
for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf -o /dev/null http://127.0.0.1:3000; then
        echo "  ✅ 应用已启动，健康检查通过 (第 ${i} 次尝试)"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "  ❌ 健康检查失败：应用未在 $((MAX_RETRIES * RETRY_INTERVAL)) 秒内响应"
        echo "  PM2 日志:"
        pm2 logs sol-tracker --lines 20 --nostream
        exit 1
    fi
    echo "  等待应用启动... (${i}/${MAX_RETRIES})"
    sleep $RETRY_INTERVAL
done

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

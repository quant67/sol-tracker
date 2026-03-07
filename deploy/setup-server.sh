#!/bin/bash
# ============================================
# sol-tracker VPS 首次初始化脚本
# 适用于 OpenCloudOS 9 (RHEL 系)
# ============================================
set -e

echo "=========================================="
echo "  sol-tracker 服务器初始化"
echo "=========================================="

# --- 1. 系统更新 ---
echo ""
echo "[1/6] 更新系统包..."
sudo dnf update -y

# --- 2. 安装 Node.js 20 ---
echo ""
echo "[2/6] 安装 Node.js 20..."
if command -v node &> /dev/null; then
    echo "  Node.js 已安装: $(node -v)"
else
    # 使用 NodeSource 安装 Node.js 20
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
    echo "  ✅ Node.js 已安装: $(node -v)"
fi

# --- 3. 安装 PM2 ---
echo ""
echo "[3/6] 安装 PM2..."
if command -v pm2 &> /dev/null; then
    echo "  PM2 已安装: $(pm2 -v)"
else
    sudo npm install -g pm2
    echo "  ✅ PM2 已安装"
fi

# --- 4. 安装 Nginx ---
echo ""
echo "[4/6] 安装 Nginx..."
if command -v nginx &> /dev/null; then
    echo "  Nginx 已安装"
else
    sudo dnf install -y nginx
    echo "  ✅ Nginx 已安装"
fi

# --- 5. 配置防火墙 ---
echo ""
echo "[5/6] 配置防火墙..."
if command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
    echo "  ✅ 防火墙已开放 80/443"
else
    echo "  ⚠️ firewall-cmd 未找到，请手动配置防火墙"
fi

# --- 6. 创建项目目录 ---
echo ""
echo "[6/6] 创建项目目录..."
sudo mkdir -p /opt/sol-tracker/logs
sudo chown -R $(whoami):$(whoami) /opt/sol-tracker

echo ""
echo "=========================================="
echo "  ✅ 服务器初始化完成！"
echo ""
echo "  下一步:"
echo "  1. 将代码克隆到 /opt/sol-tracker:"
echo "     cd /opt/sol-tracker"
echo "     git clone <你的仓库URL> ."
echo ""
echo "  2. 创建 .env 文件:"
echo "     cp .env.example .env  # 或手动创建"
echo "     vim .env"
echo ""
echo "  3. 运行部署脚本:"
echo "     bash deploy/deploy.sh"
echo "=========================================="

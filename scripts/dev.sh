#!/bin/bash

# 开发环境启动脚本

echo "🚀 启动开发环境..."

# 检查.env文件
if [ ! -f .env ]; then
    echo "⚠️  .env文件不存在，从.env.example复制..."
    cp .env.example .env
    echo "❗ 请编辑 .env 文件填入必要的配置"
    exit 1
fi

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动MongoDB (如果使用Docker)
echo "🗄️  启动MongoDB..."
docker-compose up -d mongodb

# 等待MongoDB启动
echo "⏳ 等待MongoDB启动..."
sleep 5

# 启动应用
echo "✨ 启动应用..."
npm run dev

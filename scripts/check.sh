#!/bin/bash

# 项目完整性检查脚本

echo "================================"
echo "智能写作助手 Bot - 项目检查"
echo "================================"
echo ""

# 检查必要文件
echo "📁 检查项目文件..."
files=(
    "package.json"
    "docker-compose.yml"
    "Dockerfile"
    ".env"
    "src/index.js"
    "src/services/botService.js"
    "src/services/aiService.js"
    "src/services/databaseService.js"
    "src/services/modelRouter.js"
    "config/index.js"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file 不存在"
        all_exist=false
    fi
done

echo ""

# 检查.env配置
echo "🔧 检查环境配置..."
if [ -f .env ]; then
    if grep -q "your_telegram_bot_token_here" .env; then
        echo "⚠️  .env 文件中包含默认配置，请填写真实的API密钥"
        echo "   编辑文件: nano .env"
        echo "   或查看: cat API.md"
    else
        echo "✅ .env 文件已配置"
    fi
else
    echo "❌ .env 文件不存在"
fi

echo ""

# 检查Docker
echo "🐳 检查Docker..."
if command -v docker &> /dev/null; then
    echo "✅ Docker已安装: $(docker --version)"
    if systemctl is-active --quiet docker; then
        echo "✅ Docker服务运行中"
    else
        echo "⚠️  Docker服务未运行"
        echo "   启动: systemctl start docker"
    fi
else
    echo "❌ Docker未安装"
fi

echo ""

# 检查Node.js
echo "📦 检查Node.js..."
if command -v node &> /dev/null; then
    echo "✅ Node.js已安装: $(node --version)"
    if [ -d "node_modules" ]; then
        echo "✅ 依赖已安装"
    else
        echo "⚠️  依赖未安装"
        echo "   安装: npm install"
    fi
else
    echo "❌ Node.js未安装"
fi

echo ""

# 总结
echo "================================"
if [ "$all_exist" = true ]; then
    echo "✅ 项目文件完整"
    echo ""
    echo "下一步："
    echo "1. 编辑 .env 文件，填入API密钥"
    echo "   nano .env"
    echo ""
    echo "2. 运行部署脚本"
    echo "   bash scripts/deploy.sh"
    echo ""
    echo "3. 查看日志"
    echo "   docker-compose logs -f bot"
else
    echo "❌ 项目文件不完整，请重新部署"
fi
echo "================================"

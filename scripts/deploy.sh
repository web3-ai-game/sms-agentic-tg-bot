#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}智能写作助手 Bot 部署脚本${NC}"
echo -e "${GREEN}================================${NC}"

# 检查是否安装Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker未安装${NC}"
    echo "正在安装Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
fi

# 检查是否安装Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}警告: Docker Compose未安装${NC}"
    echo "正在安装Docker Compose..."
    apt-get update
    apt-get install -y docker-compose-plugin
fi

# 检查.env文件
if [ ! -f .env ]; then
    echo -e "${YELLOW}警告: .env文件不存在${NC}"
    echo "正在从.env.example创建.env..."
    cp .env.example .env
    echo -e "${YELLOW}请编辑 .env 文件填入必要的配置！${NC}"
    echo -e "${YELLOW}特别是: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GROK_API_KEY${NC}"
    exit 1
fi

# 停止现有容器
echo -e "${YELLOW}停止现有容器...${NC}"
docker-compose down

# 构建镜像
echo -e "${GREEN}构建Docker镜像...${NC}"
docker-compose build

# 启动服务
echo -e "${GREEN}启动服务...${NC}"
docker-compose up -d

# 等待服务启动
echo -e "${YELLOW}等待服务启动...${NC}"
sleep 10

# 检查服务状态
echo -e "${GREEN}检查服务状态:${NC}"
docker-compose ps

# 显示日志
echo -e "${GREEN}查看日志:${NC}"
docker-compose logs --tail=50

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "使用以下命令管理服务:"
echo -e "  ${YELLOW}docker-compose logs -f${NC}        # 查看实时日志"
echo -e "  ${YELLOW}docker-compose restart${NC}        # 重启服务"
echo -e "  ${YELLOW}docker-compose stop${NC}           # 停止服务"
echo -e "  ${YELLOW}docker-compose down${NC}           # 停止并删除容器"
echo -e "  ${YELLOW}docker-compose ps${NC}             # 查看服务状态"

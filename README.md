# 🌾 Feng Farm - 多人在线农场游戏

一款基于 WebSocket 的多人实时在线农场游戏，支持多人同时在线种植、浇水、收获，体验田园乐趣。

## 功能特性

- 🏡 **多人房间** - 创建或加入农场房间，与朋友一起种田
- 🌱 **种植系统** - 种植小麦、番茄、玉米等多种作物
- 💧 **浇水系统** - 手动浇水加速作物生长
- 💰 **金币经济** - 播种、收获、赚取金币
- ⚡ **实时同步** - WebSocket 实时多人状态同步
- ⌨️ **键盘控制** - 支持 WASD 移动、空格浇水

## 技术栈

- **前端**: HTML5, CSS3, JavaScript
- **后端**: Node.js, Express, Socket.io
- **部署**: PM2

## 快速开始

### 安装依赖

```bash
cd feng-farm
npm install
```

### 开发模式

```bash
# 设置端口（可选，默认 3007）
export PORT=3007

# 启动服务
node games/farm/server/server.js
```

访问 http://localhost:3007

### 生产部署

```bash
# 使用 PM2 启动
pm2 start ecosystem.config.js

# 或前台运行
NODE_ENV=production PORT=3007 node games/farm/server/server.js
```

## 操作说明

| 操作 | 鼠标 | 键盘 |
|------|------|------|
| 移动 | 点击空白地块 | WASD / 方向键 |
| 种植 | 选中种子→点击地块 | - |
| 浇水 | 点击已种植地块 | 空格键 |
| 收获 | 点击成熟作物 | - |

## 作物数据

| 作物 | 生长时间 | 成本 | 售价 | 利润 |
|------|---------|------|------|------|
| 🌾 小麦 | 30秒 | 2💰 | 10💰 | +8💰 |
| 🍅 番茄 | 60秒 | 5💰 | 25💰 | +20💰 |
| 🌽 玉米 | 120秒 | 12💰 | 60💰 | +48💰 |

## 项目结构

```
feng-farm/
├── games/farm/
│   ├── client/          # 前端资源
│   │   ├── index.html   # 游戏页面
│   │   ├── style.css    # 样式
│   │   └── app.js       # 游戏逻辑
│   └── server/          # 后端服务
│       ├── server.js    # WebSocket 服务
│       └── game.js      # 游戏核心逻辑
├── docs/                # 文档
├── ecosystem.config.js  # PM2 配置
└── package.json
```

## API

### WebSocket 事件

**客户端 → 服务端**
- `join-room` - 加入房间
- `leave-room` - 离开房间
- `move` - 移动玩家
- `plant` - 种植作物
- `water` - 浇水
- `harvest` - 收获

**服务端 → 客户端**
- `game-state` - 游戏状态同步
- `player-info` - 玩家信息
- `room-list` - 房间列表

## 许可证

ISC
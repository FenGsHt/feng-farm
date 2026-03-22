# Feng Farm WebSocket API 文档

## 1. 连接信息

| 属性 | 值 |
|------|-----|
| 协议 | WebSocket (Socket.io) |
| 默认端口 | 3007 |
| 命名空间 | `/` (默认) |
| CORS | 允许所有来源 (`*`) |

## 2. 事件概览

### 2.1 客户端 → 服务端（发送）

| 事件名 | 描述 | 必需参数 |
|--------|------|---------|
| `get-rooms` | 获取房间列表 | 无 |
| `join-room` | 加入/创建房间 | `roomId`, `playerName` |
| `leave-room` | 离开当前房间 | 无 |
| `move` | 移动玩家 | `x`, `y` |
| `plant` | 种植作物 | `cropType` |
| `water` | 浇水 | 无 |
| `harvest` | 收获作物 | 无 |
| `new-farm` | 重置农场 | `width`, `height` (可选) |

### 2.2 服务端 → 客户端（接收）

| 事件名 | 描述 | 触发时机 |
|--------|------|---------|
| `room-list` | 房间列表更新 | 连接时、房间变化时 |
| `game-state` | 完整游戏状态 | 操作后、进入房间后 |
| `player-info` | 当前玩家信息 | 加入房间后 |
| `action-result` | 操作结果反馈 | 操作执行后 |
| `notification` | 系统通知 | 农场重置等 |
| `error` | 错误信息 | 操作失败时 |

---

## 3. 详细接口

### 3.1 房间管理

#### `get-rooms`
获取当前所有可用房间列表。

**发送：**
```javascript
socket.emit('get-rooms');
```

**响应（`room-list`）：**
```json
{
  "room-list": [
    {
      "roomId": "公共农场",
      "playerCount": 5,
      "players": ["小明", "小红", "张三"],
      "gameStatus": "playing"
    },
    {
      "roomId": "小明农场",
      "playerCount": 2,
      "players": ["小明", "小红"],
      "gameStatus": "playing"
    }
  ]
}
```

---

#### `join-room`
加入指定房间，如房间不存在则自动创建。

**发送：**
```javascript
socket.emit('join-room', {
  "roomId": "我的农场",      // 必需，房间名称
  "playerName": "玩家小明",   // 必需，玩家显示名称
  "width": 12,               // 可选，农场宽度（5-20，默认12）
  "height": 12               // 可选，农场高度（5-20，默认12）
});
```

**参数约束：**
| 参数 | 类型 | 范围 | 默认值 |
|------|------|------|--------|
| roomId | string | 非空 | - |
| playerName | string | 非空 | "匿名农夫" |
| width | number | 5-20 | 12 |
| height | number | 5-20 | 12 |

**响应（`player-info`）：**
```json
{
  "player-info": {
    "id": "socket-id-xxx",
    "name": "玩家小明",
    "money": 50,
    "color": "#ff6b6b",
    "position": { "x": 0, "y": 0 }
  }
}
```

**响应（`game-state`）：**
见 3.2 游戏状态

**错误响应（`error`）：**
```json
{
  "error": {
    "message": "房间号不能为空"
  }
}
```

---

#### `leave-room`
离开当前房间。

**发送：**
```javascript
socket.emit('leave-room');
```

**效果：**
- 从房间玩家列表中移除
- 广播更新后的 `game-state` 给其他玩家
- 广播更新后的 `room-list` 给所有连接

---

### 3.2 游戏操作

#### `move`
移动玩家到指定坐标。

**发送：**
```javascript
socket.emit('move', {
  "x": 5,
  "y": 3
});
```

**约束：**
- 坐标必须在农场范围内（0 ≤ x < width, 0 ≤ y < height）
- 每次移动一格或多格（由服务端验证）

**成功响应：**
广播 `game-state` 给房间内所有玩家。

---

#### `plant`
在当前位置种植作物。

**发送：**
```javascript
socket.emit('plant', {
  "cropType": "wheat"   // 可选值: wheat, tomato, corn
});
```

**作物配置：**
| cropType | 名称 | 生长时间 | 种子价格 | 出售价格 | emoji |
|----------|------|---------|---------|---------|-------|
| wheat | 小麦 | 30秒 | 2金币 | 10金币 | 🌾 |
| tomato | 番茄 | 60秒 | 5金币 | 25金币 | 🍅 |
| corn | 玉米 | 120秒 | 12金币 | 60金币 | 🌽 |

**成功响应（`action-result` + `game-state`）：**
```json
{
  "action-result": {
    "success": true,
    "action": "plant",
    "message": "种植了 48 金币剩余"
  }
}
```

**失败响应：**
```json
{
  "action-result": {
    "success": false,
    "action": "plant",
    "message": "这块地已经有作物了"
  }
}
```

**失败原因：**
- `"这块地已经有作物了"` - 目标地块已有作物
- `"未知作物"` - cropType 不在 CROPS 配置中
- `"资金不足"` - 玩家金币 < 种子价格

---

#### `water`
为当前站立地块的作物浇水。

**发送：**
```javascript
socket.emit('water');
```

**效果：**
- 土壤湿度 +30%
- 作物生长速度提升 50%（浇水状态下）

**成功响应：**
```json
{
  "action-result": {
    "success": true,
    "action": "water",
    "message": "浇水成功！"
  }
}
```

**失败原因：**
- `"没有作物可浇水"` - 地块没有种植作物
- `"已经浇过水了"` - 该作物本轮已浇水（isWatered = true）

---

#### `harvest`
收获当前站立地块的成熟作物。

**发送：**
```javascript
socket.emit('harvest');
```

**条件：**
- 地块必须有作物（crop !== null）
- 作物必须成熟（growthStage === 3）

**成功响应：**
```json
{
  "action-result": {
    "success": true,
    "action": "harvest",
    "message": "收获成功！获得 10 金币"
  }
}
```

**失败原因：**
- `"没有作物可收获"` - 地块为空
- `"作物还未成熟"` - growthStage < 3

---

#### `new-farm`
重置当前房间的农场。

**发送：**
```javascript
socket.emit('new-farm', {
  "width": 15,   // 可选，新农场宽度（5-20）
  "height": 15   // 可选，新农场高度（5-20）
});
```

**效果：**
- 清空所有地块
- 重置所有玩家金币为 50
- 玩家位置重置到 (0, 0)

**响应（`notification`）：**
```json
{
  "notification": {
    "message": "农场已重置！"
  }
}
```

---

### 3.3 游戏状态（`game-state`）

游戏状态的完整数据结构：

```json
{
  "game-state": {
    "width": 12,
    "height": 12,
    "plots": [
      [  // 第 0 行
        {
          "x": 0,
          "y": 0,
          "soilMoisture": 50,
          "crop": "wheat",
          "growthStage": 2,
          "isWatered": true,
          "owner": "小明",
          "emoji": "🌾"
        },
        // ... 更多地块
      ],
      // ... 更多行
    ],
    "players": [
      {
        "id": "socket-id-xxx",
        "name": "小明",
        "money": 58,
        "color": "#ff6b6b",
        "position": { "x": 5, "y": 3 }
      }
    ],
    "gameStatus": "playing",
    "crops": {
      "wheat": { "name": "小麦", "growthTime": 30, "sellPrice": 10, "seedPrice": 2, "emoji": "🌾" },
      "tomato": { "name": "番茄", "growthTime": 60, "sellPrice": 25, "seedPrice": 5, "emoji": "🍅" },
      "corn": { "name": "玉米", "growthTime": 120, "sellPrice": 60, "seedPrice": 12, "emoji": "🌽" }
    }
  }
}
```

**字段说明：**

#### Plot（地块）
| 字段 | 类型 | 说明 |
|------|------|------|
| x, y | number | 地块坐标 |
| soilMoisture | number | 土壤湿度 0-100 |
| crop | string\|null | 作物类型（wheat/tomato/corn）或 null |
| growthStage | number | 生长阶段：0=种子, 1=幼苗, 2=生长中, 3=成熟 |
| isWatered | boolean | 本轮是否已浇水 |
| owner | string\|null | 种植者名称 |
| emoji | string\|null | 作物 emoji 或 null |

#### Player（玩家）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | Socket.io 连接 ID |
| name | string | 玩家显示名称 |
| money | number | 当前金币数量 |
| color | string | 玩家标识颜色（HEX） |
| position | {x, y} | 当前位置坐标 |

---

## 4. 状态码与错误处理

### 4.1 操作结果（`action-result`）

```typescript
interface ActionResult {
  success: boolean;      // 是否成功
  action: string;        // 操作类型: plant/water/harvest
  message: string;       // 提示信息
}
```

### 4.2 错误事件（`error`）

| 触发场景 | message |
|---------|---------|
| 加入房间时 roomId 为空 | `"房间号不能为空"` |
| 其他服务端内部错误 | 具体错误信息 |

---

## 5. 连接生命周期

### 5.1 典型连接流程

```
1. 建立 WebSocket 连接
        ↓
2. 接收 initial room-list
        ↓
3. 发送 join-room 加入房间
        ↓
4. 接收 player-info 和 game-state
        ↓
5. 发送游戏操作（move/plant/water/harvest）
        ↓
6. 接收 action-result 和 game-state 更新
        ↓
7. 发送 leave-room 或断开连接
```

### 5.2 断线重连

Socket.io 自动处理重连：
- 网络断开后自动尝试重连
- 重连成功后需要重新 join-room
- 服务端在 disconnect 时自动清理玩家数据

---

## 6. 数据类型定义（TypeScript）

```typescript
// 坐标
interface Position {
  x: number;
  y: number;
}

// 作物配置
interface CropConfig {
  name: string;
  growthTime: number;  // 秒
  sellPrice: number;
  seedPrice: number;
  emoji: string;
}

// 地块状态
interface PlotState {
  x: number;
  y: number;
  soilMoisture: number;
  crop: string | null;
  growthStage: number;  // 0-3
  isWatered: boolean;
  owner: string | null;
  emoji: string | null;
}

// 玩家状态
interface PlayerState {
  id: string;
  name: string;
  money: number;
  color: string;
  position: Position;
}

// 游戏状态
interface GameState {
  width: number;
  height: number;
  plots: PlotState[][];
  players: PlayerState[];
  gameStatus: string;
  crops: Record<string, CropConfig>;
}

// 房间信息
interface RoomInfo {
  roomId: string;
  playerCount: number;
  players: string[];
  gameStatus: string;
}

// 操作结果
interface ActionResult {
  success: boolean;
  action: 'plant' | 'water' | 'harvest';
  message:
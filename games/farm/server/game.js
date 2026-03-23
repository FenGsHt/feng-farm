// 多人种田游戏逻辑
const dataStore = require('./dataStore');
const antiCheat = require('./antiCheat');

// 作物配置
const CROPS = {
  wheat: { name: '小麦', growthTime: 30, sellPrice: 10, seedPrice: 2, emoji: '🌾' },
  tomato: { name: '番茄', growthTime: 60, sellPrice: 25, seedPrice: 5, emoji: '🍅' },
  corn: { name: '玉米', growthTime: 120, sellPrice: 60, seedPrice: 12, emoji: '🌽' },
  carrot: { name: '胡萝卜', growthTime: 20, sellPrice: 15, seedPrice: 3, emoji: '🥕' },
  eggplant: { name: '茄子', growthTime: 45, sellPrice: 30, seedPrice: 6, emoji: '🍆' },
  strawberry: { name: '草莓', growthTime: 35, sellPrice: 20, seedPrice: 4, emoji: '🍓' }
};

// 地块类
class Plot {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.soilMoisture = 50; // 土壤湿度 0-100
    this.crop = null; // 作物类型
    this.plantedAt = null; // 种植时间
    this.growthStage = 0; // 0-3 (0=种子, 1=幼苗, 2=生长中, 3=成熟)
    this.isWatered = false;
    this.owner = null; // 种植者
  }

  // 种植
  plant(cropType, playerName) {
    if (this.crop) return { success: false, message: '这块地已经有作物了' };
    
    this.crop = cropType;
    this.plantedAt = Date.now();
    this.growthStage = 0;
    this.owner = playerName;
    this.isWatered = false;
    return { success: true };
  }

  // 浇水
  water() {
    if (!this.crop) return { success: false, message: '没有作物可浇水' };
    if (this.isWatered) return { success: false, message: '已经浇过水了' };
    
    this.soilMoisture = Math.min(100, this.soilMoisture + 30);
    this.isWatered = true;
    return { success: true };
  }

  // 收获
  harvest() {
    if (!this.crop) return { success: false, message: '没有作物可收获' };
    if (this.growthStage < 3) return { success: false, message: '作物还未成熟' };
    
    const crop = CROPS[this.crop];
    const reward = crop.sellPrice;
    const harvestedCrop = this.crop;
    
    // 重置地块
    this.crop = null;
    this.plantedAt = null;
    this.growthStage = 0;
    this.owner = null;
    this.isWatered = false;
    
    return { success: true, reward, cropType: harvestedCrop };
  }

  // 铲除作物
  remove() {
    if (!this.crop) return { success: false, message: '没有作物可铲除' };
    
    const removedCrop = this.crop;
    
    // 重置地块
    this.crop = null;
    this.plantedAt = null;
    this.growthStage = 0;
    this.owner = null;
    this.isWatered = false;
    
    return { success: true, message: '已铲除作物', cropType: removedCrop };
  }

  // 更新生长阶段
  updateGrowth() {
    if (!this.crop || this.growthStage >= 3) return;
    
    const crop = CROPS[this.crop];
    const elapsed = (Date.now() - this.plantedAt) / 1000; // 秒
    let effectiveTime = elapsed;
    
    // 浇水加速 50%
    if (this.isWatered) {
      effectiveTime *= 1.5;
    }
    
    // 计算生长阶段
    const progress = effectiveTime / crop.growthTime;
    if (progress >= 1) {
      this.growthStage = 3; // 成熟
    } else if (progress >= 0.6) {
      this.growthStage = 2; // 生长中
    } else if (progress >= 0.2) {
      this.growthStage = 1; // 幼苗
    }
  }

  getState() {
    return {
      x: this.x,
      y: this.y,
      soilMoisture: this.soilMoisture,
      crop: this.crop,
      growthStage: this.growthStage,
      isWatered: this.isWatered,
      owner: this.owner,
      emoji: this.crop ? CROPS[this.crop].emoji : null
    };
  }
}

// 农场游戏类
class FarmGame {
  constructor(width = 10, height = 10) {
    this.width = width;
    this.height = height;
    this.plots = []; // 二维数组
    this.players = new Map(); // socketId -> {name, money, position}
    this.gameStatus = 'playing';
    this.startTime = Date.now();
    
    // 初始化地块
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push(new Plot(x, y));
      }
      this.plots.push(row);
    }
    
    // 启动生长更新循环
    this.startGrowthLoop();
  }

  startGrowthLoop() {
    setInterval(() => {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          this.plots[y][x].updateGrowth();
        }
      }
    }, 1000); // 每秒更新一次
  }

  // 玩家加入
  addPlayer(socketId, playerName) {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
    
    // 尝试从持久化存储加载玩家数据
    const savedPlayer = dataStore.getPlayer(socketId);
    
    const player = {
      id: socketId,
      name: savedPlayer?.name || playerName,
      money: savedPlayer?.money || 50, // 初始资金，如果没有保存数据则为50
      color: savedPlayer?.color || colors[this.players.size % colors.length],
      position: savedPlayer?.position || { x: 0, y: 0 }
    };
    this.players.set(socketId, player);
    return player;
  }

  // 玩家离开
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      // 保存玩家数据后再删除
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: player.money, 
        color: player.color, 
        position: player.position 
      });
      dataStore.logAction(socketId, player.name, 'leave', {});
    }
    this.players.delete(socketId);
  }

  // 移动玩家
  movePlayer(socketId, x, y) {
    const player = this.players.get(socketId);
    if (!player) return { success: false };
    
    // 防作弊检查：位置
    const posCheck = antiCheat.validatePosition(x, y, this.width, this.height);
    if (!posCheck.valid) return posCheck;
    
    // 防作弊检查：频率
    const rateCheck = antiCheat.checkRateLimit(socketId, 'move');
    if (!rateCheck.allowed) return rateCheck;
    
    player.position = { x, y };
    // 保存玩家位置
    dataStore.savePlayer(socketId, { name: player.name, money: player.money, color: player.color, position: player.position });
    // 记录操作日志
    dataStore.logAction(socketId, player.name, 'move', { x, y });
    return { success: true };
  }

  // 种植
  plant(socketId, cropType) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const crop = CROPS[cropType];
    if (!crop) return { success: false, message: '未知作物' };
    
    const { x, y } = player.position;
    const plot = this.plots[y][x];
    
    // 防作弊检查
    const validation = antiCheat.validateAction(player, plot, 'plant', crop.seedPrice, x, y, this.width, this.height);
    if (!validation.valid) {
      antiCheat.logSuspiciousAction(socketId, player.name, 'plant', validation.message, { cropType, x, y });
      return { success: false, message: validation.message };
    }
    
    const result = plot.plant(cropType, player.name);
    
    if (result.success) {
      player.money -= crop.seedPrice;
      // 保存玩家数据
      dataStore.savePlayer(socketId, { name: player.name, money: player.money, color: player.color, position: player.position });
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'plant', { cropType, x, y, cost: crop.seedPrice });
    }
    
    return result;
  }

  // 浇水
  water(socketId) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const { x, y } = player.position;
    const plot = this.plots[y][x];
    
    // 防作弊检查
    const validation = antiCheat.validateAction(player, plot, 'water', 0, x, y, this.width, this.height);
    if (!validation.valid) {
      antiCheat.logSuspiciousAction(socketId, player.name, 'water', validation.message, { x, y });
      return { success: false, message: validation.message };
    }
    
    const result = plot.water();
    
    if (result.success) {
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'water', { x, y });
    }
    
    return result;
  }

  // 收获
  harvest(socketId) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const { x, y } = player.position;
    const plot = this.plots[y][x];
    
    // 防作弊检查
    const validation = antiCheat.validateAction(player, plot, 'harvest', 0, x, y, this.width, this.height);
    if (!validation.valid) {
      antiCheat.logSuspiciousAction(socketId, player.name, 'harvest', validation.message, { x, y });
      return { success: false, message: validation.message };
    }
    
    const result = plot.harvest();
    
    if (result.success) {
      // 防作弊：验证奖励
      const rewardCheck = antiCheat.validateHarvestReward(plot, result.reward);
      if (!rewardCheck.valid) {
        antiCheat.logSuspiciousAction(socketId, player.name, 'harvest', 'Reward mismatch', { expected: result.reward, x, y });
        return { success: false, message: '收获奖励异常' };
      }
      
      player.money += result.reward;
      // 保存玩家数据
      dataStore.savePlayer(socketId, { name: player.name, money: player.money, color: player.color, position: player.position });
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'harvest', { x, y, reward: result.reward, cropType: result.cropType });
    }
    
    return result;
  }

  // 铲除作物
  removeCrop(socketId) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const { x, y } = player.position;
    const plot = this.plots[y][x];
    
    const result = plot.remove();
    
    if (result.success) {
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'remove', { x, y, cropType: result.cropType });
    }
    
    return result;
  }

  // 获取游戏状态
  getState() {
    // 计算游戏天数 (1分钟 = 1天)
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const gameDay = Math.floor(elapsedSeconds / 60) + 1;
    
    return {
      width: this.width,
      height: this.height,
      plots: this.plots.map(row => row.map(plot => plot.getState())),
      players: Array.from(this.players.values()),
      gameStatus: this.gameStatus,
      crops: CROPS,
      gameDay: gameDay,
      gameTime: elapsedSeconds
    };
  }
}

// 房间管理器
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { game, players }
  }

  createRoom(roomId, width = 10, height = 10) {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }
    
    const room = {
      id: roomId,
      game: new FarmGame(width, height),
      players: new Map(), // socketId -> player
      persist: false
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  removeRoom(roomId) {
    this.rooms.delete(roomId);
  }

  addPlayer(roomId, socketId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const player = room.game.addPlayer(socketId, playerName);
    room.players.set(socketId, player);
    return player;
  }

  removePlayer(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    room.game.removePlayer(socketId);
    room.players.delete(socketId);
    
    // 如果房间没人且不是持久房间，删除房间
    if (room.players.size === 0 && !room.persist) {
      this.removeRoom(roomId);
    }
  }

  getPlayersList(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.players.values());
  }

  getRoomList() {
    return Array.from(this.rooms.values()).map(room => ({
      roomId: room.id,
      playerCount: room.players.size,
      players: Array.from(room.players.values()).map(p => p.name),
      gameStatus: room.game.gameStatus
    }));
  }
}

module.exports = { FarmGame, RoomManager, CROPS };

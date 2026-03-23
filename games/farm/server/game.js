// 多人种田游戏逻辑
const dataStore = require('./dataStore');
const antiCheat = require('./antiCheat');

// 每日任务配置
const DAILY_TASKS = [
  { id: 'plant_10', name: '辛勤耕耘', desc: '种植10次', reward: 50, type: 'plant', target: 10 },
  { id: 'water_20', name: '浇水达人', desc: '浇水20次', reward: 80, type: 'water', target: 20 },
  { id: 'harvest_5', name: '收获季节', desc: '收获5次作物', reward: 100, type: 'harvest', target: 5 },
  { id: 'earn_100', name: '小有积蓄', desc: '赚取100金币', reward: 50, type: 'earn', target: 100 }
];

// 成就配置
const ACHIEVEMENTS = [
  { id: 'first_plant', name: '初次种植', desc: '种植第一颗作物', reward: 10, icon: '🌱', condition: (stats) => stats.plantCount >= 1 },
  { id: 'plant_50', name: '种植老手', desc: '累计种植50次', reward: 100, icon: '🌿', condition: (stats) => stats.plantCount >= 50 },
  { id: 'water_100', name: '浇水高手', desc: '累计浇水100次', reward: 150, icon: '💧', condition: (stats) => stats.waterCount >= 100 },
  { id: 'harvest_20', name: '收获达人', desc: '累计收获20次', reward: 120, icon: '🧺', condition: (stats) => stats.harvestCount >= 20 },
  { id: 'rich_farmer', name: '富甲一方', desc: '拥有1000金币', reward: 100, icon: '💰', condition: (stats, money) => money >= 1000 },
  { id: 'millionaire', name: '农场大亨', desc: '拥有5000金币', reward: 300, icon: '🏰', condition: (stats, money) => money >= 5000 },
  { id: 'first_sell', name: '小试牛刀', desc: '出售第一件物品', reward: 20, icon: '💵', condition: (stats) => stats.sellCount >= 1 },
  { id: 'speed_grower', name: '快速收获', desc: '单次种植后5分钟内收获', reward: 50, icon: '⚡', condition: (stats) => stats.fastHarvest >= 1 }
];

// 作物配置
const CROPS = {
  wheat: { name: '小麦', growthTime: 30, sellPrice: 10, seedPrice: 2, emoji: '🌾', category: 'grain' },
  tomato: { name: '番茄', growthTime: 60, sellPrice: 25, seedPrice: 5, emoji: '🍅', category: 'vegetable' },
  corn: { name: '玉米', growthTime: 120, sellPrice: 60, seedPrice: 12, emoji: '🌽', category: 'grain' },
  carrot: { name: '胡萝卜', growthTime: 20, sellPrice: 15, seedPrice: 3, emoji: '🥕', category: 'vegetable' },
  eggplant: { name: '茄子', growthTime: 45, sellPrice: 30, seedPrice: 6, emoji: '🍆', category: 'vegetable' },
  strawberry: { name: '草莓', growthTime: 35, sellPrice: 20, seedPrice: 4, emoji: '🍓', category: 'fruit' }
};

// 动物配置
const ANIMALS = {
  chicken: { name: '鸡', growthTime: 60, sellPrice: 30, buyPrice: 50, emoji: '🐔', product: '鸡蛋', productPrice: 5 },
  sheep: { name: '羊', growthTime: 120, sellPrice: 100, buyPrice: 200, emoji: '🐑', product: '羊毛', productPrice: 20 },
  cow: { name: '牛', growthTime: 180, sellPrice: 200, buyPrice: 400, emoji: '🐄', product: '牛奶', productPrice: 30 }
};

// 商店物品配置
const SHOP_ITEMS = {
  // 种子
  'seed-wheat': { type: 'seed', crop: 'wheat', name: '小麦种子', price: 2, emoji: '🌾' },
  'seed-tomato': { type: 'seed', crop: 'tomato', name: '番茄种子', price: 5, emoji: '🍅' },
  'seed-corn': { type: 'seed', crop: 'corn', name: '玉米种子', price: 12, emoji: '🌽' },
  'seed-carrot': { type: 'seed', crop: 'carrot', name: '胡萝卜种子', price: 3, emoji: '🥕' },
  'seed-eggplant': { type: 'seed', crop: 'eggplant', name: '茄子种子', price: 6, emoji: '🍆' },
  'seed-strawberry': { type: 'seed', crop: 'strawberry', name: '草莓种子', price: 4, emoji: '🍓' },
  // 道具
  'fertilizer': { type: 'item', name: '化肥', price: 10, emoji: '🧪', effect: 'growth_boost' },
  'water_can': { type: 'item', name: '高级水壶', price: 50, emoji: '🚿', effect: 'auto_water' },
  // 动物
  'animal-chicken': { type: 'animal', animal: 'chicken', name: '小鸡', price: 50, emoji: '🐔' },
  'animal-sheep': { type: 'animal', animal: 'sheep', name: '小羊', price: 200, emoji: '🐑' },
  'animal-cow': { type: 'animal', animal: 'cow', name: '小牛', price: 400, emoji: '🐄' }
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

// 动物栏位类
class AnimalPen {
  constructor(index) {
    this.index = index;
    this.animal = null; // 动物类型
    this.ownedAt = null; // 购买时间
    this.isReady = false; // 是否可以收获
    this.owner = null; // 拥有者
  }

  // 放置动物
  place(animalType, playerName) {
    if (this.animal) return { success: false, message: '栏位已有动物' };
    
    const animal = ANIMALS[animalType];
    if (!animal) return { success: false, message: '未知动物' };
    
    this.animal = animalType;
    this.ownedAt = Date.now();
    this.isReady = false;
    this.owner = playerName;
    return { success: true };
  }

  // 更新动物状态
  updateAnimal() {
    if (!this.animal || this.isReady) return;
    
    const animal = ANIMALS[this.animal];
    const elapsed = (Date.now() - this.ownedAt) / 1000; // 秒
    
    if (elapsed >= animal.growthTime) {
      this.isReady = true;
    }
  }

  // 收获产品
  harvest() {
    if (!this.animal) return { success: false, message: '栏位没有动物' };
    if (!this.isReady) return { success: false, message: '动物还未成熟' };
    
    const animal = ANIMALS[this.animal];
    const reward = animal.productPrice;
    const productName = animal.product;
    
    // 重置状态（动物继续存在，可以再次收获产品）
    this.isReady = false;
    this.ownedAt = Date.now();
    
    return { success: true, reward, product: productName, animalType: this.animal };
  }

  // 出售动物
  sell() {
    if (!this.animal) return { success: false, message: '栏位没有动物' };
    
    const animal = ANIMALS[this.animal];
    const reward = animal.sellPrice;
    const animalType = this.animal;
    
    // 清空栏位
    this.animal = null;
    this.ownedAt = null;
    this.isReady = false;
    this.owner = null;
    
    return { success: true, reward, animalType };
  }

  getState() {
    const animal = this.animal ? ANIMALS[this.animal] : null;
    let remainingTime = null;
    let progress = 0;
    
    if (this.animal && this.ownedAt) {
      const animalConfig = ANIMALS[this.animal];
      const elapsed = (Date.now() - this.ownedAt) / 1000;
      progress = Math.min(1, elapsed / animalConfig.growthTime);
      
      if (!this.isReady) {
        const remaining = Math.max(0, animalConfig.growthTime - elapsed);
        remainingTime = Math.ceil(remaining);
      }
    }
    
    return {
      index: this.index,
      animal: this.animal,
      animalName: animal ? animal.name : null,
      emoji: animal ? animal.emoji : null,
      product: animal ? animal.product : null,
      productPrice: animal ? animal.productPrice : null,
      isReady: this.isReady,
      owner: this.owner,
      progress: progress,
      remainingTime: remainingTime
    };
  }
}

// 农场游戏类
class FarmGame {
  constructor(width = 10, height = 10) {
    this.width = width;
    this.height = height;
    this.plots = []; // 二维数组
    this.animalPens = []; // 动物栏数组
    this.players = new Map(); // socketId -> {name, money, position, dailyTaskProgress, dailyTasksClaimed, achievements, stats, totalTaskRewards}
    this.gameStatus = 'playing';
    this.startTime = Date.now();
    this.lastDailyReset = Date.now(); // 每日重置时间
    
    // 玩家统计数据（用于排行榜）
    this.playerStats = new Map(); // socketId -> { harvests: 0, level: 1, cropsPlanted: 0 }
    
    // 初始化地块
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push(new Plot(x, y));
      }
      this.plots.push(row);
    }
    
    // 初始化动物栏 (6个栏位)
    for (let i = 0; i < 6; i++) {
      this.animalPens.push(new AnimalPen(i));
    }
    
    // 启动生长更新循环
    this.startGrowthLoop();
    
    // 启动每日任务重置检查（每分钟检查一次）
    this.startDailyResetCheck();
  }

  // 检查并执行每日重置
  checkDailyReset() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (now - this.lastDailyReset >= oneDay) {
      this.lastDailyReset = now;
      
      // 重置所有玩家的每日任务进度
      this.players.forEach(player => {
        player.dailyTaskProgress = {};
        player.dailyTasksClaimed = [];
      });
      
      console.log('[Farm] 每日任务已重置');
      return true;
    }
    return false;
  }

  // 启动每日重置检查
  startDailyResetCheck() {
    setInterval(() => {
      this.checkDailyReset();
    }, 60000); // 每分钟检查一次
  }

  // 获取任务配置
  getTasksConfig() {
    return { DAILY_TASKS, ACHIEVEMENTS };
  }

  // 获取玩家任务数据
  getPlayerTasks(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    
    // 合并每日任务进度
    const dailyTasks = DAILY_TASKS.map(task => {
      const progress = player.dailyTaskProgress?.[task.id] || 0;
      const claimed = player.dailyTasksClaimed?.includes(task.id) || false;
      return {
        ...task,
        progress,
        completed: progress >= task.target,
        claimed
      };
    });
    
    // 检查成就状态
    const achievements = ACHIEVEMENTS.map(achievement => {
      const unlocked = player.achievements?.includes(achievement.id) || false;
      return {
        ...achievement,
        unlocked
      };
    });
    
    return {
      dailyTasks,
      achievements,
      totalEarned: player.totalTaskRewards || 0
    };
  }

  // 领取任务奖励
  claimTaskReward(socketId, taskId) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    // 检查是否已领取
    if (player.dailyTasksClaimed?.includes(taskId)) {
      return { success: false, message: '奖励已领取' };
    }
    
    // 查找任务
    const task = DAILY_TASKS.find(t => t.id === taskId);
    if (!task) return { success: false, message: '任务不存在' };
    
    // 检查是否完成
    const progress = player.dailyTaskProgress?.[taskId] || 0;
    if (progress < task.target) {
      return { success: false, message: '任务未完成' };
    }
    
    // 发放奖励
    player.money += task.reward;
    player.totalTaskRewards = (player.totalTaskRewards || 0) + task.reward;
    if (!player.dailyTasksClaimed) player.dailyTasksClaimed = [];
    player.dailyTasksClaimed.push(taskId);
    
    // 保存数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: player.money, 
      color: player.color, 
      position: player.position,
      dailyTaskProgress: player.dailyTaskProgress,
      dailyTasksClaimed: player.dailyTasksClaimed,
      achievements: player.achievements,
      totalTaskRewards: player.totalTaskRewards,
      stats: player.stats
    });
    
    return { 
      success: true, 
      message: `领取 ${task.name} 奖励 +${task.reward} 金币`,
      reward: task.reward
    };
  }

  // 领取成就奖励
  claimAchievementReward(socketId, achievementId) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    // 检查是否已解锁
    if (player.achievements?.includes(achievementId)) {
      return { success: false, message: '成就已解锁' };
    }
    
    // 查找成就
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return { success: false, message: '成就不存在' };
    
    // 验证条件
    const stats = player.stats || { plantCount: 0, waterCount: 0, harvestCount: 0, sellCount: 0, fastHarvest: 0 };
    const money = player.money;
    if (!achievement.condition(stats, money)) {
      return { success: false, message: '成就条件未满足' };
    }
    
    // 发放奖励
    player.money += achievement.reward;
    player.totalTaskRewards = (player.totalTaskRewards || 0) + achievement.reward;
    if (!player.achievements) player.achievements = [];
    player.achievements.push(achievementId);
    
    // 保存数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: player.money, 
      color: player.color, 
      position: player.position,
      dailyTaskProgress: player.dailyTaskProgress,
      dailyTasksClaimed: player.dailyTasksClaimed,
      achievements: player.achievements,
      totalTaskRewards: player.totalTaskRewards,
      stats: player.stats
    });
    
    return { 
      success: true, 
      message: `🏆 解锁成就 ${achievement.name} +${achievement.reward} 金币`,
      reward: achievement.reward,
      achievement
    };
  }

  // 更新任务进度
  updateTaskProgress(socketId, taskType, value = 1) {
    const player = this.players.get(socketId);
    if (!player) return;
    
    // 初始化任务进度
    if (!player.dailyTaskProgress) player.dailyTaskProgress = {};
    if (!player.stats) player.stats = { plantCount: 0, waterCount: 0, harvestCount: 0, sellCount: 0, fastHarvest: 0 };
    
    // 更新每日任务进度
    const task = DAILY_TASKS.find(t => t.type === taskType);
    if (task) {
      if (!player.dailyTaskProgress[task.id]) player.dailyTaskProgress[task.id] = 0;
      player.dailyTaskProgress[task.id] += value;
    }
    
    // 更新统计
    switch (taskType) {
      case 'plant':
        player.stats.plantCount = (player.stats.plantCount || 0) + value;
        player.lastPlantTime = Date.now();
        break;
      case 'water':
        player.stats.waterCount = (player.stats.waterCount || 0) + value;
        break;
      case 'harvest':
        player.stats.harvestCount = (player.stats.harvestCount || 0) + value;
        // 检查快速收获成就
        if (player.lastPlantTime) {
          const timeDiff = Date.now() - player.lastPlantTime;
          if (timeDiff <= 5 * 60 * 1000) { // 5分钟内
            player.stats.fastHarvest = (player.stats.fastHarvest || 0) + 1;
          }
        }
        break;
      case 'earn':
        // 赚取金币任务在收获时统一更新
        break;
      case 'sell':
        player.stats.sellCount = (player.stats.sellCount || 0) + value;
        break;
    }
    
    // 检查并自动更新赚取金币任务
    if (taskType === 'harvest' || taskType === 'sell') {
      const earnTask = DAILY_TASKS.find(t => t.type === 'earn');
      if (earnTask) {
        if (!player.dailyTaskProgress[earnTask.id]) player.dailyTaskProgress[earnTask.id] = 0;
        // 累加总金币数作为进度（这里简化为当前金币）
        player.dailyTaskProgress[earnTask.id] = player.money;
      }
    }
  }
  
  // 计算玩家等级（基于收获次数）
  calculateLevel(harvests) {
    if (harvests >= 100) return 10;
    if (harvests >= 80) return 9;
    if (harvests >= 60) return 8;
    if (harvests >= 45) return 7;
    if (harvests >= 30) return 6;
    if (harvests >= 20) return 5;
    if (harvests >= 12) return 4;
    if (harvests >= 6) return 3;
    if (harvests >= 2) return 2;
    return 1;
  }
  
  // 获取排行榜数据
  getLeaderboard(type = 'money') {
    const allPlayers = Array.from(this.players.values());
    
    return allPlayers.map(p => {
      const playerStats = this.playerStats.get(p.id) || { harvests: 0, level: 1, cropsPlanted: 0 };
      return {
        name: p.name,
        money: p.money,
        harvests: playerStats.harvests,
        level: this.calculateLevel(playerStats.harvests),
        cropsPlanted: playerStats.cropsPlanted
      };
    }).sort((a, b) => {
      if (type === 'money') return b.money - a.money;
      if (type === 'level') return b.level - a.level;
      if (type === 'harvests') return b.harvests - a.harvests;
      return 0;
    }).slice(0, 10);
  }

  startGrowthLoop() {
    setInterval(() => {
      // 更新作物生长
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          this.plots[y][x].updateGrowth();
        }
      }
      // 更新动物状态
      for (const pen of this.animalPens) {
        pen.updateAnimal();
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
      name: savedPlayer && savedPlayer.name || playerName,
      money: savedPlayer && savedPlayer.money || 50, // 初始资金，如果没有保存数据则为50
      color: savedPlayer && savedPlayer.color || colors[this.players.size % colors.length],
      position: savedPlayer && savedPlayer.position || { x: 0, y: 0 },
      inventory: savedPlayer && savedPlayer.inventory || {}, // 背包物品 { cropType: count }
      items: savedPlayer && savedPlayer.items || {}, // 道具 { itemId: count }
      // 任务系统数据
      dailyTaskProgress: savedPlayer && savedPlayer.dailyTaskProgress || {},
      dailyTasksClaimed: savedPlayer && savedPlayer.dailyTasksClaimed || [],
      achievements: savedPlayer && savedPlayer.achievements || [],
      stats: savedPlayer && savedPlayer.stats || { plantCount: 0, waterCount: 0, harvestCount: 0, sellCount: 0, fastHarvest: 0 },
      totalTaskRewards: savedPlayer && savedPlayer.totalTaskRewards || 0
    };
    this.players.set(socketId, player);
    
    // 初始化玩家统计数据
    const savedStats = dataStore.getPlayerStats(socketId);
    this.playerStats.set(socketId, savedStats || { harvests: 0, cropsPlanted: 0 });
    
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
      
      // 更新玩家统计数据
      const stats = this.playerStats.get(socketId) || { harvests: 0, cropsPlanted: 0 };
      stats.cropsPlanted = (stats.cropsPlanted || 0) + 1;
      this.playerStats.set(socketId, stats);
      dataStore.savePlayerStats(socketId, stats);
      
      // 更新任务进度
      this.updateTaskProgress(socketId, 'plant', 1);
      
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
      // 更新任务进度
      this.updateTaskProgress(socketId, 'water', 1);
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
      
      // 添加到背包
      this.addToInventory(socketId, result.cropType, 1);
      
      player.money += result.reward;
      
      // 更新玩家统计数据
      const stats = this.playerStats.get(socketId) || { harvests: 0, cropsPlanted: 0 };
      stats.harvests = (stats.harvests || 0) + 1;
      this.playerStats.set(socketId, stats);
      dataStore.savePlayerStats(socketId, stats);
      
      // 更新任务进度
      this.updateTaskProgress(socketId, 'harvest', 1);
      
      // 保存玩家数据
      dataStore.savePlayer(socketId, { name: player.name, money: player.money, color: player.color, position: player.position, inventory: player.inventory, items: player.items });
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

  // 添加物品到背包
  addToInventory(socketId, cropType, quantity = 1) {
    const player = this.players.get(socketId);
    if (!player) return false;
    
    if (!player.inventory[cropType]) {
      player.inventory[cropType] = 0;
    }
    player.inventory[cropType] += quantity;
    return true;
  }

  // 从背包移除物品
  removeFromInventory(socketId, cropType, quantity = 1) {
    const player = this.players.get(socketId);
    if (!player || !player.inventory[cropType] || player.inventory[cropType] < quantity) {
      return false;
    }
    player.inventory[cropType] -= quantity;
    if (player.inventory[cropType] <= 0) {
      delete player.inventory[cropType];
    }
    return true;
  }

  // 获取背包内容
  getInventory(socketId) {
    const player = this.players.get(socketId);
    return player ? player.inventory : {};
  }

  // 购买物品
  buyItem(socketId, itemId, quantity = 1) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const item = SHOP_ITEMS[itemId];
    if (!item) return { success: false, message: '物品不存在' };
    
    const totalCost = item.price * quantity;
    if (player.money < totalCost) {
      return { success: false, message: '金币不足' };
    }
    
    player.money -= totalCost;
    
    if (item.type === 'seed') {
      // 种子直接放入背包
      if (!player.inventory[item.crop]) {
        player.inventory[item.crop] = 0;
      }
      player.inventory[item.crop] += quantity;
    } else if (item.type === 'item') {
      // 道具放入道具栏
      if (!player.items[itemId]) {
        player.items[itemId] = 0;
      }
      player.items[itemId] += quantity;
    }
    
    // 保存玩家数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: player.money, 
      color: player.color, 
      position: player.position,
      inventory: player.inventory,
      items: player.items
    });
    
    // 记录操作日志
    dataStore.logAction(socketId, player.name, 'buy', { itemId, quantity, cost: totalCost });
    
    return { 
      success: true, 
      message: `购买 ${item.name} x${quantity} 花费 ${totalCost} 金币`,
      inventory: player.inventory,
      items: player.items
    };
  }

  // 出售物品
  sellItem(socketId, cropType, quantity = 1) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    if (!player.inventory[cropType] || player.inventory[cropType] < quantity) {
      return { success: false, message: '背包中没有足够的物品' };
    }
    
    const crop = CROPS[cropType];
    if (!crop) return { success: false, message: '未知作物' };
    
    const totalReward = crop.sellPrice * quantity;
    player.inventory[cropType] -= quantity;
    
    if (player.inventory[cropType] <= 0) {
      delete player.inventory[cropType];
    }
    
    player.money += totalReward;
    
    // 更新任务进度（出售任务和赚取金币任务）
    this.updateTaskProgress(socketId, 'sell', quantity);
    
    // 保存玩家数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: player.money, 
      color: player.color, 
      position: player.position,
      inventory: player.inventory,
      items: player.items,
      dailyTaskProgress: player.dailyTaskProgress,
      dailyTasksClaimed: player.dailyTasksClaimed,
      achievements: player.achievements,
      stats: player.stats,
      totalTaskRewards: player.totalTaskRewards
    });
    
    // 记录操作日志
    dataStore.logAction(socketId, player.name, 'sell', { cropType, quantity, reward: totalReward });
    
    return { 
      success: true, 
      message: `出售 ${crop.name} x${quantity} 获得 ${totalReward} 金币`,
      reward: totalReward,
      inventory: player.inventory
    };
  }

  // 使用道具
  useItem(socketId, itemId) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    if (!player.items[itemId] || player.items[itemId] <= 0) {
      return { success: false, message: '没有该道具' };
    }
    
    const item = SHOP_ITEMS[itemId];
    if (!item) return { success: false, message: '物品不存在' };
    
    const { x, y } = player.position;
    const plot = this.plots[y][x];
    
    if (item.effect === 'growth_boost') {
      // 化肥：加速当前格子作物生长
      if (!plot.crop) return { success: false, message: '没有作物可使用化肥' };
      
      // 直接成熟
      plot.growthStage = 3;
      
      player.items[itemId]--;
      if (player.items[itemId] <= 0) delete player.items[itemId];
      
      // 保存数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: player.money, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      return { success: true, message: '使用化肥，作物瞬间成熟！' };
    }
    
    return { success: false, message: '该道具无法在此使用' };
  }

  // 购买动物
  buyAnimal(socketId, animalType) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const animal = ANIMALS[animalType];
    if (!animal) return { success: false, message: '未知动物' };
    
    if (player.money < animal.buyPrice) {
      return { success: false, message: '金币不足' };
    }
    
    // 找到空栏位
    const emptyPen = this.animalPens.find(pen => !pen.animal);
    if (!emptyPen) {
      return { success: false, message: '动物栏已满' };
    }
    
    // 扣金币
    player.money -= animal.buyPrice;
    
    // 放置动物
    const result = emptyPen.place(animalType, player.name);
    if (!result.success) {
      player.money += animal.buyPrice; // 恢复金币
      return result;
    }
    
    // 保存玩家数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: player.money, 
      color: player.color, 
      position: player.position,
      inventory: player.inventory,
      items: player.items
    });
    
    // 记录操作日志
    dataStore.logAction(socketId, player.name, 'buy-animal', { animalType, cost: animal.buyPrice });
    
    return { 
      success: true, 
      message: `购买 ${animal.emoji}${animal.name} 花费 ${animal.buyPrice} 金币`,
      penIndex: emptyPen.index,
      animalType
    };
  }

  // 收获动物产品
  harvestAnimalProduct(socketId, penIndex) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const pen = this.animalPens[penIndex];
    if (!pen) return { success: false, message: '栏位不存在' };
    
    if (!pen.animal) return { success: false, message: '栏位没有动物' };
    if (!pen.isReady) {
      const animal = ANIMALS[pen.animal];
      const remaining = pen.remainingTime || 0;
      return { success: false, message: `${animal.name}还需要 ${remaining} 秒产出产品` };
    }
    
    const result = pen.harvest();
    if (result.success) {
      // 添加产品到背包
      const productKey = `animal-${result.animalType}-product`;
      this.addToInventory(socketId, productKey, 1);
      
      // 加金币
      player.money += result.reward;
      
      // 保存玩家数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: player.money, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'harvest-animal', { 
        penIndex, 
        animalType: result.animalType, 
        product: result.product, 
        reward: result.reward 
      });
    }
    
    return { 
      success: true, 
      message: `收获 ${result.product} +${result.reward}金币`,
      reward: result.reward,
      product: result.product
    };
  }

  // 出售动物
  sellAnimal(socketId, penIndex) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const pen = this.animalPens[penIndex];
    if (!pen) return { success: false, message: '栏位不存在' };
    
    const result = pen.sell();
    if (result.success) {
      // 加金币
      player.money += result.reward;
      
      // 保存玩家数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: player.money, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'sell-animal', { 
        penIndex, 
        animalType: result.animalType, 
        reward: result.reward 
      });
    }
    
    return { 
      success: true, 
      message: `出售 ${ANIMALS[result.animalType].emoji}${ANIMALS[result.animalType].name} +${result.reward}金币`,
      reward: result.reward
    };
  }

  // 出售动物产品
  sellAnimalProduct(socketId, productKey, quantity = 1) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    // 解析产品key: animal-{animalType}-product
    const match = productKey.match(/^animal-(.+)-product$/);
    if (!match) return { success: false, message: '无效的产品' };
    
    const animalType = match[1];
    const animal = ANIMALS[animalType];
    if (!animal) return { success: false, message: '未知动物产品' };
    
    if (!player.inventory[productKey] || player.inventory[productKey] < quantity) {
      return { success: false, message: '背包中没有足够的产品' };
    }
    
    const totalReward = animal.productPrice * quantity;
    player.inventory[productKey] -= quantity;
    
    if (player.inventory[productKey] <= 0) {
      delete player.inventory[productKey];
    }
    
    player.money += totalReward;
    
    // 保存玩家数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: player.money, 
      color: player.color, 
      position: player.position,
      inventory: player.inventory,
      items: player.items
    });
    
    // 记录操作日志
    dataStore.logAction(socketId, player.name, 'sell-animal-product', { 
      animalType, 
      quantity, 
      reward: totalReward 
    });
    
    return { 
      success: true, 
      message: `出售 ${animal.product} x${quantity} 获得 ${totalReward} 金币`,
      reward: totalReward,
      inventory: player.inventory
    };
  }

  // 获取商店物品列表
  getShopItems() {
    return SHOP_ITEMS;
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
      animalPens: this.animalPens.map(pen => pen.getState()),
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        money: p.money,
        color: p.color,
        position: p.position,
        inventory: p.inventory,
        items: p.items,
        // 任务数据
        dailyTaskProgress: p.dailyTaskProgress || {},
        dailyTasksClaimed: p.dailyTasksClaimed || [],
        achievements: p.achievements || [],
        stats: p.stats || { plantCount: 0, waterCount: 0, harvestCount: 0, sellCount: 0, fastHarvest: 0 },
        totalTaskRewards: p.totalTaskRewards || 0
      })),
      gameStatus: this.gameStatus,
      crops: CROPS,
      animals: ANIMALS,
      shopItems: SHOP_ITEMS,
      gameDay: gameDay,
      gameTime: elapsedSeconds,
      // 任务配置
      taskConfig: {
        dailyTasks: DAILY_TASKS,
        achievements: ACHIEVEMENTS
      }
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

module.exports = { FarmGame, RoomManager, CROPS, ANIMALS, SHOP_ITEMS };

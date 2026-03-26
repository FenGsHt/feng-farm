// 多人种田游戏逻辑
const dataStore = require('./dataStore');
const antiCheat = require('./antiCheat');
const { Farmer } = require('./farmer');

// ========== 天气系统 ==========
const WEATHER_TYPES = {
  sunny: { 
    name: '晴天', 
    emoji: '☀️', 
    description: '作物正常生长，土壤水分蒸发较快',
    moistureChange: -5, // 每tick湿度变化
    growthMultiplier: 1.0,
    pestChance: 0.1,
    color: '#FFF9C4'
  },
  rainy: { 
    name: '雨天', 
    emoji: '🌧️', 
    description: '自动浇水，作物生长加速！土壤保持湿润',
    moistureChange: +10,
    growthMultiplier: 1.3,
    pestChance: 0.05,
    color: '#90CAF9'
  },
  stormy: { 
    name: '暴风雨', 
    emoji: '⛈️', 
    description: '作物可能被损坏！需要及时保护',
    moistureChange: +20,
    growthMultiplier: 0.7,
    pestChance: 0.3,
    damageChance: 0.2, // 作物损坏几率
    color: '#5C6BC0'
  },
  foggy: { 
    name: '雾天', 
    emoji: '🌫️', 
    description: '害虫活跃期，注意防治！',
    moistureChange: 0,
    growthMultiplier: 0.9,
    pestChance: 0.4,
    color: '#B0BEC5'
  },
  snowy: { 
    name: '雪天', 
    emoji: '❄️', 
    description: '只有抗寒作物才能生长！',
    moistureChange: -10,
    growthMultiplier: 0.3,
    pestChance: 0.02,
    damageChance: 0.3,
    coldOnly: ['wheat'], // 只允许耐寒作物
    color: '#E1F5FE'
  }
};

// ========== 害虫系统 ==========
const PEST_TYPES = {
  aphid: {
    name: '蚜虫',
    emoji: '🐛',
    description: '常见害虫，啃食幼嫩作物',
    damage: 1,
    spreadRate: 0.3,
    killPrice: 5
  },
  locust: {
    name: '蝗虫',
    emoji: '🦗',
    description: '成群出现，造成大面积损害！',
    damage: 2,
    spreadRate: 0.5,
    killPrice: 15
  },
  rat: {
    name: '老鼠',
    emoji: '🐀',
    description: '悄悄出现，偷吃成熟的作物',
    damage: 3,
    stealChance: 0.3,
    killPrice: 25
  }
};

// 抗虫道具
const ANTI_PEST_ITEMS = {
  'pesticide': { name: '杀虫剂', price: 20, emoji: '🧴', effect: 'kill_pest' },
  'bug_net': { name: '防虫网', price: 50, emoji: '🕸️', effect: 'prevent_pest', duration: 300 },
  'scarer': { name: '稻草人', price: 100, emoji: '🎃', effect: 'scare_pest', duration: 600 }
};

// ========== 市场供需系统 ==========
const MARKET_EVENT_TYPES = {
  demand_surge: {
    name: '需求暴涨',
    emoji: '📈',
    description: '市场对该作物需求激增！',
    priceMultiplier: 1.3,  // +30%
    duration: 300,  // 5分钟
    category: 'all'  // 适用于所有作物
  },
  oversupply: {
    name: '丰收过剩',
    emoji: '📉',
    description: '市场供应过剩，价格下跌...',
    priceMultiplier: 0.8,  // -20%
    duration: 300,
    category: 'all'
  },
  festival: {
    name: '节日庆典',
    emoji: '🎉',
    description: '节日庆典，农产品价格上涨！',
    priceMultiplier: 1.2,  // +20%
    duration: 600,  // 10分钟
    category: 'all'
  },
  special_order: {
    name: '特殊订单',
    emoji: '📋',
    description: '收到一笔特殊订单，高价收购！',
    priceMultiplier: 1.5,  // +50%
    duration: 180,  // 3分钟
    category: 'all'
  }
};

// 每种作物的市场状态默认值
const DEFAULT_CROP_MARKET_STATE = {
  totalSold: 0,           // 累计销售量
  priceModifier: 1.0,     // 价格修正系数
  recentSales: []         // 最近销售记录 [{timestamp, quantity}]
};

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

// ========== 农场等级系统配置 ==========
const CROP_XP = {
  // 谷物
  wheat: 10,
  corn: 100,         // 玉米 100 XP
  rice: 30,
  // 蔬菜
  tomato: 15,
  carrot: 20,        // 胡萝卜 20 XP
  eggplant: 40,      // 茄子 40 XP
  cucumber: 25,
  pumpkin: 50,
  // 水果
  strawberry: 30,   // 草莓 30 XP
  watermelon: 45,
  grape: 80,
  apple: 120,
  // 经济作物
  cotton: 60,
  tea: 75
};

// 每级所需经验值（指数增长）
function getXpForLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

// 计算等级（基于经验值）
function calculateLevelFromXp(totalXp) {
  let level = 1;
  let xpNeeded = getXpForLevel(1);
  let xpAccumulated = 0;
  
  while (xpAccumulated + xpNeeded <= totalXp && level < 50) {
    xpAccumulated += xpNeeded;
    level++;
    xpNeeded = getXpForLevel(level);
  }
  
  return { level: Math.min(level, 50), currentXp: totalXp - xpAccumulated, xpNeeded };
}

// 计算金币加成（每级+1%）
function getCoinBonusMultiplier(level) {
  return 1 + (level - 1) * 0.01;
}

// 作物配置
const CROPS = {
  // 谷物（growthTime 单位：秒，浇水后速度 ×1.5）
  wheat:      { name: '小麦',   growthTime: 180,  sellPrice: 10,  seedPrice: 2,  emoji: '🌾', category: 'grain' },      // 3 min
  corn:       { name: '玉米',   growthTime: 900,  sellPrice: 60,  seedPrice: 12, emoji: '🌽', category: 'grain' },      // 15 min
  rice:       { name: '水稻',   growthTime: 600,  sellPrice: 45,  seedPrice: 8,  emoji: '🍚', category: 'grain' },      // 10 min
  // 蔬菜
  tomato:     { name: '番茄',   growthTime: 420,  sellPrice: 25,  seedPrice: 5,  emoji: '🍅', category: 'vegetable' },  // 7 min
  carrot:     { name: '胡萝卜', growthTime: 150,  sellPrice: 15,  seedPrice: 3,  emoji: '🥕', category: 'vegetable' },  // 2.5 min
  eggplant:   { name: '茄子',   growthTime: 480,  sellPrice: 30,  seedPrice: 6,  emoji: '🍆', category: 'vegetable' },  // 8 min
  cucumber:   { name: '黄瓜',   growthTime: 300,  sellPrice: 20,  seedPrice: 4,  emoji: '🥒', category: 'vegetable' },  // 5 min
  pumpkin:    { name: '南瓜',   growthTime: 1200, sellPrice: 80,  seedPrice: 15, emoji: '🎃', category: 'vegetable' },  // 20 min
  // 水果
  strawberry: { name: '草莓',   growthTime: 240,  sellPrice: 20,  seedPrice: 4,  emoji: '🍓', category: 'fruit' },     // 4 min
  watermelon: { name: '西瓜',   growthTime: 900,  sellPrice: 50,  seedPrice: 10, emoji: '🍉', category: 'fruit' },     // 15 min
  grape:      { name: '葡萄',   growthTime: 1800, sellPrice: 100, seedPrice: 20, emoji: '🍇', category: 'fruit' },     // 30 min
  apple:      { name: '苹果',   growthTime: 3600, sellPrice: 150, seedPrice: 30, emoji: '🍎', category: 'fruit' },     // 60 min
  // 经济作物
  cotton:     { name: '棉花',   growthTime: 1500, sellPrice: 70,  seedPrice: 14, emoji: '☁️', category: 'cash' },     // 25 min
  tea:        { name: '茶叶',   growthTime: 2400, sellPrice: 90,  seedPrice: 18, emoji: '🍵', category: 'cash' }       // 40 min
};

// 动物配置
const ANIMALS = {
  // 家禽
  chicken: { name: '鸡', growthTime: 60, sellPrice: 30, buyPrice: 50, emoji: '🐔', product: '鸡蛋', productPrice: 5 },
  duck: { name: '鸭', growthTime: 80, sellPrice: 45, buyPrice: 80, emoji: '🦆', product: '鸭蛋', productPrice: 8 },
  // 畜牧
  sheep: { name: '羊', growthTime: 120, sellPrice: 100, buyPrice: 200, emoji: '🐑', product: '羊毛', productPrice: 20 },
  cow: { name: '牛', growthTime: 180, sellPrice: 200, buyPrice: 400, emoji: '🐄', product: '牛奶', productPrice: 30 },
  pig: { name: '猪', growthTime: 150, sellPrice: 150, buyPrice: 300, emoji: '🐖', product: '猪肉', productPrice: 40 },
  horse: { name: '马', growthTime: 240, sellPrice: 350, buyPrice: 700, emoji: '🐴', product: '马奶', productPrice: 50 },
  // 特殊
  rabbit: { name: '兔子', growthTime: 90, sellPrice: 60, buyPrice: 120, emoji: '🐰', product: '兔毛', productPrice: 15 },
  bee: { name: '蜜蜂', growthTime: 120, sellPrice: 40, buyPrice: 80, emoji: '🐝', product: '蜂蜜', productPrice: 4 }
};

// 食物配置（供农夫进食使用）
const FARMER_FOODS = {
  'food-bread':     { name: '面包',   emoji: '🍞', price: 12,  satiety: 25 },
  'food-rice-bowl': { name: '米饭',   emoji: '🍚', price: 25, satiety: 40 },
  'food-meat':      { name: '肉食',   emoji: '🥩', price: 45, satiety: 65 },
  'food-feast':     { name: '大餐',   emoji: '🍱', price: 80, satiety: 100 },
};

// 商店物品配置
const SHOP_ITEMS = {
  // 谷物种子
  'seed-wheat': { type: 'seed', crop: 'wheat', name: '小麦种子', price: 2, emoji: '🌾' },
  'seed-corn': { type: 'seed', crop: 'corn', name: '玉米种子', price: 12, emoji: '🌽' },
  'seed-rice': { type: 'seed', crop: 'rice', name: '水稻种子', price: 8, emoji: '🍚' },
  // 蔬菜种子
  'seed-tomato': { type: 'seed', crop: 'tomato', name: '番茄种子', price: 5, emoji: '🍅' },
  'seed-carrot': { type: 'seed', crop: 'carrot', name: '胡萝卜种子', price: 3, emoji: '🥕' },
  'seed-eggplant': { type: 'seed', crop: 'eggplant', name: '茄子种子', price: 6, emoji: '🍆' },
  'seed-cucumber': { type: 'seed', crop: 'cucumber', name: '黄瓜种子', price: 4, emoji: '🥒' },
  'seed-pumpkin': { type: 'seed', crop: 'pumpkin', name: '南瓜种子', price: 15, emoji: '🎃' },
  // 水果种子
  'seed-strawberry': { type: 'seed', crop: 'strawberry', name: '草莓种子', price: 4, emoji: '🍓' },
  'seed-watermelon': { type: 'seed', crop: 'watermelon', name: '西瓜种子', price: 10, emoji: '🍉' },
  'seed-grape': { type: 'seed', crop: 'grape', name: '葡萄种子', price: 20, emoji: '🍇' },
  'seed-apple': { type: 'seed', crop: 'apple', name: '苹果种子', price: 30, emoji: '🍎' },
  // 经济作物
  'seed-cotton': { type: 'seed', crop: 'cotton', name: '棉花种子', price: 14, emoji: '☁️' },
  'seed-tea': { type: 'seed', crop: 'tea', name: '茶树种子', price: 18, emoji: '🍵' },
  // 道具
  'fertilizer': { type: 'item', name: '化肥', price: 10, emoji: '🧪', effect: 'growth_boost' },
  'water_can': { type: 'item', name: '高级水壶', price: 50, emoji: '🚿', effect: 'auto_water' },
  // 害虫防治道具
  'pesticide': { type: 'item', name: '杀虫剂', price: 20, emoji: '🧴', effect: 'kill_pest' },
  'bug_net': { type: 'item', name: '防虫网', price: 50, emoji: '🕸️', effect: 'prevent_pest' },
  'scarecrow': { type: 'item', name: '稻草人', price: 100, emoji: '🎃', effect: 'scare_pest' },
  // 动物 - 家禽
  'animal-chicken': { type: 'animal', animal: 'chicken', name: '小鸡', price: 50, emoji: '🐔' },
  'animal-duck': { type: 'animal', animal: 'duck', name: '小鸭', price: 80, emoji: '🦆' },
  // 动物 - 畜牧
  'animal-sheep': { type: 'animal', animal: 'sheep', name: '小羊', price: 200, emoji: '🐑' },
  'animal-cow': { type: 'animal', animal: 'cow', name: '小牛', price: 400, emoji: '🐄' },
  'animal-pig': { type: 'animal', animal: 'pig', name: '小猪', price: 300, emoji: '🐖' },
  'animal-horse': { type: 'animal', animal: 'horse', name: '小马', price: 700, emoji: '🐴' },
  // 动物 - 特殊
  'animal-rabbit': { type: 'animal', animal: 'rabbit', name: '小兔', price: 120, emoji: '🐰' },
  'animal-bee': { type: 'animal', animal: 'bee', name: '蜜蜂群', price: 80, emoji: '🐝' },
  // 动物饲料
  'animal-feed-basic':  { type: 'animal-feed', name: '普通饲料', emoji: '🌾', price: 5,  hungerReduce: 30,  desc: '普通饲料，减少饥饿度30%' },
  'animal-feed-premium':{ type: 'animal-feed', name: '高级饲料', emoji: '🥬', price: 12, hungerReduce: 60,  desc: '营养饲料，减少饥饿度60%' },
  'animal-feed-super':  { type: 'animal-feed', name: '特级饲料', emoji: '🍎', price: 25, hungerReduce: 100, desc: '特级饲料，完全吃饱' },
  // 农夫食物
  'food-bread':     { type: 'farmer-food', name: '面包',   emoji: '🍞', price: 5,  satiety: 25,  desc: '简单充饥，回复饱腹 25%' },
  'food-rice-bowl': { type: 'farmer-food', name: '米饭',   emoji: '🍚', price: 10, satiety: 40,  desc: '家常便饭，回复饱腹 40%' },
  'food-meat':      { type: 'farmer-food', name: '肉食',   emoji: '🥩', price: 18, satiety: 65,  desc: '营养丰富，回复饱腹 65%' },
  'food-feast':     { type: 'farmer-food', name: '大餐',   emoji: '🍱', price: 35, satiety: 100, desc: '丰盛大餐，完全填饱！' },
  // 雇佣农夫（价格动态计算，此处为基础值占位）
  'hire-farmer':    { type: 'hire-farmer', name: '雇佣农夫', emoji: '👨‍🌾', price: 500, desc: '雇佣一名新农夫，价格随人数增加' },
};

// 地块类
class Plot {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.soilMoisture = 50; // 土壤湿度 0-100
    this.fertility = 100; // 土地肥力 0-100，初始满肥力
    this.fallowTime = 0; // 闲置累计时间（秒）
    this.crop = null; // 作物类型
    this.plantedAt = null; // 种植时间
    this.growthStage = 0; // 0-3 (0=种子, 1=幼苗, 2=生长中, 3=成熟)
    this.isWatered = false;
    this.owner = null; // 种植者
  }

  // 获取肥力效果
  getFertilityEffect() {
    if (this.fertility >= 80) {
      return { growthMultiplier: 1.2, yieldMultiplier: 1.1, level: 'excellent' }; // 肥力 80-100：生长速度 +20%，产量 +10%
    } else if (this.fertility >= 50) {
      return { growthMultiplier: 1.0, yieldMultiplier: 1.0, level: 'normal' }; // 肥力 50-79：正常
    } else if (this.fertility >= 20) {
      return { growthMultiplier: 0.8, yieldMultiplier: 0.85, level: 'poor' }; // 肥力 20-49：生长速度 -20%，产量 -15%
    } else {
      return { growthMultiplier: 0.5, yieldMultiplier: 0.6, level: 'depleted' }; // 肥力 0-19：生长速度 -50%，产量 -40%
    }
  }

  // 恢复肥力（每秒调用一次）
  recoverFertility() {
    // 只有闲置时才恢复肥力
    if (!this.crop) {
      this.fallowTime++;
      // 每秒恢复1点肥力
      this.fertility = Math.min(100, this.fertility + 1);
    } else {
      this.fallowTime = 0;
    }
  }

  // 使用有机肥恢复肥力
  useFertilizer(amount = 50) {
    this.fertility = Math.min(100, this.fertility + amount);
    return { success: true, newFertility: this.fertility };
  }

  // 种植
  plant(cropType, playerName) {
    if (this.crop) return { success: false, message: '这块地已经有作物了' };
    if (this.fertility <= 0) return { success: false, message: '这块地肥力耗尽，无法种植！请使用有机肥恢复肥力' };

    this.crop = cropType;
    this.plantedAt = Date.now();
    this.growthStage = 0;
    this.owner = playerName;
    this.isWatered = false;
    this.fallowTime = 0;
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
    const harvestedCrop = this.crop;

    // 根据肥力计算产量
    const fertilityEffect = this.getFertilityEffect();
    const baseReward = crop.sellPrice;
    const reward = Math.floor(baseReward * fertilityEffect.yieldMultiplier);

    // 消耗肥力
    const fertilityCost = crop.fertilityCost || 10; // 默认消耗10点肥力
    this.fertility = Math.max(0, this.fertility - fertilityCost);

    // 重置地块
    this.crop = null;
    this.plantedAt = null;
    this.growthStage = 0;
    this.owner = null;
    this.isWatered = false;

    return { success: true, reward, cropType: harvestedCrop, fertilityUsed: fertilityCost };
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

    // 肥力影响生长速度
    const fertilityEffect = this.getFertilityEffect();
    effectiveTime *= fertilityEffect.growthMultiplier;

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
    const fertilityEffect = this.getFertilityEffect();
    return {
      x: this.x,
      y: this.y,
      soilMoisture: this.soilMoisture,
      fertility: this.fertility,
      fertilityLevel: fertilityEffect.level,
      growthMultiplier: fertilityEffect.growthMultiplier,
      yieldMultiplier: fertilityEffect.yieldMultiplier,
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
    this.hunger = 0;  // 动物饥饿度 0=饱 100=非常饿
    this._growthTicks = 0; // 内部计数器，用于控制饥饿增速
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

  // 更新动物状态（每1s调用一次）
  updateAnimal() {
    if (!this.animal) return;

    // 饥饿增加（每20s +4，约500s=8分钟到达饥饿阈值60）
    this._growthTicks = (this._growthTicks || 0) + 1;
    if (this._growthTicks % 20 === 0) {
      this.hunger = Math.min(100, (this.hunger || 0) + 4);
    }

    // 过饿时生产暂停（饥饿度>=80则不再更新 isReady）
    if (this.isReady || (this.hunger || 0) >= 80) return;

    const animal = ANIMALS[this.animal];
    const elapsed = (Date.now() - this.ownedAt) / 1000;
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
      remainingTime: remainingTime,
      hunger: this.hunger || 0,
      isHungry: (this.hunger || 0) >= 60,
      isStarving: (this.hunger || 0) >= 80
    };
  }
}

// 农场游戏类
class FarmGame {
  constructor(width = 10, height = 10, roomId = 'default') {
    this.roomId = roomId;
    this.width = width;
    this.height = height;
    this.plots = []; // 二维数组
    this.animalPens = []; // 动物栏数组
    this.players = new Map(); // socketId -> {name, money, position, dailyTaskProgress, dailyTasksClaimed, achievements, stats, totalTaskRewards}
    this.gameStatus = 'playing';
    this.startTime = Date.now();
    this.lastDailyReset = Date.now(); // 每日重置时间
    
    // ========== 天气系统 ==========
    this.weather = 'sunny'; // 当前天气
    this.weatherChangeTimer = 0; // 天气变化计时器
    this.weatherDuration = 300; // 天气持续时间（秒）
    
    // ========== 害虫系统 ==========
    this.pests = []; // 活跃的害虫 [{type, x, y, turnsRemaining}]
    this.pestSpawnTimer = 0; // 害虫生成计时器
    
    // 玩家统计数据（用于排行榜）
    this.playerStats = new Map(); // socketId -> { harvests: 0, level: 1, cropsPlanted: 0 }
    
    // ========== 动物地图显示系统 ==========
    this.wanderingAnimals = []; // 在地图上 wandering 的动物 [{id, type, x, y, owner, moveTimer}]
    this.animalPositions = {}; // 动物栏索引 -> 地图位置 {penIndex: {x, y}}
    
    // 初始化地块
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push(new Plot(x, y));
      }
      this.plots.push(row);
    }
    
    // 初始化动物栏 (12个栏位)
    for (let i = 0; i < 12; i++) {
      this.animalPens.push(new AnimalPen(i));
    }
    
    // 保存定时器ID，用于销毁时清理
    this._intervals = [];

    // ========== 农场日志 ==========
    this.farmLog = []; // [{ time, message, emoji, type }]

    // ========== 共用金库 ==========
    this.sharedMoney = 1000; // 所有玩家 + 农夫共用的金币池

    // ========== 黄金交易系统 ==========
    this.goldAmount = 0;           // 持有黄金数量（克）
    this.goldPrice = 1000;         // 当前金价（金币/克），初始值约等于人民币价格
    this.goldPriceHistory = [];    // 金价历史 [{time, price}]
    this.lastGoldPriceUpdate = 0;  // 上次更新时间

    // 暴露动物配置，供 farmer.js 访问（避免循环 require）
    this.ANIMALS = ANIMALS;

    // ========== 农夫列表（多农夫支持）==========
    this.farmers = [];
    this._savedFarmerData = null; // _loadState() 会填充

    // ========== 农夫AI思考记录 ==========
    this.farmerThoughts = []; // 最近思考记录

    // ========== 农夫工资系统 ==========
    this.lastSalaryTime = Date.now(); // 上次工资结算时间
    this.unpaidSalary = 0;            // 累计欠薪
    this.totalSalaryPaid = 0;         // 累计已发工资

    // ========== 税收系统 ==========
    this.lastTaxTime = Date.now();    // 上次征税时间
    this.totalTaxPaid = 0;            // 累计缴税
    this.gameCreatedAt = Date.now();  // 游戏创建时间（用于新玩家保护）

    // ========== 市场供需系统 ==========
    this.marketState = {
      crops: {},  // { cropType: { totalSold, priceModifier, recentSales } }
      activeEvents: []  // [{ eventType, cropType, startTime, duration }]
    };
    // 初始化所有作物的市场状态
    for (const cropType of Object.keys(CROPS)) {
      this.marketState.crops[cropType] = { ...DEFAULT_CROP_MARKET_STATE };
    }
    this.lastPriceRecovery = Date.now();  // 上次价格恢复时间

    // 启动生长更新循环
    this.startGrowthLoop();

    // 启动动物移动循环
    this.startAnimalMovementLoop();

    // 启动每日任务重置检查（每分钟检查一次）
    this.startDailyResetCheck();

    // 启动天气变化循环（每5秒检查一次天气变化）
    this.startWeatherLoop();

    // 启动害虫生成循环
    this.startPestLoop();

    // 启动金价更新循环（每小时更新一次）
    this.startGoldPriceLoop();

    // 启动农夫AI思考循环（每30分钟思考一次）
    this.startFarmerAILoop();

    // 启动农夫工资结算循环（每分钟检查一次整点结算）
    this.startSalaryLoop();

    // 启动税收征收循环（每分钟检查一次）
    this.startTaxLoop();

    // 启动市场供需循环（价格恢复和事件检查）
    this.startMarketLoop();

    // ========== 加载已保存的状态 ==========
    this._loadState();

    // 初始化农夫（基于存档数据或默认一名）
    this._initFarmers();

    // 每 15 秒定期保存一次游戏状态
    this._intervals.push(setInterval(() => this._saveState(), 15000));
  }

  // ========== 状态持久化 ==========

  // 从 dataStore 加载已保存的房间状态（启动时调用）
  _loadState() {
    const saved = dataStore.getRoomState(this.roomId);
    if (!saved) return;

    // 共用金库
    if (typeof saved.sharedMoney === 'number' && saved.sharedMoney >= 0) {
      this.sharedMoney = saved.sharedMoney;
    }

    // 天气
    if (saved.weather && WEATHER_TYPES[saved.weather]) {
      this.weather = saved.weather;
      this.weatherChangeTimer = saved.weatherChangeTimer || 0;
    }

    // 地块
    if (Array.isArray(saved.plots)) {
      for (let y = 0; y < Math.min(saved.plots.length, this.height); y++) {
        const row = saved.plots[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < Math.min(row.length, this.width); x++) {
          const d = row[x];
          if (!d) continue;
          const plot = this.plots[y][x];
          plot.crop         = d.crop         || null;
          plot.plantedAt    = d.plantedAt    || null;
          plot.growthStage  = d.growthStage  || 0;
          plot.isWatered    = d.isWatered    || false;
          plot.owner        = d.owner        || null;
          plot.soilMoisture = typeof d.soilMoisture === 'number' ? d.soilMoisture : 50;
        }
      }
    }

    // 动物栏
    if (Array.isArray(saved.animalPens)) {
      for (let i = 0; i < Math.min(saved.animalPens.length, this.animalPens.length); i++) {
        const d = saved.animalPens[i];
        if (!d || !d.animal) continue;
        const pen = this.animalPens[i];
        pen.animal  = d.animal;
        pen.ownedAt = d.ownedAt || Date.now();
        pen.isReady = d.isReady || false;
        pen.owner   = d.owner   || null;
      }
    }

    // 害虫
    if (Array.isArray(saved.pests)) {
      this.pests = saved.pests.filter(
        p => p && p.type && typeof p.x === 'number' && typeof p.y === 'number'
      );
    }

    // 动物栏饥饿度
    if (Array.isArray(saved.animalPens)) {
      for (let i = 0; i < Math.min(saved.animalPens.length, this.animalPens.length); i++) {
        const d = saved.animalPens[i];
        if (d && typeof d.hunger === 'number') {
          this.animalPens[i].hunger = d.hunger;
        }
      }
    }

    //农夫数据（姓名 + 饥饿度）
    if (Array.isArray(saved.farmers) && saved.farmers.length > 0) {
      this._savedFarmerData = saved.farmers;
    }

    // 黄金数据
    if (typeof saved.goldAmount === 'number') {
      this.goldAmount = saved.goldAmount;
    }
    if (typeof saved.goldPrice === 'number') {
      this.goldPrice = saved.goldPrice;
    }
    if (Array.isArray(saved.goldPriceHistory)) {
      this.goldPriceHistory = saved.goldPriceHistory;
    }

    // 农夫AI思考记录
    if (Array.isArray(saved.farmerThoughts)) {
      this.farmerThoughts = saved.farmerThoughts;
    }

    // 工资和税收系统
    if (typeof saved.lastSalaryTime === 'number') {
      this.lastSalaryTime = saved.lastSalaryTime;
    }
    if (typeof saved.unpaidSalary === 'number') {
      this.unpaidSalary = saved.unpaidSalary;
    }
    if (typeof saved.totalSalaryPaid === 'number') {
      this.totalSalaryPaid = saved.totalSalaryPaid;
    }
    if (typeof saved.lastTaxTime === 'number') {
      this.lastTaxTime = saved.lastTaxTime;
    }
    if (typeof saved.totalTaxPaid === 'number') {
      this.totalTaxPaid = saved.totalTaxPaid;
    }
    if (typeof saved.gameCreatedAt === 'number') {
      this.gameCreatedAt = saved.gameCreatedAt;
    }

    // 市场供需系统
    if (saved.marketState) {
      // 加载作物市场状态
      if (saved.marketState.crops) {
        for (const cropType of Object.keys(saved.marketState.crops)) {
          if (this.marketState.crops[cropType]) {
            this.marketState.crops[cropType] = saved.marketState.crops[cropType];
          }
        }
      }
      // 加载活跃事件
      if (Array.isArray(saved.marketState.activeEvents)) {
        // 过滤已过期的事件
        const now = Date.now();
        this.marketState.activeEvents = saved.marketState.activeEvents.filter(
          e => e && e.startTime && e.duration && (now - e.startTime < e.duration * 1000)
        );
      }
    }
    if (saved.lastPriceRecovery) {
      this.lastPriceRecovery = saved.lastPriceRecovery;
    }

    console.log(`[FarmGame] State restored for room "${this.roomId}" — 金库: ${this.sharedMoney}, 黄金: ${this.goldAmount}g, 农夫: ${(this._savedFarmerData || [{ name: '阿明' }]).length} 人`);
  }

  // 将当前游戏状态序列化并存入 dataStore（定期 + 关闭时调用）
  _saveState() {
    const state = {
      savedAt:            Date.now(),
      sharedMoney:        this.sharedMoney,
      weather:            this.weather,
      weatherChangeTimer: this.weatherChangeTimer,
      plots: this.plots.map(row => row.map(plot => ({
        crop:         plot.crop,
        plantedAt:    plot.plantedAt,
        growthStage:  plot.growthStage,
        isWatered:    plot.isWatered,
        owner:        plot.owner,
        soilMoisture: plot.soilMoisture
      }))),
      animalPens: this.animalPens.map(pen => ({
        animal:  pen.animal,
        ownedAt: pen.ownedAt,
        isReady: pen.isReady,
        owner:   pen.owner,
        hunger:  pen.hunger || 0
      })),
      pests:   this.pests,
      farmers: this.farmers.map(f => ({ name: f.name, hunger: f.hunger })),
      goldAmount: this.goldAmount,
      goldPrice: this.goldPrice,
      goldPriceHistory: this.goldPriceHistory,
      farmerThoughts: this.farmerThoughts,
      // 工资和税收系统
      lastSalaryTime: this.lastSalaryTime,
      unpaidSalary: this.unpaidSalary,
      totalSalaryPaid: this.totalSalaryPaid,
      lastTaxTime: this.lastTaxTime,
      totalTaxPaid: this.totalTaxPaid,
      gameCreatedAt: this.gameCreatedAt,
      // 市场供需系统
      marketState: this.marketState,
      lastPriceRecovery: this.lastPriceRecovery
    };
    dataStore.saveRoomState(this.roomId, state);
  }

  // ========== 农夫初始化 ==========

  static _FARMER_NAMES = ['阿明', '阿红', '小王', '老李', '小刘', '阿芳', '小张', '老陈'];

  _initFarmers() {
    const savedData = (this._savedFarmerData && this._savedFarmerData.length > 0)
      ? this._savedFarmerData
      : [{ name: '阿明', hunger: 0 }];

    for (const fd of savedData) {
      const farmer = new Farmer(this, (msg, emoji, type) => this.addFarmLog(msg, emoji, type), {
        name:       fd.name,
        hunger:     fd.hunger || 0,
        startDelay: 5000
      });
      this.farmers.push(farmer);
    }
    this._savedFarmerData = null;
  }

  // ========== 农夫管理 ==========

  getNextHireCost() {
    // 第1次雇佣1500，第2次3000，第3次6000，第4次12000，上限20000
    return Math.min(1500 * Math.pow(2, this.farmers.length - 1), 20000);
  }

  hireNewFarmer() {
    const cost = this.getNextHireCost();
    if (this.sharedMoney < cost)   return { success: false, message: `金币不足（需要 ${cost}💰）` };
    if (this.farmers.length >= 6)  return { success: false, message: '农场最多只能容纳 6 名农夫' };

    const used = new Set(this.farmers.map(f => f.name));
    const name = FarmGame._FARMER_NAMES.find(n => !used.has(n)) || `农夫${this.farmers.length + 1}`;

    this.sharedMoney -= cost;
    const farmer = new Farmer(this, (msg, emoji, type) => this.addFarmLog(msg, emoji, type), {
      name,
      startDelay: 2000
    });
    this.farmers.push(farmer);
    this.addFarmLog(`🎉 雇佣了新农夫 ${name}！花费 ${cost} 💰，当前 ${this.farmers.length} 名农夫`, '👥', 'system');
    return { success: true, name, cost };
  }

  fireFarmer(farmerName) {
    if (this.farmers.length <= 1) return { success: false, message: '至少保留一名农夫' };

    // 指定姓名则找对应农夫；否则解雇最近雇的（最后一个）
    const toFire = farmerName
      ? this.farmers.find(f => f.name === farmerName && f !== this.farmers[0])
      : this.farmers[this.farmers.length - 1];

    if (!toFire) return { success: false, message: '找不到可解雇的农夫（无法解雇阿明）' };

    toFire.destroy();
    this.farmers = this.farmers.filter(f => f !== toFire);
    this.addFarmLog(`👋 农夫 ${toFire.name} 离职了，当前 ${this.farmers.length} 名农夫`, '👋', 'system');
    return { success: true, name: toFire.name };
  }

  feedFarmer(socketId, farmerName, foodId) {
    const food = SHOP_ITEMS[foodId];
    if (!food || food.type !== 'farmer-food') return { success: false, message: '无效的食物' };

    const farmer = this.farmers.find(f => f.name === farmerName);
    if (!farmer)                          return { success: false, message: `找不到农夫 ${farmerName}` };
    if (farmer.isDead)                    return { success: false, message: `${farmerName} 已经去世了` };
    if (this.sharedMoney < food.price)    return { success: false, message: `公库金币不足（需 ${food.price}💰）` };

    this.sharedMoney -= food.price;
    farmer.hunger = Math.max(0, farmer.hunger - food.satiety);

    const satPct = Math.round(100 - farmer.hunger);
    this.addFarmLog(`给 ${farmerName} 喂了 ${food.emoji}${food.name}，饱腹度恢复至 ${satPct}%`, food.emoji, 'farmer');
    return { success: true, message: `喂给农夫${farmerName} ${food.emoji}${food.name}！` };
  }

  // 与农夫聊天
  async chatWithFarmer(socketId, farmerName, message) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };

    const farmer = this.farmers.find(f => f.name === farmerName);
    if (!farmer) return { success: false, message: `找不到农夫 ${farmerName}` };
    if (farmer.isDead) return { success: false, message: `${farmerName} 已经去世了` };

    try {
      const reply = await farmer.chat(player.name, message);
      return {
        success: true,
        reply,
        farmerName: farmer.fullName,
        personality: farmer.personality.description
      };
    } catch (error) {
      console.error('[Chat] 聊天失败:', error.message);
      return { success: false, message: '农夫似乎没听到你在说什么...' };
    }
  }

  // 添加农场日志（最多保留 40 条）
  addFarmLog(message, emoji = '📝', type = 'info') {
    const now = new Date();
    const h = String((now.getUTCHours() + 8) % 24).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    this.farmLog.unshift({ time: `${h}:${m}`, message, emoji, type });
    if (this.farmLog.length > 40) this.farmLog.length = 40;
  }

  // 获取作物配置（供农夫等模块使用）
  getCropConfig(cropType) {
    return CROPS[cropType] || { name: cropType, emoji: '🌱' };
  }

  // ========== 多样性系统 ==========

  // 计算作物多样性系数（0.5-1.0）
  // 种植单一作物会降低收益
  calculateCropDiversity() {
    const cropCounts = {};

    // 统计所有作物
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const plot = this.plots[y][x];
        if (plot.crop) {
          cropCounts[plot.crop] = (cropCounts[plot.crop] || 0) + 1;
        }
      }
    }

    const totalPlots = Object.values(cropCounts).reduce((a, b) => a + b, 0);
    if (totalPlots === 0) return 1.0;

    const uniqueCrops = Object.keys(cropCounts).length;
    const maxSingleCrop = Math.max(...Object.values(cropCounts));

    // 多样性计算：
    // - 唯一作物种类越多，系数越高
    // - 单一作物占比越高，系数越低
    const diversityBonus = Math.min(0.3, uniqueCrops * 0.05); // 每种作物+5%，最高+30%
    const concentrationPenalty = (maxSingleCrop / totalPlots - 0.3) * 0.5; // 单一作物超过30%开始惩罚

    const coefficient = 1.0 + diversityBonus - Math.max(0, concentrationPenalty);
    return Math.max(0.5, Math.min(1.3, coefficient)); // 限制在0.5-1.3之间
  }

  // 计算动物多样性系数
  calculateAnimalDiversity() {
    const animalCounts = {};

    for (const pen of this.animalPens) {
      if (pen.animal) {
        animalCounts[pen.animal] = (animalCounts[pen.animal] || 0) + 1;
      }
    }

    const totalAnimals = Object.values(animalCounts).reduce((a, b) => a + b, 0);
    if (totalAnimals === 0) return 1.0;

    const uniqueAnimals = Object.keys(animalCounts).length;
    const maxSingleAnimal = Math.max(...Object.values(animalCounts));

    const diversityBonus = Math.min(0.25, uniqueAnimals * 0.08);
    const concentrationPenalty = (maxSingleAnimal / totalAnimals - 0.4) * 0.4;

    const coefficient = 1.0 + diversityBonus - Math.max(0, concentrationPenalty);
    return Math.max(0.6, Math.min(1.25, coefficient));
  }

  // 获取多样性信息（用于UI显示）
  getDiversityInfo() {
    const cropDiversity = this.calculateCropDiversity();
    const animalDiversity = this.calculateAnimalDiversity();

    // 统计作物
    const cropCounts = {};
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const plot = this.plots[y][x];
        if (plot.crop) {
          cropCounts[plot.crop] = (cropCounts[plot.crop] || 0) + 1;
        }
      }
    }

    // 统计动物
    const animalCounts = {};
    for (const pen of this.animalPens) {
      if (pen.animal) {
        animalCounts[pen.animal] = (animalCounts[pen.animal] || 0) + 1;
      }
    }

    return {
      cropDiversity: Math.round(cropDiversity * 100),
      animalDiversity: Math.round(animalDiversity * 100),
      cropCounts,
      animalCounts,
      cropCount: Object.keys(cropCounts).length,
      animalCount: Object.keys(animalCounts).length
    };
  }


  // ========== 农夫工资系统 ==========

  // 计算总资产（用于税收计算）
  calculateTotalAssets() {
    let totalAssets = 0;

    // 1. 公库金币
    totalAssets += this.sharedMoney;

    // 2. 黄金价值
    totalAssets += this.goldAmount * this.goldPrice;

    // 3. 作物估值（按种子价格计算，已种植的作物价值）
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const plot = this.plots[y][x];
        if (plot.crop) {
          const crop = CROPS[plot.crop];
          if (crop) {
            // 成熟度越高价值越高
            const growthValue = crop.seedPrice * (plot.growthStage + 1);
            totalAssets += growthValue;
          }
        }
      }
    }

    // 4. 动物估值（按购买价格的50%计算）
    for (const pen of this.animalPens) {
      if (pen.animal) {
        const animal = ANIMALS[pen.animal];
        if (animal) {
          totalAssets += Math.floor(animal.buyPrice * 0.5);
        }
      }
    }

    return totalAssets;
  }

  // 计算应缴税额（阶梯税率）
  calculateTaxAmount(totalAssets) {
    if (totalAssets <= 5000) return 0;

    let tax = 0;

    // 5,001-15,000: 2%
    if (totalAssets > 5000) {
      const bracket = Math.min(totalAssets - 5000, 10000);
      tax += bracket * 0.02;
    }

    // 15,001-50,000: 5%
    if (totalAssets > 15000) {
      const bracket = Math.min(totalAssets - 15000, 35000);
      tax += bracket * 0.05;
    }

    // 50,001-150,000: 10%
    if (totalAssets > 50000) {
      const bracket = Math.min(totalAssets - 50000, 100000);
      tax += bracket * 0.10;
    }

    // 150,001+: 15%
    if (totalAssets > 150000) {
      const bracket = totalAssets - 150000;
      tax += bracket * 0.15;
    }

    return Math.floor(tax);
  }

  // 结算农夫工资
  settleFarmerSalaries() {
    const now = Date.now();
    const farmerCount = this.farmers.filter(f => !f.isDead).length;

    if (farmerCount === 0) return { settled: false, reason: '没有农夫' };

    // 计算距离上次结算过了多少整小时
    const hoursPassed = Math.floor((now - this.lastSalaryTime) / (1000 * 60 * 60));

    if (hoursPassed < 1) {
      return { settled: false, reason: '未到结算时间' };
    }

    // 工资标准：50金币/人/小时
    const salaryPerFarmerPerHour = 50;
    const totalSalary = farmerCount * salaryPerFarmerPerHour * hoursPassed;

    // 尝试从公库扣除工资
    if (this.sharedMoney >= totalSalary) {
      this.sharedMoney -= totalSalary;
      this.totalSalaryPaid += totalSalary;
      this.lastSalaryTime = now;

      // 如果有欠薪，优先偿还
      if (this.unpaidSalary > 0) {
        const repayAmount = Math.min(this.sharedMoney, this.unpaidSalary);
        this.sharedMoney -= repayAmount;
        this.unpaidSalary -= repayAmount;
        if (repayAmount > 0) {
          this.addFarmLog('偿还欠薪 ' + repayAmount + ' 💰，剩余欠薪: ' + this.unpaidSalary, '💰', 'salary');
        }
      }

      this.addFarmLog('结算农夫工资: ' + farmerCount + '人 x ' + hoursPassed + '小时 = ' + totalSalary + ' 💰', '💵', 'salary');

      return {
        settled: true,
        farmerCount,
        hoursPassed,
        totalSalary,
        unpaidSalary: this.unpaidSalary
      };
    } else {
      // 公库不足，记录欠薪
      const canPay = this.sharedMoney;
      const actualUnpaid = totalSalary - canPay;

      this.sharedMoney = 0;
      this.unpaidSalary += actualUnpaid;
      this.totalSalaryPaid += canPay;
      this.lastSalaryTime = now;

      this.addFarmLog('工资结算: 公库不足，欠薪 ' + actualUnpaid + ' 💰（累计欠薪: ' + this.unpaidSalary + '）', '⚠️', 'salary');

      return {
        settled: true,
        farmerCount,
        hoursPassed,
        totalSalary,
        paid: canPay,
        unpaid: actualUnpaid,
        totalUnpaid: this.unpaidSalary
      };
    }
  }

  // 执行征税
  collectTax() {
    const now = Date.now();

    // 检查是否在新玩家保护期内（前24小时）
    const protectionPeriodMs = 24 * 60 * 60 * 1000; // 24小时
    const gameAge = now - this.gameCreatedAt;

    if (gameAge < protectionPeriodMs) {
      const remainingHours = Math.ceil((protectionPeriodMs - gameAge) / (1000 * 60 * 60));
      return {
        collected: false,
        reason: '新玩家保护期，剩余 ' + remainingHours + ' 小时',
        protectionRemaining: remainingHours
      };
    }

    // 检查是否到征税时间（每日固定时间，比如每24小时征一次）
    const taxIntervalMs = 24 * 60 * 60 * 1000; // 24小时
    const timeSinceLastTax = now - this.lastTaxTime;

    if (timeSinceLastTax < taxIntervalMs) {
      const nextTaxIn = Math.ceil((taxIntervalMs - timeSinceLastTax) / (1000 * 60));
      return {
        collected: false,
        reason: '未到征税时间',
        nextTaxInMinutes: nextTaxIn
      };
    }

    // 计算总资产
    const totalAssets = this.calculateTotalAssets();

    // 计算应缴税额
    const taxAmount = this.calculateTaxAmount(totalAssets);

    if (taxAmount <= 0) {
      this.lastTaxTime = now;
      return {
        collected: true,
        totalAssets,
        taxAmount: 0,
        reason: '资产未达征税标准'
      };
    }

    // 从公库扣除税款
    if (this.sharedMoney >= taxAmount) {
      this.sharedMoney -= taxAmount;
      this.totalTaxPaid += taxAmount;
      this.lastTaxTime = now;

      this.addFarmLog('税收征收: 资产 ' + totalAssets + ' 💰，税率阶梯，缴税 ' + taxAmount + ' 💰', '🏦', 'tax');

      return {
        collected: true,
        totalAssets,
        taxAmount,
        totalTaxPaid: this.totalTaxPaid
      };
    } else {
      // 公库不足，扣除所有金币并记录欠税
      const actualTax = this.sharedMoney;
      const unpaidTax = taxAmount - actualTax;

      this.sharedMoney = 0;
      this.totalTaxPaid += actualTax;
      this.lastTaxTime = now;

      this.addFarmLog('税收征收: 公库不足，仅缴纳 ' + actualTax + ' 💰（应缴 ' + taxAmount + '）', '⚠️', 'tax');

      return {
        collected: true,
        totalAssets,
        taxAmount: actualTax,
        requiredTax: taxAmount,
        unpaidTax,
        totalTaxPaid: this.totalTaxPaid
      };
    }
  }

  // 获取预估税额（用于UI显示）
  getEstimatedTax() {
    const totalAssets = this.calculateTotalAssets();
    const taxAmount = this.calculateTaxAmount(totalAssets);
    const now = Date.now();
    const timeSinceLastTax = now - this.lastTaxTime;
    const taxIntervalMs = 24 * 60 * 60 * 1000;
    const nextTaxIn = Math.max(0, taxIntervalMs - timeSinceLastTax);

    // 检查保护期
    const protectionPeriodMs = 24 * 60 * 60 * 1000;
    const gameAge = now - this.gameCreatedAt;
    const isProtected = gameAge < protectionPeriodMs;

    return {
      totalAssets,
      estimatedTax: taxAmount,
      nextTaxIn,
      isProtected,
      protectionRemaining: isProtected ? Math.ceil((protectionPeriodMs - gameAge) / (1000 * 60 * 60)) : 0
    };
  }

  // 获取工资信息（用于UI显示）
  getSalaryInfo() {
    const now = Date.now();
    const timeSinceLastSalary = now - this.lastSalaryTime;
    const farmerCount = this.farmers.filter(f => !f.isDead).length;
    const salaryPerFarmerPerHour = 50;

    return {
      farmerCount,
      salaryPerFarmerPerHour,
      lastSalaryTime: this.lastSalaryTime,
      unpaidSalary: this.unpaidSalary,
      totalSalaryPaid: this.totalSalaryPaid,
      nextSalaryIn: Math.max(0, 60 * 60 * 1000 - timeSinceLastSalary), // 下次结算剩余时间
      estimatedHourlyCost: farmerCount * salaryPerFarmerPerHour
    };
  }

  // 启动工资结算循环（每分钟检查一次）
  startSalaryLoop() {
    this._intervals.push(setInterval(() => {
      this.settleFarmerSalaries();
    }, 60000)); // 每分钟检查一次
  }

  // 启动税收征收循环（每分钟检查一次）
  startTaxLoop() {
    this._intervals.push(setInterval(() => {
      this.collectTax();
    }, 60000)); // 每分钟检查一次
  }


  // ========== 天气系统方法 ==========
  
  // 启动天气循环
  startWeatherLoop() {
    this._intervals.push(setInterval(() => {
      this.updateWeather();
    }, 5000));
  }
  
  // 更新天气
  updateWeather() {
    const weatherData = WEATHER_TYPES[this.weather];
    this.weatherChangeTimer++;
    
    // 每隔一段时间随机改变天气
    if (this.weatherChangeTimer >= this.weatherDuration / 5) {
      this.changeWeather();
      this.weatherChangeTimer = 0;
    }
    
    // 更新所有地块的湿度
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const plot = this.plots[y][x];
        plot.soilMoisture = Math.max(0, Math.min(100, plot.soilMoisture + weatherData.moistureChange));
        
        // 暴风雨或雪天可能损坏作物
        if (weatherData.damageChance && plot.crop && Math.random() < weatherData.damageChance * 0.01) {
          // 作物被损坏
          plot.crop = null;
          plot.plantedAt = null;
          plot.growthStage = 0;
          plot.owner = null;
          plot.isWatered = false;
        }
      }
    }
  }
  
  // 改变天气
  changeWeather() {
    const weatherKeys = Object.keys(WEATHER_TYPES);
    const newWeather = weatherKeys[Math.floor(Math.random() * weatherKeys.length)];
    this.weather = newWeather;
    const w = WEATHER_TYPES[newWeather];
    console.log(`[Weather] Weather changed to: ${w.emoji} ${w.name}`);
    this.addFarmLog(`天气变为 ${w.emoji} ${w.name}：${w.description}`, w.emoji, 'weather');
  }
  
  // 获取天气信息
  getWeatherInfo() {
    const w = WEATHER_TYPES[this.weather];
    return {
      type: this.weather,
      name: w.name,
      emoji: w.emoji,
      description: w.description,
      color: w.color
    };
  }
  
  // ========== 害虫系统方法 ==========
  
  // 启动害虫循环
  startPestLoop() {
    this._intervals.push(setInterval(() => {
      this.updatePests();
    }, 10000)); // 每10秒更新一次害虫
  }
  
  // 更新害虫
  updatePests() {
    const weatherData = WEATHER_TYPES[this.weather];
  }

// ========== 市场供需系统方法 ==========

  // 计算作物最终价格（基准售价 x 价格倍率 x 事件倍率）
  calculateCropPrice(cropType) {
    const crop = CROPS[cropType];
    if (!crop) return { finalPrice: 0, priceModifier: 1, eventMultiplier: 1 };

    const marketCrop = this.marketState.crops[cropType] || { ...DEFAULT_CROP_MARKET_STATE };
    const priceModifier = marketCrop.priceModifier;

    // 计算事件倍率（取所有对该作物生效的事件的乘积）
    let eventMultiplier = 1;
    const now = Date.now();
    for (const event of this.marketState.activeEvents) {
      if (event.startTime && event.duration) {
        const elapsed = now - event.startTime;
        if (elapsed < event.duration * 1000) {
          const eventType = MARKET_EVENT_TYPES[event.eventType];
          if (eventType && (eventType.category === 'all' || eventType.category === crop.category)) {
            eventMultiplier *= eventType.priceMultiplier;
          }
        }
      }
    }

    // 最终价格 = 基准售价 x 价格修正系数 x 事件倍率
    const finalPrice = Math.floor(crop.sellPrice * priceModifier * eventMultiplier);

    return { finalPrice, priceModifier, eventMultiplier };
  }

  // 更新市场状态（出售时调用）
  updateMarketOnSale(cropType, quantity) {
    const marketCrop = this.marketState.crops[cropType];
    if (!marketCrop) return;

    const now = Date.now();

    // 更新累计销售量
    marketCrop.totalSold += quantity;

    // 记录最近销售
    marketCrop.recentSales.push({ timestamp: now, quantity });
    // 只保留最近1小时的销售记录
    marketCrop.recentSales = marketCrop.recentSales.filter(s => now - s.timestamp < 3600000);

    // 计算价格影响：每销售50个单位影响5%（价格下降）
    // 累计销售量每增加50，价格修正系数下降5%
    const priceImpact = Math.floor(marketCrop.totalSold / 50) * 0.05;
    const targetModifier = Math.max(0.5, 1 - priceImpact); // 最低50%

    // 渐进式调整（每次最多变化2%）
    if (marketCrop.priceModifier > targetModifier) {
      marketCrop.priceModifier = Math.max(targetModifier, marketCrop.priceModifier - 0.02);
    }

    // 添加农场日志
    if (marketCrop.priceModifier < 0.8) {
      const crop = CROPS[cropType];
      this.addFarmLog(`${crop.emoji}${crop.name} 市场供应充足，价格下跌`, '📉', 'market');
    }
  }

  // 启动市场循环（价格恢复和事件触发）
  startMarketLoop() {
    // 每10秒检查一次
    this._intervals.push(setInterval(() => {
      this.recoverPrices();
      this.checkExpiredEvents();

      // 随机事件触发（每次有5%概率触发）
      if (Math.random() < 0.05) {
        this.triggerRandomEvent();
      }
    }, 10000));
  }

  // 价格恢复（每小时恢复10%偏差）
  recoverPrices() {
    const now = Date.now();
    const hoursPassed = (now - this.lastPriceRecovery) / 3600000;

    if (hoursPassed < 1) return; // 不到一小时不恢复

    const recoveryRate = 0.1 * hoursPassed; // 每小时恢复10%

    for (const cropType of Object.keys(this.marketState.crops)) {
      const marketCrop = this.marketState.crops[cropType];
      if (marketCrop.priceModifier < 1) {
        // 价格偏低，向1恢复
        marketCrop.priceModifier = Math.min(1, marketCrop.priceModifier + recoveryRate);
      } else if (marketCrop.priceModifier > 1) {
        // 价格偏高，向1恢复
        marketCrop.priceModifier = Math.max(1, marketCrop.priceModifier - recoveryRate);
      }
    }

    this.lastPriceRecovery = now;
  }

  // 检查并移除过期事件
  checkExpiredEvents() {
    const now = Date.now();
    this.marketState.activeEvents = this.marketState.activeEvents.filter(event => {
      if (!event.startTime || !event.duration) return false;
      const elapsed = now - event.startTime;
      return elapsed < event.duration * 1000;
    });
  }

  // 触发随机市场事件
  triggerRandomEvent() {
    // 如果已有2个以上活跃事件，不再触发
    if (this.marketState.activeEvents.length >= 2) return;

    const eventTypes = Object.keys(MARKET_EVENT_TYPES);
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const eventConfig = MARKET_EVENT_TYPES[eventType];

    const event = {
      eventType,
      startTime: Date.now(),
      duration: eventConfig.duration
    };

    this.marketState.activeEvents.push(event);

    // 添加农场日志
    this.addFarmLog(
      `${eventConfig.emoji} ${eventConfig.name}：${eventConfig.description}`,
      eventConfig.emoji,
      'market'
    );

    // 广播事件通知
    this.broadcastMarketEvent(event, eventConfig);

    return event;
  }

  // 广播市场事件（给客户端）
  broadcastMarketEvent(event, eventConfig) {
    // 通过io广播（需要在socket处理中设置）
    if (this._io) {
      this._io.to(this.roomId).emit('market-event', {
        eventType: event.eventType,
        name: eventConfig.name,
        emoji: eventConfig.emoji,
        description: eventConfig.description,
        priceMultiplier: eventConfig.priceMultiplier,
        duration: eventConfig.duration,
        startTime: event.startTime
      });
    }
  }

  // 手动触发事件（管理员用）
  triggerEvent(eventType) {
    const eventConfig = MARKET_EVENT_TYPES[eventType];
    if (!eventConfig) return { success: false, message: '未知事件类型' };

    const event = {
      eventType,
      startTime: Date.now(),
      duration: eventConfig.duration
    };

    this.marketState.activeEvents.push(event);

    this.addFarmLog(
      `${eventConfig.emoji} ${eventConfig.name}：${eventConfig.description}`,
      eventConfig.emoji,
      'market'
    );

    this.broadcastMarketEvent(event, eventConfig);

    return { success: true, message: `已触发事件: ${eventConfig.name}` };
  }

  // 获取市场信息
  getMarketInfo() {
    const cropsInfo = {};
    for (const cropType of Object.keys(CROPS)) {
      const crop = CROPS[cropType];
      const marketCrop = this.marketState.crops[cropType] || { ...DEFAULT_CROP_MARKET_STATE };
      const { finalPrice, priceModifier, eventMultiplier } = this.calculateCropPrice(cropType);

      cropsInfo[cropType] = {
        name: crop.name,
        emoji: crop.emoji,
        basePrice: crop.sellPrice,
        currentPrice: finalPrice,
        priceModifier,
        eventMultiplier,
        totalSold: marketCrop.totalSold,
        trend: this.calculatePriceTrend(cropType)
      };
    }

    return {
      crops: cropsInfo,
      activeEvents: this.marketState.activeEvents.map(event => {
        const eventConfig = MARKET_EVENT_TYPES[event.eventType];
        const remaining = eventConfig
          ? Math.max(0, event.duration - Math.floor((Date.now() - event.startTime) / 1000))
          : 0;
        return {
          ...event,
          name: eventConfig?.name,
          emoji: eventConfig?.emoji,
          description: eventConfig?.description,
          priceMultiplier: eventConfig?.priceMultiplier,
          remaining
        };
      }),
      lastRecovery: this.lastPriceRecovery
    };
  }

  // 计算价格趋势
  calculatePriceTrend(cropType) {
    const marketCrop = this.marketState.crops[cropType];
    if (!marketCrop || marketCrop.recentSales.length < 2) {
      return 'stable'; // 稳定
    }

    const recentSales = marketCrop.recentSales.slice(-10);
    const avgQuantity = recentSales.reduce((sum, s) => sum + s.quantity, 0) / recentSales.length;

    // 如果最近销售量大，价格可能下降
    if (avgQuantity > 20) {
      return 'falling'; // 下跌
    } else if (avgQuantity < 5 && marketCrop.priceModifier < 1) {
      return 'rising'; // 上涨
    }

    return 'stable'; // 稳定
  }

  // 更新害虫
  updatePests() {
    const weatherData = WEATHER_TYPES[this.weather];  // 添加天气数据

    // 减少害虫持续时间，移除到期的害虫
    this.pests = this.pests.filter(pest => {
      pest.turnsRemaining--;
      return pest.turnsRemaining > 0;
    });

    // 对作物造成伤害
    this.pests.forEach(pest => {
      const pestData = PEST_TYPES[pest.type];
      const plot = this.plots[pest.y]?.[pest.x];

      if (plot && plot.crop && plot.growthStage < 3) {
        // 降低生长阶段
        plot.growthStage = Math.max(0, plot.growthStage - pestData.damage);
      }

      // 老鼠可能偷吃成熟作物
      if (pest.type === 'rat' && plot && plot.crop && plot.growthStage >= 3) {
        if (Math.random() < pestData.stealChance) {
          plot.crop = null;
          plot.plantedAt = null;
          plot.growthStage = 0;
        }
      }

      // 害虫蔓延
      if (Math.random() < pestData.spreadRate * 0.5) {
        this.spreadPest(pest);
      }
    });
    
    // 根据天气生成新害虫
    if (Math.random() < weatherData.pestChance) {
      this.spawnPest();
    }
  }
  
  // 生成害虫
  spawnPest() {
    const x = Math.floor(Math.random() * this.width);
    const y = Math.floor(Math.random() * this.height);
    const pestTypes = Object.keys(PEST_TYPES);
    const type = pestTypes[Math.floor(Math.random() * pestTypes.length)];
    
    // 检查是否已有害虫
    const existing = this.pests.find(p => p.x === x && p.y === y);
    if (!existing) {
      // 检查该位置是否有玩家具有保护
      let hasProtection = false;
      this.players.forEach(player => {
        if (player.position.x === x && player.position.y === y) {
          if (this.hasPestProtection(player.id)) {
            hasProtection = true;
          }
        }
      });
      
      if (!hasProtection) {
        this.pests.push({
          type,
          x,
          y,
          turnsRemaining: 30 // 持续30个周期（约5分钟）
        });
        const pd = PEST_TYPES[type];
        this.addFarmLog(`${pd.emoji}${pd.name} 出现在 (${x},${y})！${pd.description}`, pd.emoji, 'pest');
      }
    }
  }
  
  // 害虫蔓延
  spreadPest(pest) {
    const directions = [[0,1], [0,-1], [1,0], [-1,0]];
    const dir = directions[Math.floor(Math.random() * directions.length)];
    const newX = pest.x + dir[0];
    const newY = pest.y + dir[1];
    
    if (newX >= 0 && newX < this.width && newY >= 0 && newY < this.height) {
      const existing = this.pests.find(p => p.x === newX && p.y === newY);
      if (!existing) {
        this.pests.push({
          type: pest.type,
          x: newX,
          y: newY,
          turnsRemaining: pest.turnsRemaining - 1
        });
      }
    }
  }
  
  // 驱除害虫
  killPest(x, y) {
    const pestIndex = this.pests.findIndex(p => p.x === x && p.y === y);
    if (pestIndex !== -1) {
      const pest = this.pests[pestIndex];
      const pestData = PEST_TYPES[pest.type];
      this.pests.splice(pestIndex, 1);
      return { success: true, message: `驱除了${pestData.emoji}${pestData.name}`, cost: pestData.killPrice };
    }
    return { success: false, message: '这里没有害虫' };
  }
  
  // 使用杀虫剂（范围驱除）
  usePesticide(x, y) {
    let killed = 0;
    const range = 2; // 2格范围
    
    this.pests = this.pests.filter(pest => {
      const dist = Math.abs(pest.x - x) + Math.abs(pest.y - y);
      if (dist <= range) {
        killed++;
        return false;
      }
      return true;
    });
    
    if (killed > 0) {
      return { success: true, message: `杀虫剂驱除了${killed}只害虫！` };
    }
    return { success: false, message: '附近没有害虫' };
  }
  
  // 获取害虫信息
  getPestsInfo() {
    return this.pests.map(p => ({
      ...p,
      ...PEST_TYPES[p.type]
    }));
  }
  
  // 检查某地块是否有害虫
  hasPest(x, y) {
    return this.pests.some(p => p.x === x && p.y === y);
  }

  // ========== 黄金交易系统 ==========

  // 启动金价更新循环
  startGoldPriceLoop() {
    // 立即更新一次
    this.fetchGoldPrice();
    // 每小时更新一次
    this._intervals.push(setInterval(() => {
      this.fetchGoldPrice();
    }, 3600000)); // 1小时 = 3600000ms
  }

  // 获取金价（从免费API获取真实金价）
  async fetchGoldPrice() {
    const { exec } = require('child_process');

    try {
      const price = await new Promise((resolve, reject) => {
        // 使用 fawazahmed0/currency-api 免费API
        const url = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json';

        exec(`curl -s --max-time 10 "${url}"`, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          try {
            const json = JSON.parse(stdout);
            if (json.xau && json.xau.cny) {
              // 1盎司黄金 = X 人民币，1盎司 ≈ 31.1035克
              const pricePerOunce = json.xau.cny;
              const pricePerGram = pricePerOunce / 31.1035;
              // 金价一比一：直接使用人民币价格
              const gamePrice = Math.round(pricePerGram);
              resolve(Math.max(500, Math.min(1500, gamePrice)));
            } else {
              reject(new Error('Invalid response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      this.updateGoldPrice(price);
      console.log(`[GoldPrice] 实时金价: ${price}💰/g (${price}元/克)`);

    } catch (error) {
      console.error('[GoldPrice] 获取失败，使用模拟:', error.message);
      // 失败时使用模拟波动
      const basePrice = this.goldPrice || 1000;
      const change = (Math.random() - 0.5) * 20;
      this.updateGoldPrice(Math.round(basePrice + change));
    }
  }

  // 更新金价
  updateGoldPrice(newPrice) {
    const oldPrice = this.goldPrice;
    this.goldPrice = Math.max(100, Math.min(2000, newPrice)); // 限制在100-2000之间
    this.lastGoldPriceUpdate = Date.now();

    // 记录历史（保留最近24条）
    this.goldPriceHistory.push({
      time: Date.now(),
      price: this.goldPrice
    });
    if (this.goldPriceHistory.length > 24) {
      this.goldPriceHistory.shift();
    }

    // 记录日志
    const changePercent = ((this.goldPrice - oldPrice) / oldPrice * 100).toFixed(2);
    const direction = this.goldPrice > oldPrice ? '📈' : '📉';
    this.addFarmLog(`💰 金价更新: ${this.goldPrice}💰/g (${direction}${changePercent}%)`, '💰', 'gold');

    // 保存状态
    this._saveState();
  }

  // 买入黄金
  buyGold(socketId, amount) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };

    if (amount <= 0) return { success: false, message: '购买数量必须大于0' };

    const cost = Math.ceil(amount * this.goldPrice);
    if (this.sharedMoney < cost) {
      return { success: false, message: `金币不足，需要 ${cost}💰 购买 ${amount}g 黄金` };
    }

    this.sharedMoney -= cost;
    this.goldAmount += amount;

    this.addFarmLog(`💰 买入 ${amount.toFixed(2)}g 黄金，花费 ${cost}💰`, '💰', 'gold');
    this._saveState();

    return {
      success: true,
      message: `成功买入 ${amount.toFixed(2)}g 黄金，花费 ${cost}💰`,
      goldAmount: this.goldAmount,
      sharedMoney: this.sharedMoney
    };
  }

  // 卖出黄金
  sellGold(socketId, amount) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };

    if (amount <= 0) return { success: false, message: '卖出数量必须大于0' };

    if (this.goldAmount < amount) {
      return { success: false, message: `黄金不足，当前持有 ${this.goldAmount.toFixed(2)}g` };
    }

    const revenue = Math.floor(amount * this.goldPrice);
    this.goldAmount -= amount;
    this.sharedMoney += revenue;

    this.addFarmLog(`💰 卖出 ${amount.toFixed(2)}g 黄金，获得 ${revenue}💰`, '💰', 'gold');
    this._saveState();

    return {
      success: true,
      message: `成功卖出 ${amount.toFixed(2)}g 黄金，获得 ${revenue}💰`,
      goldAmount: this.goldAmount,
      sharedMoney: this.sharedMoney
    };
  }

  // 获取黄金信息
  getGoldInfo() {
    return {
      goldAmount: this.goldAmount,
      goldPrice: this.goldPrice,
      goldValue: Math.floor(this.goldAmount * this.goldPrice),
      priceHistory: this.goldPriceHistory,
      lastUpdate: this.lastGoldPriceUpdate
    };
  }

  // 更新动物位置（随机移动）
  _updateAnimalPositions() {
    // 每3秒移动一次（用计数器控制）
    this._animalMoveCounter = (this._animalMoveCounter || 0) + 1;
    if (this._animalMoveCounter < 3) return;
    this._animalMoveCounter = 0;

    for (let i = 0; i < this.animalPens.length; i++) {
      const pen = this.animalPens[i];
      if (!pen.animal) {
        // 没有动物，清除位置
        delete this.animalPositions[i];
        continue;
      }

      // 初始化或移动位置
      if (!this.animalPositions[i]) {
        // 随机初始位置
        this.animalPositions[i] = {
          x: Math.floor(Math.random() * this.width),
          y: Math.floor(Math.random() * this.height)
        };
      } else if (Math.random() < 0.5) {
        // 50%概率移动
        const directions = [
          { dx: 0, dy: -1 }, // 上
          { dx: 0, dy: 1 },  // 下
          { dx: -1, dy: 0 }, // 左
          { dx: 1, dy: 0 },  // 右
          { dx: 0, dy: 0 }   // 不动
        ];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        const newX = Math.max(0, Math.min(this.width - 1, this.animalPositions[i].x + dir.dx));
        const newY = Math.max(0, Math.min(this.height - 1, this.animalPositions[i].y + dir.dy));
        this.animalPositions[i] = { x: newX, y: newY };
      }
    }
  }

  // 农夫AI：判断是否交易黄金
  farmerGoldDecision(farmer) {
    // 农夫的黄金交易策略
    const goldInfo = this.getGoldInfo();
    const history = goldInfo.priceHistory;

    if (history.length < 3) return null; // 数据不足

    // 计算平均价格
    const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;
    const currentPrice = goldInfo.goldPrice;
    const priceRatio = currentPrice / avgPrice;

    // 策略：
    // 1. 金价低于均价5%以上，且有闲钱，考虑买入
    // 2. 金价高于均价5%以上，且有黄金，考虑卖出
    // 3. 农夫性格影响（随机性）

    const personality = farmer.personality || 0.5; // 保守-激进 0-1

    if (priceRatio < 0.95 && this.sharedMoney > 500) {
      // 金价低，考虑买入
      const buyAmount = Math.min(
        (this.sharedMoney * 0.2 * personality) / currentPrice, // 用20%*性格比例的钱买
        10 // 最多买10克
      );
      if (buyAmount >= 0.1) {
        return { action: 'buy', amount: buyAmount, reason: '金价走低，逢低买入' };
      }
    } else if (priceRatio > 1.05 && goldInfo.goldAmount > 0.5) {
      // 金价高，考虑卖出
      const sellAmount = Math.min(
        goldInfo.goldAmount * personality, // 按性格比例卖出
        goldInfo.goldAmount * 0.5 // 最多卖出50%
      );
      if (sellAmount >= 0.1) {
        return { action: 'sell', amount: sellAmount, reason: '金价走高，逢高卖出' };
      }
    }

    return null;
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
    this._intervals.push(setInterval(() => {
      this.checkDailyReset();
    }, 60000)); // 每分钟检查一次
  }

  // ========== 农夫AI思考系统 ==========

  // 启动农夫AI思考循环（每30分钟）
  startFarmerAILoop() {
    // 30分钟 = 1800000ms
    this._intervals.push(setInterval(() => {
      this.triggerFarmerAIThinking();
    }, 1800000));

    // 启动后5分钟首次思考
    setTimeout(() => {
      this.triggerFarmerAIThinking();
    }, 300000);
  }

  // 触发所有农夫进行AI思考
  async triggerFarmerAIThinking() {
    console.log('[Farmer AI] 开始AI思考周期...');

    for (const farmer of this.farmers) {
      if (!farmer.isDead) {
        try {
          await farmer.thinkWithAI();
        } catch (err) {
          console.error(`[Farmer AI] ${farmer.fullName} 思考失败:`, err.message);
        }
      }
    }
  }

  // 添加农夫思考记录
  addFarmerThought(thought) {
    this.farmerThoughts.push(thought);
    // 只保留最近20条
    if (this.farmerThoughts.length > 20) {
      this.farmerThoughts.shift();
    }
    this._saveState();
  }

  // 获取农夫思考记录
  getFarmerThoughts() {
    return this.farmerThoughts.slice(-10);
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
    this.sharedMoney += task.reward;
    player.totalTaskRewards = (player.totalTaskRewards || 0) + task.reward;
    if (!player.dailyTasksClaimed) player.dailyTasksClaimed = [];
    player.dailyTasksClaimed.push(taskId);
    
    // 保存数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: this.sharedMoney, 
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
    const money = this.sharedMoney;
    if (!achievement.condition(stats, money)) {
      return { success: false, message: '成就条件未满足' };
    }
    
    // 发放奖励
    this.sharedMoney += achievement.reward;
    player.totalTaskRewards = (player.totalTaskRewards || 0) + achievement.reward;
    if (!player.achievements) player.achievements = [];
    player.achievements.push(achievementId);
    
    // 保存数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: this.sharedMoney, 
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
        player.dailyTaskProgress[earnTask.id] = this.sharedMoney;
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
        money: this.sharedMoney,
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

  // 动物在地图上随机移动（客户端也各自独立计算，此处仅供服务端同步）
  startAnimalMovementLoop() {
    this._intervals.push(setInterval(() => {
      // 暂时为空；动物位置同步留待后续实现
    }, 3000));
  }

  startGrowthLoop() {
    this._intervals.push(setInterval(() => {
      // 更新作物生长和肥力恢复
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          this.plots[y][x].updateGrowth();
          // 闲置地块恢复肥力
          this.plots[y][x].recoverFertility();
        }
      }
      // 更新动物状态
      for (const pen of this.animalPens) {
        pen.updateAnimal();
      }
      // 更新动物位置（随机移动）
      this._updateAnimalPositions();
    }, 1000)); // 每秒更新一次
  }

  // 玩家加入
  addPlayer(socketId, playerName) {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
    
    // 尝试从持久化存储加载玩家数据
    const savedPlayer = dataStore.getPlayer(socketId);
    
    // 加载或初始化等级数据
    const savedLevel = savedPlayer?.level || 1;
    const savedXp = savedPlayer?.totalXp || 0;
    const levelInfo = calculateLevelFromXp(savedXp);
    
    const player = {
      id: socketId,
      name: savedPlayer && savedPlayer.name || playerName,
      money: 0, // 使用共用金库 sharedMoney，此字段仅占位
      color: savedPlayer && savedPlayer.color || colors[this.players.size % colors.length],
      position: savedPlayer && savedPlayer.position || { x: 0, y: 0 },
      inventory: savedPlayer && savedPlayer.inventory || {}, // 背包物品 { cropType: count }
      items: savedPlayer && savedPlayer.items || {}, // 道具 { itemId: count }
      // 任务系统数据
      dailyTaskProgress: savedPlayer && savedPlayer.dailyTaskProgress || {},
      dailyTasksClaimed: savedPlayer && savedPlayer.dailyTasksClaimed || [],
      achievements: savedPlayer && savedPlayer.achievements || [],
      stats: savedPlayer && savedPlayer.stats || { plantCount: 0, waterCount: 0, harvestCount: 0, sellCount: 0, fastHarvest: 0 },
      totalTaskRewards: savedPlayer && savedPlayer.totalTaskRewards || 0,
      // 等级系统数据
      level: savedLevel,
      totalXp: savedXp,
      currentXp: levelInfo.currentXp,
      xpToNextLevel: levelInfo.xpNeeded,
      coinBonus: getCoinBonusMultiplier(savedLevel)
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
      // 保存完整玩家数据后再删除
      dataStore.savePlayer(socketId, {
        name: player.name,
        money: this.sharedMoney,
        color: player.color,
        position: player.position,
        inventory: player.inventory,
        items: player.items,
        dailyTaskProgress: player.dailyTaskProgress,
        dailyTasksClaimed: player.dailyTasksClaimed,
        achievements: player.achievements,
        stats: player.stats,
        totalTaskRewards: player.totalTaskRewards,
        level: player.level,
        totalXp: player.totalXp,
        coinBonus: player.coinBonus
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
    dataStore.savePlayer(socketId, { name: player.name, money: this.sharedMoney, color: player.color, position: player.position });
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

    // 防作弊检查（传入共用金库余额供验证）
    const validation = antiCheat.validateAction(
      { ...player, money: this.sharedMoney }, plot, 'plant', crop.seedPrice, x, y, this.width, this.height
    );
    if (!validation.valid) {
      antiCheat.logSuspiciousAction(socketId, player.name, 'plant', validation.message, { cropType, x, y });
      return { success: false, message: validation.message };
    }
    
    const result = plot.plant(cropType, player.name);
    
    if (result.success) {
      this.sharedMoney -= crop.seedPrice;
      
      // 更新玩家统计数据
      const stats = this.playerStats.get(socketId) || { harvests: 0, cropsPlanted: 0 };
      stats.cropsPlanted = (stats.cropsPlanted || 0) + 1;
      this.playerStats.set(socketId, stats);
      dataStore.savePlayerStats(socketId, stats);
      
      // 更新任务进度
      this.updateTaskProgress(socketId, 'plant', 1);
      
      // 保存玩家数据
      dataStore.savePlayer(socketId, { name: player.name, money: this.sharedMoney, color: player.color, position: player.position });
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
      // 防作弊：验证奖励（用 cropType 验证，此时 plot.crop 已被清空）
      const rewardCheck = antiCheat.validateHarvestReward(result.cropType, result.reward);
      if (!rewardCheck.valid) {
        antiCheat.logSuspiciousAction(socketId, player.name, 'Harvest', 'Reward mismatch', { expected: result.reward, x, y });
        return { success: false, message: '收获奖励异常' };
      }
      
      // 获取作物经验值
      const xpGained = CROP_XP[result.cropType] || 10;
      const oldLevel = player.level;
      
      // 添加经验值
      player.totalXp += xpGained;
      
      // 计算新等级
      const levelInfo = calculateLevelFromXp(player.totalXp);
      player.level = levelInfo.level;
      player.currentXp = levelInfo.currentXp;
      player.xpToNextLevel = levelInfo.xpNeeded;
      
      // 检查是否升级
      const leveledUp = player.level > oldLevel;
      
      // 计算金币加成（基于等级）
      player.coinBonus = getCoinBonusMultiplier(player.level);
      const coinBonusPercent = Math.round((player.coinBonus - 1) * 100);
      
      // 应用金币加成和多样性系数
      const diversityCoef = this.calculateCropDiversity();
      const finalReward = Math.floor(result.reward * player.coinBonus * diversityCoef);

      // 添加到背包
      this.addToInventory(socketId, result.cropType, 1);
      
      this.sharedMoney += finalReward;
      
      // 更新玩家统计数据
      const stats = this.playerStats.get(socketId) || { harvests: 0, cropsPlanted: 0 };
      stats.harvests = (stats.harvests || 0) + 1;
      this.playerStats.set(socketId, stats);
      dataStore.savePlayerStats(socketId, stats);
      
      // 更新任务进度
      this.updateTaskProgress(socketId, 'harvest', 1);
      
      // 保存玩家数据（包含等级）
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
        color: player.color, 
        position: player.position, 
        inventory: player.inventory, 
        items: player.items,
        level: player.level,
        totalXp: player.totalXp,
        coinBonus: player.coinBonus
      });
      
      // 记录操作日志
      dataStore.logAction(socketId, player.name, 'harvest', {
        x, y,
        reward: finalReward,
        cropType: result.cropType,
        xpGained,
        level: player.level,
        coinBonus: coinBonusPercent,
        diversityCoef
      });

      // 返回包含等级信息的result
      return {
        success: true,
        reward: finalReward,
        cropType: result.cropType,
        xpGained,
        level: player.level,
        leveledUp,
        currentXp: player.currentXp,
        xpToNextLevel: player.xpToNextLevel,
        coinBonus: coinBonusPercent,
        oldLevel,
        diversityCoef
      };
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
    if (this.sharedMoney < totalCost) {
      return { success: false, message: '金币不足' };
    }
    
    this.sharedMoney -= totalCost;
    
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
      money: this.sharedMoney, 
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

    // 获取动态价格
    const { finalPrice, priceModifier, eventMultiplier } = this.calculateCropPrice(cropType);
    const totalReward = Math.floor(finalPrice * quantity);

    player.inventory[cropType] -= quantity;

    if (player.inventory[cropType] <= 0) {
      delete player.inventory[cropType];
    }

    this.sharedMoney += totalReward;

    // 更新市场状态
    this.updateMarketOnSale(cropType, quantity);

    // 更新任务进度（出售任务和赚取金币任务）
    this.updateTaskProgress(socketId, 'sell', quantity);

    // 保存玩家数据
    dataStore.savePlayer(socketId, {
      name: player.name,
      money: this.sharedMoney,
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

    // 构建价格信息消息
    let priceInfo = '';
    if (eventMultiplier !== 1) {
      const eventPct = Math.round((eventMultiplier - 1) * 100);
      priceInfo = eventPct > 0 ? ` (事件+${eventPct}%)` : ` (事件${eventPct}%)`;
    } else if (priceModifier !== 1) {
      const modPct = Math.round((priceModifier - 1) * 100);
      priceInfo = modPct > 0 ? ` (市场+${modPct}%)` : ` (市场${modPct}%)`;
    }

    return {
      success: true,
      message: `出售 ${crop.name} x${quantity} 获得 ${totalReward} 金币${priceInfo}`,
      reward: totalReward,
      inventory: player.inventory,
      priceInfo: {
        basePrice: crop.sellPrice,
        priceModifier,
        eventMultiplier,
        finalPrice
      }
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
        money: this.sharedMoney, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      return { success: true, message: '使用化肥，作物瞬间成熟！' };
    }
    
    // 害虫防治道具
    if (item.effect === 'kill_pest') {
      // 杀虫剂：驱除当前格子及周围的害虫
      const result = this.usePesticide(x, y);
      
      player.items[itemId]--;
      if (player.items[itemId] <= 0) delete player.items[itemId];
      
      // 保存数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      return result;
    }
    
    if (item.effect === 'prevent_pest') {
      // 防虫网：防止害虫入侵
      if (!player.pestProtection) player.pestProtection = {};
      player.pestProtection.bugNet = true;
      player.pestProtection.bugNetUntil = Date.now() + 300 * 1000; // 5分钟
      
      player.items[itemId]--;
      if (player.items[itemId] <= 0) delete player.items[itemId];
      
      // 保存数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      return { success: true, message: '防虫网已放置，5分钟内害虫无法入侵！' };
    }
    
    if (item.effect === 'scare_pest') {
      // 稻草人：驱赶害虫
      if (!player.pestProtection) player.pestProtection = {};
      player.pestProtection.scarecrow = true;
      player.pestProtection.scarecrowUntil = Date.now() + 600 * 1000; // 10分钟
      
      // 驱赶当前周围所有害虫
      const range = 3;
      let scareCount = 0;
      this.pests = this.pests.filter(pest => {
        const dist = Math.abs(pest.x - x) + Math.abs(pest.y - y);
        if (dist <= range) {
          scareCount++;
          return false;
        }
        return true;
      });
      
      player.items[itemId]--;
      if (player.items[itemId] <= 0) delete player.items[itemId];
      
      // 保存数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      const scareMsg = scareCount > 0 ? `驱赶了${scareCount}只害虫！` : '';
      return { success: true, message: `稻草人已放置，10分钟内害虫不敢靠近！${scareMsg}` };
    }
    
    // 有机肥：恢复地块肥力
    if (item.effect === 'restore_fertility') {
      const restoreAmount = item.fertilityRestore || 50;
      const result = plot.useFertilizer(restoreAmount);
      
      player.items[itemId]--;
      if (player.items[itemId] <= 0) delete player.items[itemId];
      
      // 保存数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
        color: player.color, 
        position: player.position,
        inventory: player.inventory,
        items: player.items
      });
      
      return { success: true, message: `使用有机肥，地块肥力恢复${restoreAmount}点！当前肥力: ${result.newFertility}` };
    }
    
    return { success: false, message: '该道具无法在此使用' };
  }
  
  // 检查玩家是否有害虫保护
  hasPestProtection(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.pestProtection) return false;
    
    const now = Date.now();
    const bugNetActive = player.pestProtection.bugNet && player.pestProtection.bugNetUntil > now;
    const scarecrowActive = player.pestProtection.scarecrow && player.pestProtection.scarecrowUntil > now;
    
    return bugNetActive || scarecrowActive;
  }

  // 购买动物
  buyAnimal(socketId, animalType) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };
    
    const animal = ANIMALS[animalType];
    if (!animal) return { success: false, message: '未知动物' };
    
    if (this.sharedMoney < animal.buyPrice) {
      return { success: false, message: '金币不足' };
    }
    
    // 找到空栏位
    const emptyPen = this.animalPens.find(pen => !pen.animal);
    if (!emptyPen) {
      return { success: false, message: '动物栏已满' };
    }
    
    // 扣金币
    this.sharedMoney -= animal.buyPrice;
    
    // 放置动物
    const result = emptyPen.place(animalType, player.name);
    if (!result.success) {
      this.sharedMoney += animal.buyPrice; // 恢复金币
      return result;
    }
    
    // 保存玩家数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: this.sharedMoney, 
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
  harvestAnimalProduct(socketId, penIndex, animalPos) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };

    const pen = this.animalPens[penIndex];
    if (!pen) return { success: false, message: '栏位不存在' };

    // 距离验证（曼哈顿距离 <= 2）
    if (animalPos && player.position) {
      const dist = Math.abs(player.position.x - animalPos.x) + Math.abs(player.position.y - animalPos.y);
      if (dist > 2) {
        return { success: false, message: '距离太远，请靠近动物' };
      }
    }

    if (!pen.animal) return { success: false, message: '栏位没有动物' };
    if (!pen.isReady) {
      const animal = ANIMALS[pen.animal];
      const remaining = pen.remainingTime || 0;
      return { success: false, message: `${animal.name}还需要 ${remaining} 秒产出产品` };
    }
    
    const result = pen.harvest();
    if (result.success) {
      // 应用多样性系数
      const diversityCoef = this.calculateAnimalDiversity();
      const adjustedReward = Math.floor(result.reward * diversityCoef);

      // 添加产品到背包
      const productKey = `animal-${result.animalType}-product`;
      this.addToInventory(socketId, productKey, 1);

      // 加金币
      this.sharedMoney += adjustedReward;
      
      // 保存玩家数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
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
        reward: adjustedReward,
        diversityCoef
      });
    }

    return {
      success: true,
      message: `收获 ${result.product} +${adjustedReward}金币`,
      reward: adjustedReward,
      product: result.product
    };
  }

  // 出售动物
  sellAnimal(socketId, penIndex, animalPos) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };

    const pen = this.animalPens[penIndex];
    if (!pen) return { success: false, message: '栏位不存在' };

    // 距离验证（曼哈顿距离 <= 2）
    if (animalPos && player.position) {
      const dist = Math.abs(player.position.x - animalPos.x) + Math.abs(player.position.y - animalPos.y);
      if (dist > 2) {
        return { success: false, message: '距离太远，请靠近动物' };
      }
    }

    const result = pen.sell();
    if (result.success) {
      // 加金币
      this.sharedMoney += result.reward;
      
      // 保存玩家数据
      dataStore.savePlayer(socketId, { 
        name: player.name, 
        money: this.sharedMoney, 
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

  // 喂养动物
  feedAnimal(socketId, penIndex, feedId, animalPos) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: '玩家不存在' };

    const pen = this.animalPens[penIndex];
    if (!pen) return { success: false, message: '栏位不存在' };
    if (!pen.animal) return { success: false, message: '栏位没有动物' };

    // 距离验证
    if (animalPos && player.position) {
      const dist = Math.abs(player.position.x - animalPos.x) + Math.abs(player.position.y - animalPos.y);
      if (dist > 2) {
        return { success: false, message: '距离太远，请靠近动物' };
      }
    }

    const feed = SHOP_ITEMS[feedId];
    if (!feed || feed.type !== 'animal-feed') {
      return { success: false, message: '无效的饲料' };
    }
    if (this.sharedMoney < feed.price) {
      return { success: false, message: `金币不足（需 ${feed.price}💰）` };
    }

    // 扣金币，减少饥饿度
    this.sharedMoney -= feed.price;
    pen.hunger = Math.max(0, (pen.hunger || 0) - feed.hungerReduce);

    const animal = ANIMALS[pen.animal];
    const hungerPct = Math.round(pen.hunger);
    this.addFarmLog(`给 ${animal.emoji}${animal.name} 喂了 ${feed.emoji}${feed.name}，饥饿度降至 ${hungerPct}%`, feed.emoji, 'animal');

    // 保存状态
    this._saveState();

    return {
      success: true,
      message: `喂养成功！${animal.emoji}${animal.name} 饥饿度降至 ${hungerPct}%`,
      hunger: pen.hunger
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
    
    this.sharedMoney += totalReward;
    
    // 保存玩家数据
    dataStore.savePlayer(socketId, { 
      name: player.name, 
      money: this.sharedMoney, 
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
      sharedMoney: this.sharedMoney, // 共用金库
      plots: this.plots.map(row => row.map(plot => plot.getState())),
      animalPens: this.animalPens.map(pen => pen.getState()),
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        money: this.sharedMoney,
        color: p.color,
        position: p.position,
        inventory: p.inventory,
        items: p.items,
        // 任务数据
        dailyTaskProgress: p.dailyTaskProgress || {},
        dailyTasksClaimed: p.dailyTasksClaimed || [],
        achievements: p.achievements || [],
        stats: p.stats || { plantCount: 0, waterCount: 0, harvestCount: 0, sellCount: 0, fastHarvest: 0 },
        totalTaskRewards: p.totalTaskRewards || 0,
        // 等级系统数据
        level: p.level || 1,
        totalXp: p.totalXp || 0,
        currentXp: p.currentXp || 0,
        xpToNextLevel: p.xpToNextLevel || 100,
        coinBonus: p.coinBonus || 1
      })),
      gameStatus: this.gameStatus,
      crops: CROPS,
      animals: ANIMALS,
      shopItems: SHOP_ITEMS,
      gameDay: gameDay,
      gameTime: elapsedSeconds,
      // 天气系统
      weather: this.getWeatherInfo(),
      // 害虫系统
      pests: this.getPestsInfo(),
      // 任务配置
      taskConfig: {
        dailyTasks: DAILY_TASKS,
        achievements: ACHIEVEMENTS
      },
      // 农夫 NPC（多农夫支持）
      farmer:       this.farmers[0] ? this.farmers[0].getState() : null, // 向后兼容
      farmers:      this.farmers.map(f => f.getState()),
      farmerCount:  this.farmers.length,
      nextHireCost: this.getNextHireCost(),
      farmerFoods:  FARMER_FOODS,
      // 黄金交易系统
      gold: this.getGoldInfo(),
      // 市场供需系统
      market: this.getMarketInfo(),
      // 多样性系数
      diversity: this.getDiversityInfo(),
      // 动物位置（地图上）
      animalPositions: this.animalPositions,
      // 农夫AI思考记录
      farmerThoughts: this.farmerThoughts,
      // 工资和税收系统
      salary: this.getSalaryInfo(),
      tax: this.getEstimatedTax(),
      // 农场日志（最新 40 条）
      farmLog: this.farmLog
    };
  }

  // 销毁游戏实例，清理所有定时器
  destroy() {
    this._saveState();
    for (const id of this._intervals) clearInterval(id);
    this._intervals = [];
    for (const farmer of this.farmers) farmer.destroy();
    this.farmers = [];
  }
}

// 房间管理器
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { game, players, persist }
  }

  createRoom(roomId, width = 10, height = 10) {
    if (this.rooms.has(roomId)) {
      const room = this.rooms.get(roomId);
      // 如果房间存在但没有游戏实例，创建它
      if (!room.game) {
        room.game = new FarmGame(width, height, roomId);
      }
      return room;
    }

    const room = {
      id: roomId,
      game: new FarmGame(width, height, roomId),
      players: new Map(), // socketId -> player
      persist: true // 房间永久存在，不因为玩家数量为0而删除
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  // 不再自动删除房间 - 房间持久化
  removeRoom(roomId) {
    // 房间永久存在，不删除
    // this.rooms.delete(roomId);
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
    
    // 房间持久化：玩家退出后房间依然存在，时间继续流逝
    // 不再删除房间
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

module.exports = { FarmGame, RoomManager, CROPS, ANIMALS, SHOP_ITEMS, FARMER_FOODS };

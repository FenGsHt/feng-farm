'use strict';

// ============================================================
//  农夫行为基类
//  扩展方式：继承 FarmerBehavior，调用 FarmerBehavior.register()
// ============================================================
class FarmerBehavior {
  /**
   * @param {string} name       唯一名称
   * @param {string} emoji      日志 emoji
   * @param {number} baseWeight 基础权重（加权随机选择的底数）
   */
  constructor(name, emoji, baseWeight) {
    this.name       = name;
    this.emoji      = emoji;
    this.baseWeight = baseWeight;
    this.weight     = baseWeight; // 动态权重，由收益数据驱动

    // 收益追踪（用于动态调权）
    this._earnedTotal = 0;
    this._callCount   = 0;
  }

  /** 执行后记录收益，重新计算动态权重 */
  recordProfit(earned = 0) {
    if (earned <= 0) return;
    this._earnedTotal += earned;
    this._callCount   += 1;
    const avgEarned = this._earnedTotal / this._callCount;
    this.weight = Math.min(
      this.baseWeight + avgEarned * 0.6,
      this.baseWeight * 8
    );
  }

  // ---------- 子类实现 ----------

  canExecute(farmer, game) { return false; }
  getTarget(farmer, game)  { return null; }
  execute(farmer, game)    { return { log: '', acted: false, earned: 0 }; }

  // ---------- 静态注册表 ----------

  static registry = new Map();

  static register(BehaviorClass) {
    const instance = new BehaviorClass();
    FarmerBehavior.registry.set(instance.name, BehaviorClass);
  }
}

// ============================================================
//  内置行为
// ============================================================

/** 夜间睡觉（UTC+8 22:00–06:00） */
class SleepBehavior extends FarmerBehavior {
  constructor() { super('睡觉', '💤', 1); }
  canExecute(farmer) { return farmer.isNightTime(); }
  getTarget()        { return { x: 0, y: 0 }; }

  execute(farmer) {
    const wasAwake = farmer.state !== 'sleeping';
    farmer.state         = 'sleeping';
    farmer.emoji         = '😴';
    farmer.currentAction = '正在睡觉 💤';
    if (wasAwake) return { log: `${farmer.fullName} 回小屋睡觉了，晚安 💤`, acted: true, earned: 0 };
    return { log: '', acted: false, earned: 0 };
  }
}

/** 🍽️ 吃东西（饥饿时自动花公库金币买食物） */
class EatBehavior extends FarmerBehavior {
  constructor() { super('吃东西', '🍽️', 20); }

  canExecute(farmer, game) {
    // 饿了就想吃，没钱就凑合扛着
    return farmer.hunger >= 45 && game.sharedMoney >= 5;
  }

  getTarget() { return null; } // 原地吃

  execute(farmer, game) {
    // 按饥饿程度和钱包选食物档次
    let cost, satiety, foodName;
    if (game.sharedMoney < 15 || farmer.hunger < 60) {
      cost = 5;  satiety = 25; foodName = '面包 🍞';
    } else if (game.sharedMoney < 30 || farmer.hunger < 75) {
      cost = 10; satiety = 40; foodName = '米饭 🍚';
    } else {
      cost = 18; satiety = 65; foodName = '肉食 🥩';
    }

    if (game.sharedMoney < cost) return { log: '', acted: false, earned: 0 };

    game.sharedMoney -= cost;
    farmer.hunger = Math.max(0, farmer.hunger - satiety);
    farmer.state         = 'idle';
    farmer.currentAction = `刚吃了${foodName}`;

    const satPct = Math.round(100 - farmer.hunger);
    return {
      log:    `${farmer.fullName} 买了${foodName}充饥（-${cost}💰），饱腹度 ${satPct}%`,
      acted:  true,
      earned: 0
    };
  }
}

/** 收获成熟作物 */
class HarvestCropBehavior extends FarmerBehavior {
  constructor() { super('收获作物', '🧺', 12); }

  canExecute(farmer, game) { return this._findRipe(farmer, game) !== null; }
  getTarget(farmer, game)  { return this._findRipe(farmer, game); }

  execute(farmer, game) {
    const t = this._findRipe(farmer, game) || { x: farmer.x, y: farmer.y };
    const plot = game.plots[t.y]?.[t.x];
    if (!plot || !plot.crop || plot.growthStage < 3) return { log: '', acted: false, earned: 0 };

    const result = plot.harvest();
    if (!result.success) return { log: '', acted: false, earned: 0 };

    const cfg = game.getCropConfig(result.cropType);
    game.sharedMoney     += result.reward;
    farmer.state          = 'working';
    farmer.emoji          = '🧑‍🌾';
    farmer.currentAction  = `收获了 ${cfg.emoji}${cfg.name}`;
    return {
      log:    `${farmer.fullName} 收获了 ${cfg.emoji}${cfg.name}，公库 +${result.reward} 💰`,
      acted:  true,
      earned: result.reward
    };
  }

  _findRipe(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++)
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop && plot.growthStage >= 3) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
      }
    return best;
  }
}

/** 给未浇水作物浇水 */
class WaterCropBehavior extends FarmerBehavior {
  constructor() { super('浇水', '💧', 8); }

  canExecute(farmer, game) { return this._findDry(farmer, game) !== null; }
  getTarget(farmer, game)  { return this._findDry(farmer, game); }

  execute(farmer, game) {
    const t    = this._findDry(farmer, game) || { x: farmer.x, y: farmer.y };
    const plot = game.plots[t.y]?.[t.x];
    if (!plot || !plot.crop || plot.isWatered) return { log: '', acted: false, earned: 0 };

    const result = plot.water();
    if (!result.success) return { log: '', acted: false, earned: 0 };

    const cfg = game.getCropConfig(plot.crop);
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `给 ${cfg.emoji} 浇水`;
    return {
      log:    `${farmer.fullName} 给 ${cfg.emoji}${cfg.name} 浇了水 💧`,
      acted:  true,
      earned: 0
    };
  }

  _findDry(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++)
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop && !plot.isWatered && plot.growthStage < 3) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
      }
    return best;
  }
}

/** 在空地上种植种子 */
class PlantCropBehavior extends FarmerBehavior {
  constructor() { super('种植作物', '🌱', 6); }

  canExecute(farmer, game) {
    if (!Object.values(farmer.seeds).some(v => v > 0)) return false;
    for (let y = 0; y < game.height; y++)
      for (let x = 0; x < game.width; x++)
        if (!game.plots[y][x].crop) return true;
    return false;
  }

  getTarget(farmer, game) { return this._findEmpty(farmer, game); }

  execute(farmer, game) {
    const available = Object.entries(farmer.seeds).filter(([, v]) => v > 0);
    if (!available.length) return { log: '', acted: false, earned: 0 };

    // 统计当前作物数量
    const cropCounts = {};
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const crop = game.plots[y][x].crop;
        if (crop) {
          cropCounts[crop] = (cropCounts[crop] || 0) + 1;
        }
      }
    }
    const totalCrops = Object.values(cropCounts).reduce((a, b) => a + b, 0);

    // 按多样性优先排序：优先种植数量少的种类
    const sorted = available.sort((a, b) => {
      const countA = cropCounts[a[0]] || 0;
      const countB = cropCounts[b[0]] || 0;

      // 如果有作物，优先种植数量少的种类（提高多样性）
      if (totalCrops > 0) {
        // 没有的种类最优先
        if (countA === 0 && countB > 0) return -1;
        if (countB === 0 && countA > 0) return 1;
        // 都有，按数量升序（少的优先）
        if (countA !== countB) return countA - countB;
      }

      // 同等优先级按库存数量降序（先用多的）
      return b[1] - a[1];
    });

    const bestSeed = sorted[0][0];

    const t    = this._findEmpty(farmer, game) || { x: farmer.x, y: farmer.y };
    const plot = game.plots[t.y]?.[t.x];
    if (!plot || plot.crop) return { log: '', acted: false, earned: 0 };

    const result = plot.plant(bestSeed, farmer.fullName);
    if (!result.success) return { log: '', acted: false, earned: 0 };

    farmer.seeds[bestSeed]--;
    if (farmer.seeds[bestSeed] <= 0) delete farmer.seeds[bestSeed];

    const cfg = game.getCropConfig(bestSeed);

    // 计算新的多样性信息
    const newCounts = { ...cropCounts, [bestSeed]: (cropCounts[bestSeed] || 0) + 1 };
    const newTotal = totalCrops + 1;
    const uniqueCount = Object.keys(newCounts).length;

    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `种下了 ${cfg.emoji}${cfg.name}`;
    return {
      log:    `${farmer.fullName} 在 (${t.x},${t.y}) 种下了 ${cfg.emoji}${cfg.name} 🌱（作物多样性: ${uniqueCount}种/${newTotal}株）`,
      acted:  true,
      earned: 0
    };
  }

  _findEmpty(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++)
      for (let x = 0; x < game.width; x++)
        if (!game.plots[y][x].crop) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
    return best;
  }
}

/** 消灭害虫 */
class KillPestBehavior extends FarmerBehavior {
  constructor() { super('消灭害虫', '🧴', 15); }

  canExecute(farmer, game) {
    return (farmer.items.pesticide || 0) > 0 && game.pests.length > 0;
  }

  getTarget(farmer, game) { return this._nearest(farmer, game.pests); }

  execute(farmer, game) {
    const pest = game.pests.find(p => p.x === farmer.x && p.y === farmer.y)
      || this._nearest(farmer, game.pests);
    if (!pest) return { log: '', acted: false, earned: 0 };

    const result = game.usePesticide(pest.x, pest.y);
    if (!result.success) return { log: '', acted: false, earned: 0 };

    farmer.items.pesticide--;
    if (farmer.items.pesticide <= 0) delete farmer.items.pesticide;

    const NAMES = { aphid: '🐛蚜虫', locust: '🦗蝗虫', rat: '🐀老鼠' };
    const label  = NAMES[pest.type] || '害虫';
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `消灭了 ${label}`;
    return { log: `${farmer.fullName} 喷洒杀虫剂消灭了 ${label}！`, acted: true, earned: 5 };
  }

  _nearest(farmer, pests) {
    let best = null, minDist = Infinity;
    for (const p of pests) {
      const d = Math.abs(p.x - farmer.x) + Math.abs(p.y - farmer.y);
      if (d < minDist) { minDist = d; best = p; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }
}

/** 收获动物产品 */
class HarvestAnimalBehavior extends FarmerBehavior {
  constructor() { super('收获动物产品', '🐾', 12); }

  canExecute(farmer, game) {
    return game.animalPens.some(pen => pen.animal && pen.isReady);
  }

  getTarget(farmer, game) {
    // 找最近的可收获动物位置
    let nearest = null, minDist = Infinity;
    for (let i = 0; i < game.animalPens.length; i++) {
      const pen = game.animalPens[i];
      if (pen.animal && pen.isReady) {
        const pos = game.animalPositions?.[i];
        if (pos) {
          const d = Math.abs(farmer.x - pos.x) + Math.abs(farmer.y - pos.y);
          if (d < minDist) { minDist = d; nearest = pos; }
        }
      }
    }
    return nearest || { x: 0, y: game.height - 1 };
  }

  execute(farmer, game) {
    let totalEarned = 0;
    const harvested = [];

    for (let i = 0; i < game.animalPens.length; i++) {
      const pen = game.animalPens[i];
      if (!pen.animal || !pen.isReady) continue;

      // 检查动物位置
      const pos = game.animalPositions?.[i];
      if (pos) {
        const dist = Math.abs(farmer.x - pos.x) + Math.abs(farmer.y - pos.y);
        if (dist > 2) continue; // 跳过太远的动物
      }

      // 应用动物多样性系数
      const diversityCoef = game.calculateAnimalDiversity ? game.calculateAnimalDiversity() : 1;
      const result = pen.harvest();
      if (result.success) {
        const adjustedReward = Math.floor(result.reward * diversityCoef);
        game.sharedMoney += adjustedReward;
        totalEarned      += adjustedReward;
        const ANIMAL_EMOJI = { chicken:'🐔', duck:'🦆', sheep:'🐑', cow:'🐄', pig:'🐖', horse:'🐴', rabbit:'🐰', bee:'🐝' };
        harvested.push(`${ANIMAL_EMOJI[result.animalType] || '🐾'}${result.product}`);
      }
    }

    if (!harvested.length) return { log: '', acted: false, earned: 0 };

    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = '收获了动物产品';
    return {
      log:    `${farmer.fullName} 收获了附近的 ${harvested.join('、')}，公库 +${totalEarned} 💰`,
      acted:  true,
      earned: totalEarned
    };
  }
}

/** 🌽 喂养饥饿的动物 */
class FeedAnimalBehavior extends FarmerBehavior {
  constructor() { super('喂养动物', '🌽', 9); }

  canExecute(farmer, game) {
    // 检查是否有饥饿动物
    const hasHungryAnimal = game.animalPens.some(p => p.animal && (p.hunger || 0) >= 60);
    return hasHungryAnimal && game.sharedMoney >= 10;
  }

  getTarget(farmer, game) {
    // 找最近的饥饿动物位置
    let nearest = null, minDist = Infinity;
    for (let i = 0; i < game.animalPens.length; i++) {
      const pen = game.animalPens[i];
      if (pen.animal && (pen.hunger || 0) >= 60) {
        const pos = game.animalPositions?.[i];
        if (pos) {
          const d = Math.abs(farmer.x - pos.x) + Math.abs(farmer.y - pos.y);
          if (d < minDist) { minDist = d; nearest = pos; }
        }
      }
    }
    return nearest || { x: 0, y: game.height - 1 };
  }

  execute(farmer, game) {
    let fed = 0, cost = 0;

    for (let i = 0; i < game.animalPens.length; i++) {
      const pen = game.animalPens[i];
      if (!pen.animal || (pen.hunger || 0) < 60) continue;

      // 检查动物位置
      const pos = game.animalPositions?.[i];
      if (pos) {
        const dist = Math.abs(farmer.x - pos.x) + Math.abs(farmer.y - pos.y);
        if (dist > 2) continue; // 跳过太远的动物
      }

      // 喂养这只动物
      pen.hunger = Math.max(0, (pen.hunger || 0) - 65);
      cost += 5;
      fed++;
    }

    if (!fed || game.sharedMoney < cost) return { log: '', acted: false, earned: 0 };

    game.sharedMoney -= cost;
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `喂养了 ${fed} 只动物`;
    return {
      log:    `${farmer.fullName} 喂养了 ${fed} 只附近的动物 🌽，花费 ${cost} 💰`,
      acted:  true,
      earned: 0
    };
  }
}

/** 购买动物 */
class BuyAnimalBehavior extends FarmerBehavior {
  constructor() {
    super('购买动物', '🛒', 4);
    this._cooldown = 0;
  }

  canExecute(farmer, game) {
    if (Date.now() < this._cooldown) return false;
    const hasEmpty = game.animalPens.some(p => !p.animal);
    return hasEmpty && game.sharedMoney >= 100;
  }

  getTarget(farmer, game) {
    return { x: 0, y: game.height - 1 };
  }

  execute(farmer, game) {
    // 统计当前动物数量
    const animalCounts = {};
    for (const pen of game.animalPens) {
      if (pen.animal) {
        animalCounts[pen.animal] = (animalCounts[pen.animal] || 0) + 1;
      }
    }
    const totalAnimals = Object.values(animalCounts).reduce((a, b) => a + b, 0);

    // 通过 game.ANIMALS 访问，避免循环 require
    const affordable = Object.entries(game.ANIMALS)
      .filter(([, a]) => game.sharedMoney >= a.buyPrice + 50);

    if (!affordable.length) return { log: '', acted: false, earned: 0 };

    // 按多样性优先排序：优先购买数量少的种类
    const sorted = affordable.sort((a, b) => {
      const countA = animalCounts[a[0]] || 0;
      const countB = animalCounts[b[0]] || 0;

      // 如果有动物，优先购买数量少的种类（提高多样性）
      if (totalAnimals > 0) {
        // 没有的种类最优先
        if (countA === 0 && countB > 0) return -1;
        if (countB === 0 && countA > 0) return 1;
        // 都有，按数量升序
        if (countA !== countB) return countA - countB;
      }

      // 同等优先级按性价比排序
      return (b[1].productPrice / b[1].growthTime) - (a[1].productPrice / a[1].growthTime);
    });

    const [animalType, animal] = sorted[0];
    const pen = game.animalPens.find(p => !p.animal);
    if (!pen) return { log: '', acted: false, earned: 0 };

    // AnimalPen.place() 方法
    const result = pen.place(animalType, farmer.fullName);
    if (!result.success) return { log: '', acted: false, earned: 0 };

    game.sharedMoney -= animal.buyPrice;
    this._cooldown = Date.now() + 120000; // 2 分钟冷却

    // 计算新的多样性系数
    const newCounts = { ...animalCounts, [animalType]: (animalCounts[animalType] || 0) + 1 };
    const newTotal = totalAnimals + 1;
    const uniqueCount = Object.keys(newCounts).length;
    const diversityBonus = `多样性: ${uniqueCount}种/${newTotal}只`;

    farmer.state         = 'working';
    farmer.currentAction = `买了 ${animal.emoji}${animal.name}`;
    return {
      log:    `${farmer.fullName} 花 ${animal.buyPrice} 💰 买了一只 ${animal.emoji}${animal.name}！（${diversityBonus}）`,
      acted:  true,
      earned: 0
    };
  }
}

/** 👥 头号农夫管理人手（雇佣/解雇） */
class HireFireFarmerBehavior extends FarmerBehavior {
  constructor() { super('管理人手', '👥', 2); }

  // 只有第一个农夫（位置 0）负责管理招聘
  canExecute(farmer, game) {
    return game.farmers && game.farmers[0] === farmer;
  }

  getTarget() { return null; }

  execute(farmer, game) {
    const n        = game.farmers.length;
    const hireCost = game.getNextHireCost();

    // 钱够多且人手不足 → 雇人（额外留 n×300 运营缓冲）
    const hireThreshold = hireCost + n * 300 + 500;
    if (n < 6 && game.sharedMoney >= hireThreshold) {
      const result = game.hireNewFarmer();
      if (result.success) {
        return {
          log:   `${farmer.fullName} 决定雇佣新农夫 ${result.name}（-${result.cost}💰）👥`,
          acted: true, earned: 0
        };
      }
    }

    // 钱紧张且多人 → 解雇最新员工
    if (n > 1 && game.sharedMoney < 300) {
      const result = game.fireFarmer();
      if (result.success) {
        return {
          log:   `${farmer.fullName} 因资金紧张解雇了 ${result.name} 😢`,
          acted: true, earned: 0
        };
      }
    }

    return { log: '', acted: false, earned: 0 };
  }
}

/** 巡视/闲逛（兜底行为） */
class WanderBehavior extends FarmerBehavior {
  constructor() { super('巡视', '🚶', 1); }
  canExecute() { return true; }

  getTarget(farmer, game) {
    return {
      x: Math.max(0, Math.min(game.width  - 1, farmer.x + Math.floor(Math.random() * 5) - 2)),
      y: Math.max(0, Math.min(game.height - 1, farmer.y + Math.floor(Math.random() * 5) - 2))
    };
  }

  execute(farmer) {
    farmer.state = 'wandering';
    farmer.emoji = '🧑‍🌾';
    const texts  = ['在农场里溜达', '检查作物状况', '巡视田地', '在地里转转', '观察今天收成'];
    farmer.currentAction = texts[Math.floor(Math.random() * texts.length)];
    return { log: `${farmer.fullName} ${farmer.currentAction}...`, acted: true, earned: 0 };
  }
}

// ——— 注册所有默认行为 ———
FarmerBehavior.register(SleepBehavior);
FarmerBehavior.register(EatBehavior);           // 新增：吃东西
FarmerBehavior.register(KillPestBehavior);
FarmerBehavior.register(HarvestCropBehavior);
FarmerBehavior.register(FeedAnimalBehavior);    // 新增：喂养动物
FarmerBehavior.register(WaterCropBehavior);
FarmerBehavior.register(PlantCropBehavior);
FarmerBehavior.register(HarvestAnimalBehavior);
FarmerBehavior.register(BuyAnimalBehavior);
FarmerBehavior.register(HireFireFarmerBehavior); // 新增：管理人手
FarmerBehavior.register(WanderBehavior);

// ============================================================
//  农夫 NPC 主类
// ============================================================
class Farmer {
  constructor(game, logCallback, options = {}) {
    this.game        = game;
    this.logCallback = logCallback;

    this.name     = options.name || '阿明';
    this.emoji    = '🧑‍🌾';
    this.fullName = `农夫${this.name}`;

    this.x = options.startX || 0;
    this.y = options.startY || 0;

    this.walkTarget       = null;
    this.onArriveCallback = null;

    this.state         = 'idle';
    this.currentAction = '准备工作';

    // ====== 饥饿系统 ======
    this.hunger  = options.hunger || 0;  // 0=饱，100=饿死
    this.isDead  = false;

    // 农夫库存
    this.seeds = options.seeds || { wheat: 8, carrot: 8, tomato: 6, rice: 4 };
    this.items = options.items || { pesticide: 3 };

    // ====== 性格系统 ======
    this.personality = options.personality || this._generatePersonality();

    // ====== 聊天系统 ======
    this.chatHistory = options.chatHistory || []; // 最近聊天记录
    this.recentActions = []; // 最近行动记录

    // 从注册表实例化所有行为
    this.behaviors = Array.from(FarmerBehavior.registry.values()).map(Cls => new Cls());

    this.tickIntervalMs = options.tickInterval || 28000;
    this.moveIntervalMs = options.moveInterval || 1600;

    this._tickIntervalId = null;
    this._moveIntervalId = null;
    this._tickCount      = 0;

    setTimeout(() => this._start(), options.startDelay ?? 5000);
  }

  // ---------- 性格生成 ----------
  _generatePersonality() {
    // 性格维度：每个维度0-1
    const traits = ['勤劳', '节俭', '乐观', '谨慎', '健谈'];
    const values = {};
    traits.forEach(t => {
      values[t] = Math.random();
    });
    return {
      ...values,
      // 性格描述
      description: this._describePersonality(values)
    };
  }

  _describePersonality(values) {
    const parts = [];
    if (values['勤劳'] > 0.7) parts.push('勤劳肯干');
    else if (values['勤劳'] < 0.3) parts.push('懒散悠闲');
    if (values['节俭'] > 0.7) parts.push('精打细算');
    else if (values['节俭'] < 0.3) parts.push('挥金如土');
    if (values['乐观'] > 0.7) parts.push('乐观开朗');
    else if (values['乐观'] < 0.3) parts.push('忧心忡忡');
    if (values['谨慎'] > 0.7) parts.push('小心谨慎');
    else if (values['谨慎'] < 0.3) parts.push('大胆冒险');
    if (values['健谈'] > 0.7) parts.push('健谈幽默');
    else if (values['健谈'] < 0.3) parts.push('沉默寡言');
    return parts.length > 0 ? parts.join('、') : '性格平凡';
  }

  // 记录行动（用于聊天上下文）
  recordAction(action, details = {}) {
    this.recentActions.push({
      time: Date.now(),
      action,
      details
    });
    // 只保留最近20条
    if (this.recentActions.length > 20) {
      this.recentActions.shift();
    }
  }

  // ---------- 行为管理 ----------

  registerBehavior(behaviorInstance) {
    this.behaviors.push(behaviorInstance);
    return this;
  }

  removeBehavior(name) {
    this.behaviors = this.behaviors.filter(b => b.name !== name);
    return this;
  }

  // ---------- 时间工具 ----------

  isNightTime() {
    // 暂时禁用睡眠系统
    return false;
    // const h = (new Date().getUTCHours() + 8) % 24;
    // return h >= 22 || h < 6;
  }

  getTimeString() {
    const now = new Date();
    return `${String((now.getUTCHours() + 8) % 24).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  }

  // ---------- 死亡 ----------

  _die() {
    if (this.isDead) return;
    this.isDead      = true;
    this.state       = 'dead';
    this.emoji       = '💀';
    this.currentAction = '因饥饿而倒下';
    this._log(`${this.fullName} 因长时间饥饿去世了 💀 请记得投喂农夫！`, '💀', 'farmer');
    this.destroy();
    // 从 game.farmers 移除自身
    if (this.game && Array.isArray(this.game.farmers)) {
      this.game.farmers = this.game.farmers.filter(f => f !== this);
    }
  }

  // ---------- LLM 预留接口 ----------

  async thinkWithAI() {
    // 检查环境变量配置
    const LLM_API_URL = process.env.LLM_API_URL || '';
    const LLM_API_KEY = process.env.LLM_API_KEY || '';
    const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';

    if (!LLM_API_URL || !LLM_API_KEY) {
      console.log('[Farmer LLM] 未配置API，跳过AI思考');
      return null;
    }

    try {
      // 构建当前农场状态描述
      const farmState = this._buildFarmStateDescription();

      const prompt = `你是一个农场游戏中的AI农夫，名字叫${this.fullName}。你需要分析当前农场状况并决定接下来的行动优先级。

当前农场状态：
${farmState}

你的可选行为及其当前权重：
${this.behaviors.map(b => `- ${b.name}: 权重 ${b.weight.toFixed(1)}`).join('\n')}

请分析当前局势，返回一个JSON对象调整各行为的权重（权重范围1-100）：
{
  "thinking": "你的思考过程（简短描述当前状况和策略）",
  "weights": {
    "种植": 数字,
    "浇水": 数字,
    "收获作物": 数字,
    "清理害虫": 数字,
    "喂养动物": 数字,
    "收获动物产品": 数字
  }
}

只返回JSON，不要其他文字。`;

      const response = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // 解析返回的JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('无法解析返回内容');
      }

      const result = JSON.parse(jsonMatch[0]);

      // 更新权重
      if (result.weights) {
        for (const behavior of this.behaviors) {
          if (result.weights[behavior.name] !== undefined) {
            behavior.weight = Math.max(1, Math.min(100, result.weights[behavior.name]));
          }
        }
      }

      // 记录思考
      const thoughtRecord = {
        timestamp: Date.now(),
        farmerName: this.fullName,
        thinking: result.thinking || '思考中...',
        weights: result.weights || {}
      };

      // 保存到游戏状态
      if (this.game && this.game.addFarmerThought) {
        this.game.addFarmerThought(thoughtRecord);
      }

      this._log(`🧠 ${this.fullName} AI思考: ${result.thinking?.substring(0, 50)}...`, '🧠', 'ai-thought');

      return thoughtRecord;

    } catch (error) {
      console.error('[Farmer LLM] 思考失败:', error.message);
      return null;
    }
  }

  // 构建农场状态描述
  _buildFarmStateDescription() {
    const game = this.game;
    const lines = [];

    // 金库
    lines.push(`💰 公库金币: ${game.sharedMoney}`);

    // 地块统计
    let planted = 0, ripe = 0, watered = 0;
    const cropCounts = {};
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop) {
          planted++;
          cropCounts[plot.crop] = (cropCounts[plot.crop] || 0) + 1;
          if (plot.growthStage >= 3) ripe++;
          if (plot.isWatered) watered++;
        }
      }
    }
    lines.push(`🌱 已种植地块: ${planted}, 成熟: ${ripe}, 已浇水: ${watered}`);

    // 多样性系数（重要！影响收益）
    const diversity = game.getDiversityInfo ? game.getDiversityInfo() : null;
    if (diversity) {
      lines.push(`📊 作物多样性: ${diversity.cropDiversity}% (${diversity.cropCount}种)`);
      if (diversity.animalCount > 0) {
        lines.push(`📊 动物多样性: ${diversity.animalDiversity}% (${diversity.animalCount}种)`);
      }
      // 多样性警告
      if (diversity.cropDiversity < 80) {
        const crops = Object.entries(cropCounts).sort((a, b) => b[1] - a[1]);
        if (crops.length > 0) {
          lines.push(`⚠️ 作物过于单一！主要种植: ${crops.map(([c, n]) => `${c}(${n}株)`).join(', ')}`);
          lines.push(`💡 建议: 种植更多种类可提高收益`);
        }
      }
    }

    // 害虫
    lines.push(`🐛 害虫数量: ${game.pests?.length || 0}`);

    // 动物
    const animalCount = game.animalPens?.filter(p => p.animal).length || 0;
    const readyAnimals = game.animalPens?.filter(p => p.isReady).length || 0;
    const animalCounts = {};
    for (const pen of (game.animalPens || [])) {
      if (pen.animal) {
        animalCounts[pen.animal] = (animalCounts[pen.animal] || 0) + 1;
      }
    }
    lines.push(`🐔 动物数量: ${animalCount}, 可收获: ${readyAnimals}`);
    if (Object.keys(animalCounts).length > 0) {
      lines.push(`🐔 动物种类: ${Object.entries(animalCounts).map(([a, n]) => `${a}(${n}只)`).join(', ')}`);
    }

    // 农夫状态
    lines.push(`👨‍🌾 我的饥饿度: ${Math.round(this.hunger)}%`);
    lines.push(`📦 种子库存: ${JSON.stringify(this.seeds)}`);

    // 黄金
    if (game.goldAmount > 0) {
      lines.push(`🥇 持有黄金: ${game.goldAmount.toFixed(2)}g, 金价: ${game.goldPrice}💰/g`);
    }

    return lines.join('\n');
  }

  // ---------- 聊天系统 ----------

  async chat(playerName, message) {
    const LLM_API_URL = process.env.LLM_API_URL || '';
    const LLM_API_KEY = process.env.LLM_API_KEY || '';
    const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';

    // 记录玩家消息
    this.chatHistory.push({
      role: 'player',
      name: playerName,
      content: message,
      time: Date.now()
    });

    // 保留最近10条
    if (this.chatHistory.length > 10) {
      this.chatHistory.shift();
    }

    // 如果没有配置LLM，返回默认回复
    if (!LLM_API_URL || !LLM_API_KEY) {
      const defaultReplies = [
        '嗯，今天天气不错呢！',
        '农场里还有很多活要干呢。',
        '你有什么需要帮忙的吗？',
        '我最近在研究怎么种出更好的庄稼。',
        '咳咳，有点饿了...'
      ];
      const reply = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
      this.chatHistory.push({ role: 'farmer', content: reply, time: Date.now() });
      return reply;
    }

    try {
      // 构建上下文
      const farmState = this._buildFarmStateDescription();
      const recentActions = this.recentActions.slice(-5).map(a => {
        const time = new Date(a.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${a.action}`;
      }).join('\n');

      const chatContext = this.chatHistory.slice(-6).map(c => {
        if (c.role === 'player') {
          return `玩家${c.name}: ${c.content}`;
        }
        return `我: ${c.content}`;
      }).join('\n');

      const systemPrompt = `你是农场游戏中的AI农夫，名字叫${this.fullName}。

【你的性格】
${this.personality.description}
- 勤劳值: ${Math.round(this.personality['勤劳'] * 100)}%
- 节俭值: ${Math.round(this.personality['节俭'] * 100)}%
- 乐观值: ${Math.round(this.personality['乐观'] * 100)}%
- 谨慎值: ${Math.round(this.personality['谨慎'] * 100)}%
- 健谈值: ${Math.round(this.personality['健谈'] * 100)}%

【当前农场状态】
${farmState}

【最近行动】
${recentActions || '暂无特别行动'}

【最近聊天】
${chatContext || '暂无聊天记录'}

请根据你的性格和当前状况，用自然、简短的方式回复玩家（1-3句话）。回复要体现你的性格特点。`;

      const response = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: 0.8,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '嗯...让我想想怎么回答。';

      // 记录农夫回复
      this.chatHistory.push({
        role: 'farmer',
        content: reply,
        time: Date.now()
      });

      return reply;

    } catch (error) {
      console.error('[Farmer Chat] 聊天失败:', error.message);
      const fallbackReply = '抱歉，我刚才走神了，你说的什么？';
      this.chatHistory.push({ role: 'farmer', content: fallbackReply, time: Date.now() });
      return fallbackReply;
    }
  }

  // ---------- 加权随机选择 ----------

  _pickBehavior() {
    const eligible = this.behaviors.filter(b => b.canExecute(this, this.game));
    if (!eligible.length) return null;

    // EatBehavior 和 SleepBehavior 有强制优先级
    const eat   = eligible.find(b => b.name === '吃东西');
    if (eat && this.hunger >= 75) return eat; // 非常饿时强制进食

    const sleep = eligible.find(b => b.name === '睡觉');
    if (sleep) return sleep;

    const total = eligible.reduce((s, b) => s + b.weight, 0);
    let rand = Math.random() * total;
    for (const b of eligible) {
      rand -= b.weight;
      if (rand <= 0) return b;
    }
    return eligible[eligible.length - 1];
  }

  // ---------- 移动循环 ----------

  _moveStep() {
    if (!this.walkTarget) return;
    const { x: tx, y: ty } = this.walkTarget;

    if (this.x === tx && this.y === ty) {
      this.walkTarget = null;
      if (this.onArriveCallback) {
        const cb = this.onArriveCallback;
        this.onArriveCallback = null;
        try { cb(); } catch (e) { console.error('[Farmer] arrive error:', e); }
      }
      return;
    }

    if      (this.x < tx) this.x++;
    else if (this.x > tx) this.x--;
    else if (this.y < ty) this.y++;
    else if (this.y > ty) this.y--;

    this.state         = 'walking';
    this.currentAction = `前往 (${tx},${ty})`;
  }

  // ---------- 决策 tick ----------

  tick() {
    if (this.isDead) return;
    this._tickCount++;

    try {
      // ====== 饥饿增加（睡觉时代谢较慢）======
      const hungerRate = this.state === 'sleeping' ? 0.2 : 0.4;
      this.hunger = Math.min(100, this.hunger + hungerRate);

      // 死亡检查
      if (this.hunger >= 100) {
        this._die();
        return;
      }

      // 起床检查
      if (!this.isNightTime() && this.state === 'sleeping') {
        this.state         = 'idle';
        this.emoji         = '🧑‍🌾';
        this.currentAction = '起床啦！';
        this._log(`${this.fullName} 从小屋醒来，开始新的一天 🌅`, '🌅', 'farmer');
      }

      if (this.walkTarget) return; // 仍在赶路，等到达再决策

      if (this._tickCount % 20 === 0) this._restockSeeds();

      const beh = this._pickBehavior();
      if (!beh) return;

      const target   = beh.getTarget(this, this.game);
      const needWalk = target && (target.x !== this.x || target.y !== this.y);

      if (needWalk) {
        this.walkTarget       = target;
        this.state            = 'walking';
        this.currentAction    = `前往 (${target.x},${target.y})`;
        this.onArriveCallback = () => this._doExecute(beh);
      } else {
        if (target) { this.x = target.x; this.y = target.y; }
        this._doExecute(beh);
      }
    } catch (err) {
      console.error('[Farmer] tick error:', err);
    }
  }

  _doExecute(beh) {
    const { log, acted, earned } = beh.execute(this, this.game);
    if (acted) {
      beh.recordProfit(earned);
      if (log) this._log(log, beh.emoji, 'farmer');
    }
  }

  // ---------- 补仓 ----------

  _restockSeeds() {
    const SEED_PRICES = { wheat: 2, carrot: 3, rice: 8, tomato: 5 };
    const CROP_NAMES = { wheat: '小麦', carrot: '胡萝卜', rice: '水稻', tomato: '番茄' };

    // 统计当前作物数量（用于多样性决策）
    const cropCounts = {};
    for (let y = 0; y < this.game.height; y++) {
      for (let x = 0; x < this.game.width; x++) {
        const crop = this.game.plots[y][x].crop;
        if (crop) {
          cropCounts[crop] = (cropCounts[crop] || 0) + 1;
        }
      }
    }

    // 按多样性优先排序：优先购买当前种植少的作物种子
    const cropTypes = Object.keys(SEED_PRICES).sort((a, b) => {
      const countA = cropCounts[a] || 0;
      const countB = cropCounts[b] || 0;
      // 没种的作物优先
      if (countA === 0 && countB > 0) return -1;
      if (countB === 0 && countA > 0) return 1;
      // 都有种，少的优先
      return countA - countB;
    });

    for (const crop of cropTypes) {
      const price = SEED_PRICES[crop];
      const cost = price * 5;
      const currentCount = cropCounts[crop] || 0;
      const seedCount = this.seeds[crop] || 0;

      // 种子库存低于5且有钱就买
      if (seedCount < 5 && this.game.sharedMoney >= cost + 50) {
        this.seeds[crop] = seedCount + 5;
        this.game.sharedMoney -= cost;

        // 日志中包含多样性提示
        const diversityHint = currentCount === 0 ? '（新种类，提高多样性！）' : '';
        this._log(`${this.fullName} 购买了 ${CROP_NAMES[crop]}种子x5（-${cost}💰）${diversityHint}`, '🌱', 'shop');
      }
    }

    // 杀虫剂：40金币买2个
    if ((this.items.pesticide || 0) < 2 && this.game.sharedMoney >= 90) {
      this.items.pesticide = (this.items.pesticide || 0) + 2;
      this.game.sharedMoney -= 40;
      this._log(`${this.fullName} 购买了 杀虫剂x2（-40💰）`, '🧪', 'shop');
    }
  }

  _log(message, emoji, type) {
    if (this.logCallback) this.logCallback(message, emoji, type);
  }

  _start() {
    if (this.isDead) return;
    this._log(`${this.fullName} 上班了，开始照料农场！`, '🧑‍🌾', 'system');
    this._moveIntervalId = setInterval(() => this._moveStep(), this.moveIntervalMs);
    this.tick();
    this._tickIntervalId = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  destroy() {
    if (this._tickIntervalId) { clearInterval(this._tickIntervalId); this._tickIntervalId = null; }
    if (this._moveIntervalId) { clearInterval(this._moveIntervalId); this._moveIntervalId = null; }
  }

  // ---------- 状态序列化 ----------

  getState() {
    return {
      name:          this.name,
      fullName:      this.fullName,
      emoji:         this.emoji,
      x:             this.x,
      y:             this.y,
      state:         this.state,
      currentAction: this.currentAction,
      isSleeping:    this.state === 'sleeping',
      isWalking:     this.state === 'walking',
      isDead:        this.isDead,
      walkTarget:    this.walkTarget,
      timeString:    this.getTimeString(),
      // 饥饿状态
      hunger:        Math.round(this.hunger),
      hungerPct:     Math.round(this.hunger),
      isHungry:      this.hunger >= 50,
      isStarving:    this.hunger >= 80,
      // 权重快照（调试用）
      behaviorWeights: this.behaviors.map(b => ({
        name:   b.name,
        weight: Math.round(b.weight * 10) / 10
      }))
    };
  }
}

module.exports = {
  Farmer,
  FarmerBehavior,
  SleepBehavior,
  EatBehavior,
  KillPestBehavior,
  HarvestCropBehavior,
  WaterCropBehavior,
  PlantCropBehavior,
  HarvestAnimalBehavior,
  FeedAnimalBehavior,
  BuyAnimalBehavior,
  HireFireFarmerBehavior,
  WanderBehavior
};

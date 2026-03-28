'use strict';

// ============================================================
//  决策层配置 - 统一管理行为优先级、紧急度阈值等
// ============================================================
const DECISION_CONFIG = {
  // 行为层次优先级（数值越大越优先处理）
  priorityLevels: {
    CRITICAL: 100,   // 危急：死亡风险、严重损失
    URGENT:    80,   // 紧急：即将发生的损失
    HIGH:      60,   // 高优：收益机会、资源管理
    NORMAL:    40,   // 常规：日常任务
    LOW:       20,   // 低优：闲逛、休息
    IDLE:      10    // 空闲：兜底行为
  },

  // 紧急度阈值配置
  thresholds: {
    hunger: {
      critical: 90,  // 极度饥饿，必须立即进食
      urgent:   75,  // 非常饿，优先进食
      high:     50,  // 比较饿，考虑进食
    },
    animal: {
      hungerCritical: 85,  // 动物极度饥饿
      hungerUrgent:   70,   // 动物很饿
      hungerHigh:     50,   // 动物有点饿
    },
    crop: {
      ripeUrgent: 5,    // 成熟作物超过5株需尽快收获
      pestUrgent: 3,    // 害虫超过3只需立即处理
      dryUrgent:  10,   // 干旱地块超过10块
    },
    money: {
      low:      100,   // 资金紧张
      critical: 50     // 资金危急
    }
  },

  // 性格对行为权重的影响系数
  personalityModifiers: {
    '勤劳': {
      '收获作物': 1.5, '浇水': 1.3, '种植作物': 1.4,
      '喂养动物': 1.3, '巡视': 0.5
    },
    '节俭': {
      '吃东西': 0.6, '购买动物': 0.7, '购物': 0.6,
      '管理人手': 0.7, '投资黄金': 0.8 // 节俭的人更保守
    },
    '乐观': {
      '种植作物': 1.2, '购买动物': 1.3, '巡视': 1.3,
      '投资黄金': 1.3 // 乐观的人更愿意投资
    },
    '谨慎': {
      '消灭害虫': 1.5, '施肥': 1.4, '喂养动物': 1.3,
      '吃东西': 1.2, '投资黄金': 0.7 // 谨慎的人更保守
    },
    '健谈': {
      // 健谈主要影响聊天，不影响行为权重
    }
  },

  // 收益驱动的权重调整参数
  profitAdjustment: {
    learningRate: 0.6,    // 学习率
    maxMultiplier: 8,     // 最大倍数
    decayRate: 0.99       // 权重衰减（防止历史数据过度影响）
  }
};

// ============================================================
//  紧急度评估器 - 计算各行为的紧急程度
// ============================================================
class UrgencyEvaluator {
  constructor(game, farmer) {
    this.game = game;
    this.farmer = farmer;
  }

  /** 计算指定行为的紧急度分数 (0-100) */
  evaluate(behaviorName) {
    const evaluator = this._evaluators[behaviorName];
    if (!evaluator) return 0;
    return evaluator.call(this);
  }

  _evaluators = {
    '睡觉': () => {
      if (!this.farmer.isNightTime()) return 0;
      return DECISION_CONFIG.priorityLevels.CRITICAL;
    },

    '吃东西': () => {
      const hunger = this.farmer.hunger;
      const th = DECISION_CONFIG.thresholds.hunger;
      if (hunger >= th.critical) return DECISION_CONFIG.priorityLevels.CRITICAL;
      if (hunger >= th.urgent) return DECISION_CONFIG.priorityLevels.URGENT;
      if (hunger >= th.high) return DECISION_CONFIG.priorityLevels.HIGH;
      return 0;
    },

    '收获作物': () => {
      let ripeCount = 0;
      for (let y = 0; y < this.game.height; y++) {
        for (let x = 0; x < this.game.width; x++) {
          if (this.game.plots[y][x].growthStage >= 3) ripeCount++;
        }
      }
      if (ripeCount >= DECISION_CONFIG.thresholds.crop.ripeUrgent) {
        return DECISION_CONFIG.priorityLevels.URGENT;
      }
      if (ripeCount > 0) return DECISION_CONFIG.priorityLevels.HIGH;
      return 0;
    },

    '消灭害虫': () => {
      const pestCount = this.game.pests?.length || 0;
      if (pestCount >= DECISION_CONFIG.thresholds.crop.pestUrgent) {
        return DECISION_CONFIG.priorityLevels.URGENT;
      }
      if (pestCount > 0) return DECISION_CONFIG.priorityLevels.HIGH;
      return 0;
    },

    '浇水': () => {
      let dryCount = 0;
      for (let y = 0; y < this.game.height; y++) {
        for (let x = 0; x < this.game.width; x++) {
          const plot = this.game.plots[y][x];
          if (plot.crop && !plot.isWatered && plot.growthStage < 3) dryCount++;
        }
      }
      if (dryCount >= DECISION_CONFIG.thresholds.crop.dryUrgent) {
        return DECISION_CONFIG.priorityLevels.HIGH;
      }
      if (dryCount > 0) return DECISION_CONFIG.priorityLevels.NORMAL;
      return 0;
    },

    '喂养动物': () => {
      let hungryCount = 0, criticalCount = 0;
      const th = DECISION_CONFIG.thresholds.animal;
      for (const pen of this.game.animalPens || []) {
        if (!pen.animal) continue;
        const hunger = pen.hunger || 0;
        if (hunger >= th.hungerCritical) criticalCount++;
        else if (hunger >= th.hungerUrgent) hungryCount++;
      }
      if (criticalCount > 0) return DECISION_CONFIG.priorityLevels.URGENT;
      if (hungryCount > 0) return DECISION_CONFIG.priorityLevels.HIGH;
      return 0;
    },

    '收获动物产品': () => {
      const readyCount = this.game.animalPens?.filter(p => p.isReady).length || 0;
      if (readyCount > 0) return DECISION_CONFIG.priorityLevels.HIGH;
      return 0;
    },

    '施肥': () => {
      // 检查低肥力地块和有机肥库存
      let lowFertCount = 0;
      for (let y = 0; y < this.game.height; y++) {
        for (let x = 0; x < this.game.width; x++) {
          if (this.game.plots[y][x].fertility <= 30) lowFertCount++;
        }
      }
      if (lowFertCount > 5) return DECISION_CONFIG.priorityLevels.HIGH;
      if (lowFertCount > 0) return DECISION_CONFIG.priorityLevels.NORMAL;
      return 0;
    },

    '管理人手': () => {
      // 只有头号农夫负责管理
      if (this.game.farmers?.[0] !== this.farmer) return 0;
      const money = this.game.sharedMoney;
      const farmerCount = this.game.farmers?.length || 0;
      const th = DECISION_CONFIG.thresholds.money;

      if (money < th.critical && farmerCount > 1) {
        return DECISION_CONFIG.priorityLevels.URGENT; // 需解雇
      }
      if (money > 500 && farmerCount < 6) {
        return DECISION_CONFIG.priorityLevels.NORMAL; // 可雇人
      }
      return 0;
    },

    '投资黄金': () => {
      // 黄金投资机会评估
      const history = this.game.goldPriceHistory || [];
      if (history.length < 3) return 0;

      const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;
      const currentPrice = this.game.goldPrice;
      const priceRatio = currentPrice / avgPrice;

      // 金价大幅下跌 -> 高优先级买入机会
      if (priceRatio < 0.90 && this.game.sharedMoney > 500) {
        return DECISION_CONFIG.priorityLevels.HIGH;
      }
      // 金价大幅上涨 -> 高优先级卖出机会
      if (priceRatio > 1.10 && this.game.goldAmount > 1) {
        return DECISION_CONFIG.priorityLevels.HIGH;
      }
      // 普通波动
      if ((priceRatio < 0.95 && this.game.sharedMoney > 300) ||
          (priceRatio > 1.05 && this.game.goldAmount > 0.5)) {
        return DECISION_CONFIG.priorityLevels.NORMAL;
      }
      return 0;
    },

    '紧急变现': () => {
      const money = this.game.sharedMoney;
      const hunger = this.farmer.hunger;

      // 资金极低且饥饿 -> CRITICAL
      if (money < 20 && hunger >= 50) {
        return DECISION_CONFIG.priorityLevels.CRITICAL;
      }
      // 资金紧张且饥饿 -> URGENT
      if (money < 50 && hunger >= 60) {
        return DECISION_CONFIG.priorityLevels.URGENT;
      }
      // 金价高位获利 -> HIGH
      const history = this.game.goldPriceHistory || [];
      if (history.length >= 3 && this.game.goldAmount > 0.5) {
        const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;
        if (this.game.goldPrice > avgPrice * 1.08) {
          return DECISION_CONFIG.priorityLevels.HIGH;
        }
      }
      return 0;
    },

    '消灭野兽': () => {
      const wildAnimals = this.game.wildAnimals || [];
      if (wildAnimals.length === 0) return 0;

      // 有野兽靠近动物栏 -> URGENT
      const nearPens = wildAnimals.filter(w => w.nearPen);
      if (nearPens.length > 0) {
        return DECISION_CONFIG.priorityLevels.URGENT;
      }
      // 有野兽出现 -> HIGH
      if (wildAnimals.length >= 2) {
        return DECISION_CONFIG.priorityLevels.HIGH;
      }
      return DECISION_CONFIG.priorityLevels.NORMAL;
    },

    '出售老化动物': () => {
      // 检查老化动物数量
      const oldAnimals = this.game.animalPens?.filter(p => p.animal && p.currentStage === 'old') || [];
      if (oldAnimals.length === 0) return 0;

      // 老化动物越多越紧急（占用栏位且产量低）
      if (oldAnimals.length >= 3) {
        return DECISION_CONFIG.priorityLevels.HIGH;
      }
      if (oldAnimals.length >= 1) {
        // 有空栏位时不那么紧急，没有空栏位时较紧急
        const emptyPens = this.game.animalPens?.filter(p => !p.animal).length || 0;
        if (emptyPens === 0) {
          return DECISION_CONFIG.priorityLevels.HIGH; // 没有空位，需要腾空间
        }
        return DECISION_CONFIG.priorityLevels.NORMAL;
      }
      return 0;
    }
  };
}

// ============================================================
//  农夫行为基类
//  扩展方式：继承 FarmerBehavior，调用 FarmerBehavior.register()
// ============================================================
class FarmerBehavior {
  /**
   * @param {string} name       唯一名称
   * @param {string} emoji      日志 emoji
   * @param {number} baseWeight 基础权重
   * @param {string} priority   优先级层次 (CRITICAL/URGENT/HIGH/NORMAL/LOW/IDLE)
   * @param {string[]} tags     行为标签（用于分类）
   */
  constructor(name, emoji, baseWeight, priority = 'NORMAL', tags = []) {
    this.name       = name;
    this.emoji      = emoji;
    this.baseWeight = baseWeight;
    this.priority   = priority;
    this.priorityValue = DECISION_CONFIG.priorityLevels[priority] || DECISION_CONFIG.priorityLevels.NORMAL;
    this.tags       = tags;
    this.weight     = baseWeight;

    // 收益追踪（用于动态调权）
    this._earnedTotal = 0;
    this._callCount   = 0;
    this._lastExecuteTime = 0;
  }

  /** 执行后记录收益，重新计算动态权重 */
  recordProfit(earned = 0) {
    if (earned <= 0) return;
    this._earnedTotal += earned;
    this._callCount   += 1;
    const cfg = DECISION_CONFIG.profitAdjustment;
    const avgEarned = this._earnedTotal / this._callCount;
    this.weight = Math.min(
      this.baseWeight + avgEarned * cfg.learningRate,
      this.baseWeight * cfg.maxMultiplier
    );
    this._lastExecuteTime = Date.now();
  }

  /** 权重衰减（定期调用） */
  decayWeight() {
    const cfg = DECISION_CONFIG.profitAdjustment;
    this.weight = Math.max(
      this.baseWeight,
      this.weight * cfg.decayRate
    );
  }

  /** 获取考虑性格和玩家建议的调整后权重 */
  getAdjustedWeight(personality, farmer = null) {
    let adjustedWeight = this.weight;

    // 应用性格修正
    for (const [trait, modifiers] of Object.entries(DECISION_CONFIG.personalityModifiers)) {
      const traitValue = personality[trait] || 0.5;
      const modifier = modifiers[this.name];
      if (modifier) {
        // 性格值越高，修正效果越强
        const traitEffect = (traitValue - 0.5) * 2; // -1 到 1
        adjustedWeight *= (1 + (modifier - 1) * Math.abs(traitEffect));
      }
    }

    // 应用玩家建议权重调整
    if (farmer && farmer.getSuggestionMultiplier) {
      const suggestionMultiplier = farmer.getSuggestionMultiplier(this.name);
      adjustedWeight *= suggestionMultiplier;
    }

    return adjustedWeight;
  }

  // ---------- 子类实现 ----------

  canExecute(farmer, game) { return false; }
  getTarget(farmer, game)  { return null; }
  execute(farmer, game)    { return { log: '', acted: false, earned: 0 }; }

  // ---------- 静态注册表 ----------

  static registry = new Map();
  static registryOrder = []; // 保持注册顺序

  static register(BehaviorClass) {
    const instance = new BehaviorClass();
    FarmerBehavior.registry.set(instance.name, BehaviorClass);
    FarmerBehavior.registryOrder.push(instance.name);
  }

  /** 获取按优先级排序的行为列表 */
  static getSortedBehaviors() {
    return FarmerBehavior.registryOrder.map(name => FarmerBehavior.registry.get(name));
  }
}

// ============================================================
//  内置行为 - 危急层 (CRITICAL)
// ============================================================

/** 夜间睡觉（UTC+8 22:00–06:00） */
class SleepBehavior extends FarmerBehavior {
  constructor() { super('睡觉', '💤', 1, 'CRITICAL', ['生存', '夜间']); }
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
  constructor() { super('吃东西', '🍽️', 20, 'CRITICAL', ['生存', '消费']); }

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

/** 💰 紧急变现（没钱时卖黄金/动物换现金） */
class EmergencyLiquidateBehavior extends FarmerBehavior {
  constructor() { super('紧急变现', '💰', 25, 'CRITICAL', ['生存', '金融']); }

  canExecute(farmer, game) {
    // 条件1：资金紧张且饥饿
    if (game.sharedMoney < 30 && farmer.hunger >= 50) {
      // 检查是否有可变现资产
      if (game.goldAmount > 0.1) return true; // 有黄金
      const hasSellableAnimal = game.animalPens.some(p => p.animal);
      if (hasSellableAnimal) return true;
    }
    // 条件2：资金极低需要运营
    if (game.sharedMoney < 20) {
      if (game.goldAmount > 0.1) return true;
      const hasSellableAnimal = game.animalPens.some(p => p.animal);
      if (hasSellableAnimal) return true;
    }
    // 条件3：金价高位时获利了结（灵活策略）
    const history = game.goldPriceHistory || [];
    if (history.length >= 3 && game.goldAmount > 0.5) {
      const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;
      if (game.goldPrice > avgPrice * 1.08) return true; // 金价高于均价8%
    }
    return false;
  }

  getTarget() { return null; }

  execute(farmer, game) {
    // 优先卖黄金（流动性好）
    if (game.goldAmount > 0.1) {
      const history = game.goldPriceHistory || [];
      const avgPrice = history.length >= 3
        ? history.reduce((sum, h) => sum + h.price, 0) / history.length
        : game.goldPrice;

      // 根据紧急程度决定卖出量
      let sellRatio = 0.3;
      if (game.sharedMoney < 20) sellRatio = 0.5;
      if (farmer.hunger >= 70) sellRatio = 0.7;

      // 金价高位时多卖
      if (game.goldPrice > avgPrice * 1.08) sellRatio = Math.max(sellRatio, 0.4);

      const sellAmount = Math.min(game.goldAmount * sellRatio, game.goldAmount);
      if (sellAmount >= 0.1) {
        const result = game.sellGold(sellAmount);
        if (result.success) {
          farmer.state = 'idle';
          farmer.currentAction = '卖出了黄金救急';
          return {
            log: `${farmer.fullName} 紧急卖出 ${sellAmount.toFixed(2)}g 黄金 🥇 换取 ${result.revenue}💰`,
            acted: true,
            earned: result.revenue
          };
        }
      }
    }

    // 卖动物作为最后手段
    const sellablePen = game.animalPens.find(p => p.animal);
    if (sellablePen) {
      const animal = game.ANIMALS?.[sellablePen.animal];
      if (animal) {
        const sellPrice = Math.floor(animal.buyPrice * 0.6); // 6折出售
        const animalName = animal.name;
        const animalEmoji = animal.emoji;

        // 清空动物栏
        sellablePen.animal = null;
        sellablePen.hunger = 0;
        sellablePen.productReady = false;
        sellablePen.currentStage = 'adult';
        game.sharedMoney += sellPrice;

        farmer.state = 'idle';
        farmer.currentAction = '卖掉了动物';
        return {
          log: `${farmer.fullName} 忍痛卖掉了 ${animalEmoji}${animalName}，获得 ${sellPrice}💰`,
          acted: true,
          earned: sellPrice
        };
      }
    }

    return { log: '', acted: false, earned: 0 };
  }
}

// ============================================================
//  内置行为 - 紧急层 (URGENT)
// ============================================================

/** 消灭害虫 */
class KillPestBehavior extends FarmerBehavior {
  constructor() { super('消灭害虫', '🧴', 15, 'URGENT', ['作物保护', '战斗']); }

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

/** 🌽 喂养饥饿的动物 */
class FeedAnimalBehavior extends FarmerBehavior {
  constructor() { super('喂养动物', '🌽', 9, 'URGENT', ['动物', '消费']); }

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

/** 🔫 消灭野生动物（保护农场动物） */
class HuntWildAnimalBehavior extends FarmerBehavior {
  constructor() { super('消灭野兽', '🔫', 18, 'URGENT', ['动物保护', '战斗']); }

  canExecute(farmer, game) {
    const wildAnimals = game.wildAnimals || [];
    return wildAnimals.length > 0 && (farmer.items.weapon || 0) > 0;
  }

  getTarget(farmer, game) {
    const wildAnimals = game.wildAnimals || [];
    if (wildAnimals.length === 0) return null;

    // 优先找靠近动物栏的野兽
    let best = null, minDist = Infinity;
    for (const w of wildAnimals) {
      const d = Math.abs(w.x - farmer.x) + Math.abs(w.y - farmer.y);
      if (d < minDist) {
        minDist = d;
        best = w;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  execute(farmer, game) {
    const wildAnimals = game.wildAnimals || [];
    if (wildAnimals.length === 0 || (farmer.items.weapon || 0) <= 0) {
      return { log: '', acted: false, earned: 0 };
    }

    // 找当前位置或最近的野兽
    let target = wildAnimals.find(w => w.x === farmer.x && w.y === farmer.y);
    if (!target) {
      target = wildAnimals.reduce((nearest, w) => {
        const d = Math.abs(w.x - farmer.x) + Math.abs(w.y - farmer.y);
        if (!nearest || d < nearest.dist) {
          return { ...w, dist: d };
        }
        return nearest;
      }, null);
    }

    if (!target) return { log: '', acted: false, earned: 0 };

    // 使用武器攻击
    farmer.items.weapon--;
    if (farmer.items.weapon <= 0) delete farmer.items.weapon;

    // 从游戏中移除野兽
    const idx = game.wildAnimals.findIndex(w => w.id === target.id);
    if (idx >= 0) {
      game.wildAnimals.splice(idx, 1);
    }

    const WILD_NAMES = {
      wolf: '🐺狼',
      fox: '🦊狐狸',
      eagle: '🦅老鹰',
      snake: '🐍蛇'
    };
    const label = WILD_NAMES[target.type] || '野兽';

    farmer.state = 'working';
    farmer.emoji = '🧑‍🌾';
    farmer.currentAction = `消灭了 ${label}`;

    // 击败野兽有奖励
    const bounty = { wolf: 30, fox: 20, eagle: 25, snake: 15 }[target.type] || 10;
    game.sharedMoney += bounty;

    return {
      log: `${farmer.fullName} 用武器消灭了 ${label}！获得赏金 ${bounty}💰`,
      acted: true,
      earned: bounty
    };
  }
}

// ============================================================
//  内置行为 - 高优层 (HIGH)
// ============================================================

/** 收获成熟作物 */
class HarvestCropBehavior extends FarmerBehavior {
  constructor() { super('收获作物', '🧺', 12, 'HIGH', ['作物', '收益']); }

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

/** 收获动物产品 */
class HarvestAnimalBehavior extends FarmerBehavior {
  constructor() { super('收获动物产品', '🐾', 12, 'HIGH', ['动物', '收益']); }

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

/** 给未浇水作物浇水 */
class WaterCropBehavior extends FarmerBehavior {
  constructor() { super('浇水', '💧', 8, 'HIGH', ['作物']); }

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

// ============================================================
//  内置行为 - 常规层 (NORMAL)
// ============================================================

/** 在空地上种植种子 */
class PlantCropBehavior extends FarmerBehavior {
  constructor() { super('种植作物', '🌱', 6, 'NORMAL', ['作物']); }

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
    let best = null, bestScore = -Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (!plot.crop && plot.fertility > 0) { // 只考虑有肥力的地块
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          // 评分：肥力高优先，距离近次之
          const score = (plot.fertility || 100) * 10 - d;
          if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
      }
    }
    return best;
  }
}

/** 购买动物 */
class BuyAnimalBehavior extends FarmerBehavior {
  constructor() {
    super('购买动物', '🛒', 4, 'NORMAL', ['动物', '消费', '投资']);
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

/** 🔄 出售老化动物行为 */
class SellOldAnimalBehavior extends FarmerBehavior {
  constructor() { super('出售老化动物', '🔄', 6, 'HIGH', ['动物', '资源管理']); }

  canExecute(farmer, game) {
    // 检查是否有老化动物
    return game.animalPens.some(p => p.animal && p.currentStage === 'old');
  }

  getTarget(farmer, game) {
    // 找最近的老化动物位置
    let nearest = null, minDist = Infinity;
    for (let i = 0; i < game.animalPens.length; i++) {
      const pen = game.animalPens[i];
      if (pen.animal && pen.currentStage === 'old') {
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
    // 找一个老化的动物出售
    for (let i = 0; i < game.animalPens.length; i++) {
      const pen = game.animalPens[i];
      if (!pen.animal || pen.currentStage !== 'old') continue;

      // 检查动物位置
      const pos = game.animalPositions?.[i];
      if (pos) {
        const dist = Math.abs(farmer.x - pos.x) + Math.abs(farmer.y - pos.y);
        if (dist > 2) continue; // 跳过太远的动物
      }

      // 出售这只老化动物
      const animal = game.ANIMALS?.[pen.animal];
      const result = pen.sell();

      if (result.success) {
        const oldReward = result.reward;
        game.sharedMoney += oldReward;

        farmer.state = 'working';
        farmer.currentAction = '卖掉了老化动物';

        return {
          log: `${farmer.fullName} 卖掉了老化的 ${animal.emoji}${animal.name}（老化后售价${oldReward}💰），为农场腾出空间 🔄`,
          acted: true,
          earned: oldReward
        };
      }
    }

    return { log: '', acted: false, earned: 0 };
  }
}

/** 👥 头号农夫管理人手（雇佣/解雇） */
class HireFireFarmerBehavior extends FarmerBehavior {
  constructor() { super('管理人手', '👥', 2, 'NORMAL', ['管理', '人力资源']); }

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

/** 🧪 施肥行为 - 对低肥力地块使用有机肥 */
class FertilizeBehavior extends FarmerBehavior {
  constructor() { super('施肥', '🧪', 7, 'NORMAL', ['作物', '资源管理']); }

  canExecute(farmer, game) {
    // 检查是否有有机肥和低肥力地块
    if ((game.organicFertilizer || 0) <= 0) return false;

    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (game.plots[y][x].fertility <= 30) return true;
      }
    }
    return false;
  }

  getTarget(farmer, game) {
    // 找最近的低肥力地块
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.fertility <= 30) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
      }
    }
    return best;
  }

  execute(farmer, game) {
    const t = this.getTarget(farmer, game);
    if (!t || (game.organicFertilizer || 0) <= 0) {
      return { log: '', acted: false, earned: 0 };
    }

    const plot = game.plots[t.y]?.[t.x];
    if (!plot || plot.fertility > 30) {
      return { log: '', acted: false, earned: 0 };
    }

    // 使用有机肥
    const oldFert = plot.fertility;
    plot.fertility = Math.min(100, plot.fertility + 50);
    game.organicFertilizer--;

    farmer.state = 'working';
    farmer.emoji = '🧑‍🌾';
    farmer.currentAction = '施了有机肥';

    return {
      log: `${farmer.fullName} 在 (${t.x},${t.y}) 施用了有机肥，肥力 ${Math.round(oldFert)}→${Math.round(plot.fertility)} 🧪`,
      acted: true,
      earned: 0
    };
  }
}

/** 🛒 购买种子行为 */
class BuySeedsBehavior extends FarmerBehavior {
  constructor() { super('购买种子', '🛒', 5, 'NORMAL', ['购物', '资源管理']); }

  canExecute(farmer, game) {
    // 种子库存不足且有钱
    const totalSeeds = Object.values(farmer.seeds).reduce((a, b) => a + b, 0);
    return totalSeeds < 10 && game.sharedMoney >= 50;
  }

  getTarget() { return null; }

  execute(farmer, game) {
    const SEED_PRICES = { wheat: 2, carrot: 3, rice: 8, tomato: 5 };
    const CROP_NAMES = { wheat: '小麦', carrot: '胡萝卜', rice: '水稻', tomato: '番茄' };

    // 统计当前作物（多样性优先）
    const cropCounts = {};
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const crop = game.plots[y][x].crop;
        if (crop) cropCounts[crop] = (cropCounts[crop] || 0) + 1;
      }
    }

    // 优先买种植少的种子
    const cropTypes = Object.keys(SEED_PRICES).sort((a, b) => {
      return (cropCounts[a] || 0) - (cropCounts[b] || 0);
    });

    let bought = 0, cost = 0;
    const boughtItems = [];

    for (const crop of cropTypes) {
      const price = SEED_PRICES[crop];
      const buyCost = price * 5;

      if ((farmer.seeds[crop] || 0) < 5 && game.sharedMoney >= buyCost + 30) {
        farmer.seeds[crop] = (farmer.seeds[crop] || 0) + 5;
        game.sharedMoney -= buyCost;
        bought++;
        cost += buyCost;
        boughtItems.push(`${CROP_NAMES[crop]}x5`);
      }
    }

    if (!bought) return { log: '', acted: false, earned: 0 };

    farmer.state = 'idle';
    farmer.currentAction = '买了种子';
    return {
      log: `${farmer.fullName} 购买了 ${boughtItems.join('、')}（-${cost}💰）`,
      acted: true,
      earned: 0
    };
  }
}

/** 🧴 购买杀虫剂行为 */
class BuyPesticideBehavior extends FarmerBehavior {
  constructor() { super('购买杀虫剂', '🧴', 4, 'NORMAL', ['购物', '战斗准备']); }

  canExecute(farmer, game) {
    return (farmer.items.pesticide || 0) < 2 && game.sharedMoney >= 50;
  }

  getTarget() { return null; }

  execute(farmer, game) {
    const cost = 40;
    if (game.sharedMoney < cost) return { log: '', acted: false, earned: 0 };

    farmer.items.pesticide = (farmer.items.pesticide || 0) + 2;
    game.sharedMoney -= cost;

    farmer.state = 'idle';
    farmer.currentAction = '买了杀虫剂';
    return {
      log: `${farmer.fullName} 购买了杀虫剂x2（-40💰）`,
      acted: true,
      earned: 0
    };
  }
}

/** 🔫 购买武器行为 */
class BuyWeaponBehavior extends FarmerBehavior {
  constructor() { super('购买武器', '🔫', 5, 'NORMAL', ['购物', '战斗准备']); }

  canExecute(farmer, game) {
    // 武器库存不足且有钱，或者有野生动物威胁时优先进货
    const weaponUses = (farmer.items.weapon || 0);
    const wildAnimals = game.wildAnimals || [];
    const hasThreat = wildAnimals.length > 0;

    // 有威胁但没武器 -> 紧急购买
    if (hasThreat && weaponUses === 0 && game.sharedMoney >= 60) return true;
    // 常规补货（保持至少3次使用机会）
    if (weaponUses < 3 && game.sharedMoney >= 100) return true;
    return false;
  }

  getTarget() { return null; }

  execute(farmer, game) {
    const cost = 50;  // 武器价格
    const uses = 5;   // 每把武器可使用5次
    if (game.sharedMoney < cost) return { log: '', acted: false, earned: 0 };

    farmer.items.weapon = (farmer.items.weapon || 0) + uses;
    game.sharedMoney -= cost;

    farmer.state = 'idle';
    farmer.currentAction = '买了武器';
    return {
      log: `${farmer.fullName} 购买了猎枪🔫（-50💰），可使用${uses}次，可以对付野生动物了`,
      acted: true,
      earned: 0
    };
  }
}

/** 🥇 投资黄金行为 */
class InvestGoldBehavior extends FarmerBehavior {
  constructor() {
    super('投资黄金', '🥇', 3, 'NORMAL', ['投资', '金融']);
    this._cooldown = 0;
  }

  canExecute(farmer, game) {
    // 冷却检查（每5分钟最多操作一次）
    if (Date.now() < this._cooldown) return false;

    // 需要有金价历史数据
    const history = game.goldPriceHistory || [];
    if (history.length < 3) return false;

    // 检查是否有交易机会
    const decision = this._analyzeMarket(farmer, game);
    return decision !== null;
  }

  getTarget() { return null; } // 原地操作

  execute(farmer, game) {
    const decision = this._analyzeMarket(farmer, game);
    if (!decision) return { log: '', acted: false, earned: 0 };

    let log = '';
    let earned = 0;

    if (decision.action === 'buy') {
      // 买入黄金
      const result = game.buyGold(decision.amount);
      if (result.success) {
        log = `${farmer.fullName} ${decision.reason}：买入 ${decision.amount.toFixed(2)}g 黄金 🥇（-${result.cost}💰）`;
        farmer.state = 'idle';
        farmer.currentAction = '投资了黄金';
      } else {
        return { log: '', acted: false, earned: 0 };
      }
    } else if (decision.action === 'sell') {
      // 卖出黄金
      const result = game.sellGold(decision.amount);
      if (result.success) {
        earned = result.revenue;
        log = `${farmer.fullName} ${decision.reason}：卖出 ${decision.amount.toFixed(2)}g 黄金 🥇（+${result.revenue}💰）`;
        farmer.state = 'idle';
        farmer.currentAction = '卖出了黄金';
      } else {
        return { log: '', acted: false, earned: 0 };
      }
    }

    this._cooldown = Date.now() + 300000; // 5分钟冷却
    return { log, acted: true, earned };
  }

  _analyzeMarket(farmer, game) {
    const history = game.goldPriceHistory || [];
    if (history.length < 3) return null;

    // 计算移动平均
    const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;
    const currentPrice = game.goldPrice;
    const priceRatio = currentPrice / avgPrice;

    // 获取性格影响（谨慎值影响投资决策）
    const cautiousness = farmer.personality?.['谨慎'] || 0.5;
    const threshold = 0.95 + (1 - cautiousness) * 0.05; // 谨慎的人需要更大的折扣才买入

    // 策略1：金价低于均价，逢低买入
    if (priceRatio < threshold && game.sharedMoney > 300) {
      // 计算买入量：根据性格和资金
      const investRatio = 0.2 + (1 - cautiousness) * 0.1; // 投资20%-30%资金
      const buyAmount = Math.min(
        (game.sharedMoney * investRatio) / currentPrice,
        10 // 最多买10克
      );
      if (buyAmount >= 0.1) {
        return { action: 'buy', amount: buyAmount, reason: '金价走低，逢低买入' };
      }
    }

    // 策略2：金价高于均价，逢高卖出
    if (priceRatio > 1.05 && game.goldAmount > 0.5) {
      // 计算卖出量：根据性格
      const sellRatio = 0.3 + cautiousness * 0.2; // 卖出30%-50%
      const sellAmount = Math.min(
        game.goldAmount * sellRatio,
        game.goldAmount * 0.5 // 最多卖一半
      );
      if (sellAmount >= 0.1) {
        return { action: 'sell', amount: sellAmount, reason: '金价走高，逢高卖出' };
      }
    }

    return null;
  }
}

// ============================================================
//  内置行为 - 低优/空闲层 (LOW/IDLE)
// ============================================================

/** 巡视/闲逛（兜底行为） */
class WanderBehavior extends FarmerBehavior {
  constructor() { super('巡视', '🚶', 1, 'IDLE', ['探索']); }
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

// ——— 注册所有默认行为（按优先级顺序）———
// CRITICAL
FarmerBehavior.register(SleepBehavior);
FarmerBehavior.register(EatBehavior);
FarmerBehavior.register(EmergencyLiquidateBehavior);
// URGENT
FarmerBehavior.register(KillPestBehavior);
FarmerBehavior.register(FeedAnimalBehavior);
FarmerBehavior.register(HuntWildAnimalBehavior);
// HIGH
FarmerBehavior.register(HarvestCropBehavior);
FarmerBehavior.register(HarvestAnimalBehavior);
FarmerBehavior.register(WaterCropBehavior);
FarmerBehavior.register(SellOldAnimalBehavior);
// NORMAL
FarmerBehavior.register(PlantCropBehavior);
FarmerBehavior.register(BuyAnimalBehavior);
FarmerBehavior.register(HireFireFarmerBehavior);
FarmerBehavior.register(FertilizeBehavior);
FarmerBehavior.register(BuySeedsBehavior);
FarmerBehavior.register(BuyPesticideBehavior);
FarmerBehavior.register(BuyWeaponBehavior);
FarmerBehavior.register(InvestGoldBehavior);
// IDLE
FarmerBehavior.register(WanderBehavior);

// ============================================================
//  目标规划系统
// ============================================================
class GoalPlanner {
  constructor(farmer) {
    this.farmer = farmer;
    this.currentGoal = null;        // 当前目标
    this.weeklyTarget = 1000;       // 周目标：赚1000金币
    this.earnedThisWeek = 0;        // 本周已赚
    this.strategyPlan = [];         // 策略计划
    this.lastPlanTime = 0;          // 上次规划时间
    this.planInterval = 600000;     // 10分钟重新规划一次
  }

  /** 更新收益记录 */
  recordEarning(amount) {
    this.earnedThisWeek += amount;
  }

  /** 深度思考：制定赚钱策略 */
  makePlan(game) {
    const now = Date.now();
    if (now - this.lastPlanTime < this.planInterval) return null;

    this.lastPlanTime = now;
    const thoughts = [];

    // 1. 分析当前财务状况
    const money = game.sharedMoney || 0;
    const goldAmount = game.goldAmount || 0;
    const goldPrice = game.currentGoldPrice || 500;

    thoughts.push(`💰 当前金币: ${Math.floor(money)}, 黄金: ${goldAmount.toFixed(2)}克`);

    // 2. 计算收入差距
    const gap = this.weeklyTarget - this.earnedThisWeek;
    thoughts.push(`🎯 本周目标: ${this.weeklyTarget}, 已赚: ${Math.floor(this.earnedThisWeek)}, 差距: ${Math.floor(gap)}`);

    // 3. 分析最赚钱的行为
    const profitableActions = this._analyzeProfitableActions(game);
    thoughts.push(`📈 最赚钱行为: ${profitableActions.slice(0, 3).map(a => a.name).join(', ')}`);

    // 4. 制定策略
    this.strategyPlan = [];

    if (gap > 0) {
      // 有差距，需要更积极的策略
      if (profitableActions.length > 0) {
        const topAction = profitableActions[0];
        this.strategyPlan.push({
          action: topAction.name,
          reason: `收益最高(${Math.floor(topAction.avgProfit)}金币/次)`,
          priority: 'high',
          weightBonus: 5
        });
      }

      // 检查黄金投资机会
      const goldAdvice = this._analyzeGoldInvestment(game);
      if (goldAdvice) {
        this.strategyPlan.push(goldAdvice);
      }

      // 检查作物多样性收益
      const diversityBonus = game.getCropDiversityBonus?.() || 1;
      if (diversityBonus < 1.3) {
        this.strategyPlan.push({
          action: '种植作物',
          reason: `提高多样性收益(当前${(diversityBonus * 100).toFixed(0)}%)`,
          priority: 'medium',
          weightBonus: 3
        });
      }
    }

    // 5. 生成思考日志
    const thinking = thoughts.join('\n');
    console.log(`[GoalPlanner] ${this.farmer.fullName} 深度思考:\n${thinking}`);

    return {
      thinking,
      plan: this.strategyPlan,
      profitableActions
    };
  }

  /** 分析最赚钱的行为 */
  _analyzeProfitableActions(game) {
    const actions = [];

    for (const behavior of this.farmer.behaviors) {
      if (behavior._earnedTotal > 0 && behavior._callCount > 0) {
        actions.push({
          name: behavior.name,
          totalProfit: behavior._earnedTotal,
          callCount: behavior._callCount,
          avgProfit: behavior._earnedTotal / behavior._callCount
        });
      }
    }

    return actions.sort((a, b) => b.avgProfit - a.avgProfit);
  }

  /** 分析黄金投资机会 */
  _analyzeGoldInvestment(game) {
    const history = game.goldPriceHistory || [];
    if (history.length < 3) return null;

    const currentPrice = game.currentGoldPrice || 500;
    const avgPrice = history.reduce((s, h) => s + h.price, 0) / history.length;
    const ratio = currentPrice / avgPrice;

    if (ratio < 0.95 && game.sharedMoney > 200) {
      return {
        action: '投资黄金',
        reason: `金价低于均价(${(ratio * 100).toFixed(0)}%)，逢低买入`,
        priority: 'medium',
        weightBonus: 4
      };
    }
    if (ratio > 1.1 && game.goldAmount > 0.5) {
      return {
        action: '投资黄金',
        reason: `金价高于均价(${(ratio * 100).toFixed(0)}%)，逢高卖出`,
        priority: 'high',
        weightBonus: 6
      };
    }
    return null;
  }

  /** 获取当前策略对行为的权重加成 */
  getWeightBonus(behaviorName) {
    for (const plan of this.strategyPlan) {
      if (plan.action === behaviorName) {
        return plan.weightBonus || 0;
      }
    }
    return 0;
  }

  /** 获取策略描述 */
  getPlanDescription() {
    if (this.strategyPlan.length === 0) return '暂无特殊计划';
    return this.strategyPlan.map(p => `${p.action}(${p.reason})`).join('; ');
  }
}

// ============================================================
//  教训学习系统
// ============================================================
class LessonLearner {
  constructor(farmer) {
    this.farmer = farmer;
    this.lessons = [];           // 教训记录
    this.maxLessons = 20;        // 最多保留20条
    this.failureStats = {};      // 失败统计
  }

  /** 记录失败/教训 */
  recordFailure(type, details) {
    const lesson = {
      type,
      details,
      time: Date.now(),
      count: 1
    };

    // 检查是否有类似教训
    const existing = this.lessons.find(l =>
      l.type === type && JSON.stringify(l.details) === JSON.stringify(details)
    );

    if (existing) {
      existing.count++;
      existing.lastTime = Date.now();
    } else {
      lesson.lastTime = Date.now();
      this.lessons.push(lesson);

      if (this.lessons.length > this.maxLessons) {
        this.lessons.shift();
      }
    }

    // 更新失败统计
    this.failureStats[type] = (this.failureStats[type] || 0) + 1;

    // 生成思考
    const thought = this._generateThought(lesson);
    console.log(`[LessonLearner] ${this.farmer.fullName} 吸取教训: ${thought}`);

    return thought;
  }

  /** 根据教训生成决策建议 */
  getAdvice() {
    const advice = [];

    // 分析失败模式
    const sortedFailures = Object.entries(this.failureStats)
      .sort((a, b) => b[1] - a[1]);

    for (const [type, count] of sortedFailures.slice(0, 3)) {
      switch (type) {
        case 'crop_died':
          if (count >= 2) {
            advice.push({ action: '浇水', bonus: 3, reason: '曾有作物枯死，需更勤浇水' });
            advice.push({ action: '施肥', bonus: 2, reason: '施肥可加速收获，减少风险' });
          }
          break;
        case 'pest_damage':
          if (count >= 2) {
            advice.push({ action: '消灭害虫', bonus: 4, reason: '害虫问题频发，需优先处理' });
            advice.push({ action: '购买杀虫剂', bonus: 2, reason: '备足杀虫剂' });
          }
          break;
        case 'animal_starved':
          advice.push({ action: '喂养动物', bonus: 5, reason: '曾有动物饿死，需优先喂养' });
          break;
        case 'gold_loss':
          advice.push({ action: '投资黄金', bonus: -3, reason: '黄金投资亏损，暂时观望' });
          break;
        case 'disaster_damage':
          advice.push({ action: '收获作物', bonus: 3, reason: '灾害频发，及时收获减少损失' });
          break;
      }
    }

    return advice;
  }

  /** 生成教训思考 */
  _generateThought(lesson) {
    const templates = {
      crop_died: `作物枯死了，下次要更勤快浇水！`,
      pest_damage: `害虫又破坏了作物，得加强防治！`,
      animal_starved: `动物饿死了好心疼，要记得按时喂养！`,
      gold_loss: `黄金投资亏了，得更谨慎看准时机！`,
      disaster_damage: `灾害天气损失惨重，要关注天气预报！`,
      missed_harvest: `成熟作物没收，下次要及时收获！`
    };
    return templates[lesson.type] || `记住了：${lesson.type}`;
  }

  /** 获取最近教训摘要 */
  getRecentLessons(count = 5) {
    return this.lessons
      .sort((a, b) => b.lastTime - a.lastTime)
      .slice(0, count)
      .map(l => `${l.type}(${l.count}次)`);
  }
}

// ============================================================
//  决策引擎 - 核心决策逻辑
// ============================================================
class DecisionEngine {
  constructor(farmer, game) {
    this.farmer = farmer;
    this.game = game;
    this.urgencyEvaluator = new UrgencyEvaluator(game, farmer);
  }

  /**
   * 选择最佳行为
   * 算法：紧急度优先 + 加权随机
   * 1. 计算所有可执行行为的紧急度
   * 2. 如果有 CRITICAL 级别的紧急行为，直接返回
   * 3. 否则按紧急度加权随机选择
   */
  selectBehavior() {
    const eligible = this.farmer.behaviors.filter(b => b.canExecute(this.farmer, this.game));
    if (!eligible.length) return null;

    // 计算每个行为的综合分数
    const scored = eligible.map(b => {
      const urgency = this.urgencyEvaluator.evaluate(b.name);
      const adjustedWeight = b.getAdjustedWeight(this.farmer.personality, this.farmer);
      const priorityValue = b.priorityValue;

      // 获取目标规划的权重加成
      const goalBonus = this.farmer.goalPlanner.getWeightBonus(b.name);

      // 获取教训建议的权重加成
      const lessonAdvice = this.farmer.lessonLearner.getAdvice();
      let lessonBonus = 0;
      for (const advice of lessonAdvice) {
        if (advice.action === b.name) {
          lessonBonus = advice.bonus;
          break;
        }
      }

      // 综合分数 = 紧急度 + 优先级基数 + 权重 + 目标加成 + 教训加成
      // 紧急度和优先级是硬性因素，权重是软性调节
      const score = {
        behavior: b,
        urgency,
        priority: priorityValue,
        weight: adjustedWeight,
        goalBonus,
        lessonBonus,
        total: urgency * 2 + priorityValue + adjustedWeight + goalBonus + lessonBonus
      };
      return score;
    });

    // 按紧急度排序，找出最高紧急度
    scored.sort((a, b) => b.urgency - a.urgency);
    const maxUrgency = scored[0].urgency;

    // 如果有 CRITICAL 级别紧急度（>=100），直接返回
    if (maxUrgency >= DECISION_CONFIG.priorityLevels.CRITICAL) {
      // 在所有 CRITICAL 行为中选择权重最高的
      const critical = scored.filter(s => s.urgency >= DECISION_CONFIG.priorityLevels.CRITICAL);
      critical.sort((a, b) => b.total - a.total);
      return critical[0].behavior;
    }

    // URGENT 级别：优先处理但允许一定随机性
    if (maxUrgency >= DECISION_CONFIG.priorityLevels.URGENT) {
      const urgent = scored.filter(s => s.urgency >= DECISION_CONFIG.priorityLevels.URGENT);
      // 70% 概率选择最高分，30% 加权随机
      if (Math.random() < 0.7) {
        urgent.sort((a, b) => b.total - a.total);
        return urgent[0].behavior;
      }
      // 加权随机
      return this._weightedRandom(urgent);
    }

    // 普通情况：加权随机
    return this._weightedRandom(scored);
  }

  _weightedRandom(scored) {
    const total = scored.reduce((s, item) => s + item.total, 0);
    let rand = Math.random() * total;
    for (const item of scored) {
      rand -= item.total;
      if (rand <= 0) return item.behavior;
    }
    return scored[scored.length - 1].behavior;
  }

  /** 获取决策调试信息 */
  getDebugInfo() {
    const eligible = this.farmer.behaviors.filter(b => b.canExecute(this.farmer, this.game));
    return eligible.map(b => ({
      name: b.name,
      priority: b.priority,
      urgency: this.urgencyEvaluator.evaluate(b.name),
      weight: Math.round(b.weight * 10) / 10,
      adjustedWeight: Math.round(b.getAdjustedWeight(this.farmer.personality, this.farmer) * 10) / 10,
      suggestionMultiplier: this.farmer.getSuggestionMultiplier(b.name)
    }));
  }
}

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

    // ====== 玩家建议权重调整 ======
    // 存储玩家通过聊天给出的建议，会临时调整行为权重
    this.suggestionWeights = options.suggestionWeights || {}; // { '收获作物': { multiplier: 1.5, expiresAt: timestamp } }
    this.suggestionDuration = 300000; // 建议持续5分钟

    // 从注册表实例化所有行为
    this.behaviors = Array.from(FarmerBehavior.registry.values()).map(Cls => new Cls());

    // ====== 决策引擎 ======
    this.decisionEngine = new DecisionEngine(this, game);

    // ====== 目标规划系统 ======
    this.goalPlanner = new GoalPlanner(this);

    // ====== 教训学习系统 ======
    this.lessonLearner = new LessonLearner(this);

    // ====== 策略同步 ======
    this._lastStrategyVersion = 0; // 用于追踪已应用的策略版本

    this.tickIntervalMs = options.tickInterval || 5000;   // 决策间隔：5秒
    this.moveIntervalMs = options.moveInterval || 2000;   // 移动间隔：2秒（和服务端同步频率一致）

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

      // 如果所有农夫都死亡，自动创建新农夫并重置金币
      if (this.game.farmers.length === 0) {
        this.game.sharedMoney = 1000; // 重置金币
        const FarmerClass = this.constructor;
        const newFarmer = new FarmerClass(this.game, (msg, emoji, type) => this.game.addFarmLog(msg, emoji, type), {
          name: '阿明',
          hunger: 0,
          startDelay: 3000
        });
        this.game.farmers.push(newFarmer);
        this.game.addFarmLog(`🎉 所有农夫饿死后，农场自动雇佣了新农夫阿明，并注入1000启动资金！`, '🌟', 'system');
      }
    }
  }

  // ---------- LLM 预留接口 ----------

  async thinkWithAI() {
    // 检查是否是头号农夫（只有头号农夫应该深度思考）
    const isLeadFarmer = this.game.farmers?.[0] === this;
    if (!isLeadFarmer) {
      // 非头号农夫，检查是否有共享策略需要应用
      const strategy = this.game.getSharedStrategy?.();
      if (strategy && strategy.version !== this._lastStrategyVersion) {
        return this.applySharedStrategy(strategy);
      }
      return null;
    }

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

      // 获取之前的策略历史（用于连续性）
      const previousStrategy = this.game.sharedStrategy;
      const strategyContext = previousStrategy
        ? `\n\n上次想法（${Math.round((Date.now() - previousStrategy.timestamp) / 60000)}分钟前）：
"${previousStrategy.thinking}"
重点: ${previousStrategy.focus || '无'}`
        : '';

      const prompt = `你是一名真实的农夫，性格${this.personality.description}。请以农夫的口吻进行内心独白，思考接下来该做什么。

当前农场状态：
${farmState}
${strategyContext}

要求：
1. 用第一人称，像自言自语一样自然
2. 不要暴露技术细节（权重、JSON、系统等）
3. 关注实际农场事务：作物、动物、天气、金币
4. 表达对未来的期望和对过去的反思
5. 语气要符合农夫身份，可以有点唠叨

返回JSON：
{
  "thinking": "农夫的内心独白（50-100字，自然口语）",
  "weights": {
    "收获作物": 数字(1-100),
    "浇水": 数字(1-100),
    "种植作物": 数字(1-100),
    "消灭害虫": 数字(1-100),
    "喂养动物": 数字(1-100),
    "收获动物产品": 数字(1-100),
    "购买动物": 数字(1-100),
    "投资黄金": 数字(1-100)
  },
  "focus": "当前最想做的一件事"
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

      // 更新自己的权重
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
        weights: result.weights || {},
        focus: result.focus || ''
      };

      // 保存到游戏状态
      if (this.game && this.game.addFarmerThought) {
        this.game.addFarmerThought(thoughtRecord);
      }

      this._log(`🧠 团队策略: ${result.thinking?.substring(0, 40)}...`, '🧠', 'ai-thought');

      return thoughtRecord;

    } catch (error) {
      console.error('[Farmer LLM] 思考失败:', error.message);
      return null;
    }
  }

  /** 应用共享策略（非头号农夫调用） */
  applySharedStrategy(strategy) {
    if (!strategy || !strategy.weights) return null;

    // 记录策略版本，避免重复应用
    this._lastStrategyVersion = strategy.version;

    // 应用共享权重（保留个人性格调整）
    for (const behavior of this.behaviors) {
      const sharedWeight = strategy.weights[behavior.name];
      if (sharedWeight !== undefined) {
        // 基础共享权重 + 个人性格微调
        const personalityAdjust = behavior.getAdjustedWeight(this.personality, this);
        behavior.weight = Math.max(1, Math.min(100, sharedWeight * 0.8 + personalityAdjust * 0.2));
      }
    }

    this._log(`📋 ${this.fullName} 同步了团队策略`, '📋', 'system');

    return {
      timestamp: strategy.timestamp,
      farmerName: this.fullName,
      thinking: `同步团队策略: ${strategy.thinking?.substring(0, 30)}...`,
      weights: strategy.weights
    };
  }

  // 构建农场状态描述
  _buildFarmStateDescription() {
    const game = this.game;
    const lines = [];

    // 金库
    lines.push(`💰 公库金币: ${game.sharedMoney}`);

    // 地块统计
    let planted = 0, ripe = 0, watered = 0;
    let lowFertilityPlots = 0, emptyPlots = 0;
    const cropCounts = {};
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop) {
          planted++;
          cropCounts[plot.crop] = (cropCounts[plot.crop] || 0) + 1;
          if (plot.growthStage >= 3) ripe++;
          if (plot.isWatered) watered++;
        } else {
          emptyPlots++;
          if (plot.fertility <= 0) lowFertilityPlots++;
        }
      }
    }
    lines.push(`🌱 已种植地块: ${planted}, 成熟: ${ripe}, 已浇水: ${watered}`);
    lines.push(`🟫 空地: ${emptyPlots}, 肥力耗尽: ${lowFertilityPlots}`);
    if (lowFertilityPlots > 0) {
      lines.push(`⚠️ 有${lowFertilityPlots}块地肥力耗尽，需要使用有机肥恢复！`);
    }

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

    // 市场事件/节日
    const marketInfo = game.getMarketInfo ? game.getMarketInfo() : null;
    if (marketInfo && marketInfo.activeEvents && marketInfo.activeEvents.length > 0) {
      for (const event of marketInfo.activeEvents) {
        const remainingMin = Math.ceil(event.remaining / 60);
        const priceChange = event.priceMultiplier > 1 ? `+${Math.round((event.priceMultiplier - 1) * 100)}%` : `${Math.round((event.priceMultiplier - 1) * 100)}%`;
        lines.push(`${event.emoji} ${event.name}: ${event.description} (${priceChange}) 剩余${remainingMin}分钟`);
      }
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

【可调整的行为】
玩家可能会给你建议调整以下行为：
- 收获作物、浇水、种植作物、消灭害虫
- 喂养动物、收获动物产品、购买动物、投资黄金
- 吃东西、施肥

请分析玩家消息，如果包含对你的工作建议，请：
1. 用自然简短的方式回复（1-3句话，体现性格）
2. 同时返回你理解的建议

返回JSON格式：
{
  "reply": "你的回复文字",
  "suggestion": {
    "action": "行为名称",
    "direction": "more" 或 "less" 或 null
  }
}

direction说明：
- "more": 玩家建议多做这件事
- "less": 玩家建议少做这件事
- null: 只是普通聊天，没有建议

只返回JSON，不要其他文字。`;

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
      const rawContent = data.choices?.[0]?.message?.content || '{"reply":"嗯...让我想想怎么回答。","suggestion":null}';

      // 解析JSON回复
      let parsed;
      try {
        // 清理可能的 markdown 代码块标记
        const cleaned = rawContent.replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // 如果解析失败，使用原始内容作为回复
        parsed = { reply: rawContent, suggestion: null };
      }

      const reply = parsed.reply || rawContent;

      // 记录农夫回复
      this.chatHistory.push({
        role: 'farmer',
        content: reply,
        time: Date.now()
      });

      // 应用玩家建议到权重
      if (parsed.suggestion && parsed.suggestion.action && parsed.suggestion.direction) {
        this._applySuggestion(parsed.suggestion);
      }

      return reply;

    } catch (error) {
      console.error('[Farmer Chat] 聊天失败:', error.message);
      const fallbackReply = '抱歉，我刚才走神了，你说的什么？';
      this.chatHistory.push({ role: 'farmer', content: fallbackReply, time: Date.now() });
      return fallbackReply;
    }
  }

  // ---------- 应用玩家建议 ----------

  _applySuggestion(suggestion) {
    const { action, direction } = suggestion;

    // 验证行为名称是否有效
    const validActions = [
      '收获作物', '浇水', '种植作物', '消灭害虫',
      '喂养动物', '收获动物产品', '购买动物', '投资黄金',
      '吃东西', '施肥', '出售作物', '出售动物'
    ];

    if (!validActions.includes(action)) {
      console.log(`[Suggestion] 未知行为: ${action}`);
      return;
    }

    // 设置权重调整倍数
    const multiplier = direction === 'more' ? 1.5 : 0.5;

    // 存储建议权重，持续5分钟
    this.suggestionWeights[action] = {
      multiplier,
      expiresAt: Date.now() + this.suggestionDuration,
      direction
    };

    // 记录到行动日志
    this.recentActions.push({
      time: Date.now(),
      action: `听取了建议：${direction === 'more' ? '多' : '少'}做${action}`
    });

    console.log(`[Suggestion] ${this.name} 调整权重: ${action} × ${multiplier}，持续5分钟`);
  }

  // 获取建议权重调整（清理过期建议）
  getSuggestionMultiplier(actionName) {
    const suggestion = this.suggestionWeights[actionName];
    if (!suggestion) return 1;

    // 检查是否过期
    if (Date.now() > suggestion.expiresAt) {
      delete this.suggestionWeights[actionName];
      return 1;
    }

    return suggestion.multiplier;
  }

  // ---------- 决策逻辑 ----------

  _pickBehavior() {
    // 优先检查玩家指令
    if (this.playerCommand && Date.now() < this.playerCommand.expiresAt) {
      const cmdBehavior = this._createCommandBehavior(this.playerCommand);
      if (cmdBehavior && cmdBehavior.canExecute(this, this.game)) {
        return cmdBehavior;
      }
    } else if (this.playerCommand) {
      // 指令过期，清除
      this.playerCommand = null;
    }

    return this.decisionEngine.selectBehavior();
  }

  // 根据玩家指令创建行为
  _createCommandBehavior(cmd) {
    const FarmGame = require('./game').FarmGame || {};

    switch (cmd.type) {
      case 'plant_crop':
        // 找到对应种植行为并设置目标作物
        const plantBehavior = this.behaviors.find(b => b.name === '种植');
        if (plantBehavior && cmd.params.cropType) {
          plantBehavior._forceCrop = cmd.params.cropType;
          const origExecute = plantBehavior.execute.bind(plantBehavior);
          plantBehavior.execute = (farmer, game) => {
            const result = origExecute(farmer, game);
            if (result.acted) {
              farmer.playerCommand = null; // 执行完毕清除
            }
            delete plantBehavior._forceCrop;
            return result;
          };
          return plantBehavior;
        }
        break;

      case 'focus_harvest':
        const harvestBehavior = this.behaviors.find(b => b.name === '收获作物');
        if (harvestBehavior) {
          const origExecute = harvestBehavior.execute.bind(harvestBehavior);
          harvestBehavior.execute = (farmer, game) => {
            const result = origExecute(farmer, game);
            if (result.acted) {
              // 收获成功后清除指令
              farmer.playerCommand = null;
            }
            return result;
          };
          return harvestBehavior;
        }
        break;

      case 'buy_animal':
        const buyAnimalBehavior = this.behaviors.find(b => b.name === '购买动物');
        if (buyAnimalBehavior && cmd.params.animalType) {
          buyAnimalBehavior._forceAnimal = cmd.params.animalType;
          const origExecute = buyAnimalBehavior.execute.bind(buyAnimalBehavior);
          buyAnimalBehavior.execute = (farmer, game) => {
            const result = origExecute(farmer, game);
            if (result.acted) {
              farmer.playerCommand = null;
            }
            delete buyAnimalBehavior._forceAnimal;
            return result;
          };
          return buyAnimalBehavior;
        }
        break;

      case 'sell_crop':
        // 优先出售指定作物
        const sellBehavior = this.behaviors.find(b => b.name === '出售作物');
        if (sellBehavior) {
          const origExecute = sellBehavior.execute.bind(sellBehavior);
          sellBehavior.execute = (farmer, game) => {
            const result = origExecute(farmer, game);
            if (result.acted) {
              farmer.playerCommand = null;
            }
            return result;
          };
          return sellBehavior;
        }
        break;

      case 'invest_gold':
        const investBehavior = this.behaviors.find(b => b.name === '投资黄金');
        if (investBehavior) {
          const origExecute = investBehavior.execute.bind(investBehavior);
          investBehavior.execute = (farmer, game) => {
            const result = origExecute(farmer, game);
            if (result.acted) {
              farmer.playerCommand = null;
            }
            return result;
          };
          return investBehavior;
        }
        break;
    }

    return null;
  }

  /** 获取决策调试信息 */
  getDecisionDebugInfo() {
    return this.decisionEngine.getDebugInfo();
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
      const hungerRate = this.state === 'sleeping' ? 0.1 : 0.2; // 降低饥饿速度
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

      // 每50次tick衰减权重（防止历史数据过度影响）
      if (this._tickCount % 50 === 0) {
        for (const behavior of this.behaviors) {
          behavior.decayWeight();
        }
      }

      // 每100次tick进行深度思考（约45分钟一次）
      if (this._tickCount % 100 === 0) {
        this._deepThink();
      }

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
      this.recordAction(beh.name, { earned, log });

      // 记录收益到目标规划系统
      if (earned > 0) {
        this.goalPlanner.recordEarning(earned);
      }

      // 如果亏损，记录教训
      if (earned < 0) {
        this.lessonLearner.recordFailure('gold_loss', { action: beh.name, loss: -earned });
      }

      if (log) this._log(log, beh.emoji, 'farmer');
    }

    // 执行完后延迟一小会儿进行下一次决策（避免连续执行太快）
    setTimeout(() => {
      if (!this.isDead && !this.walkTarget) {
        this.tick();
      }
    }, 500);
  }

  // ---------- 深度思考 ----------
  _deepThink() {
    // 目标规划：分析当前状况，制定赚钱策略
    const planResult = this.goalPlanner.makePlan(this.game);

    if (planResult) {
      // 构建自然的思考内容
      const money = this.game.sharedMoney || 0;
      const target = this.goalPlanner.weeklyTarget;
      const earned = Math.floor(this.goalPlanner.earnedThisWeek);

      let thinking = `💭 嗯...让我想想...`;
      thinking += `\n现在公库有 ${money} 金币，这周我赚了 ${earned}，目标是 ${target}。`;

      // 节日/市场事件
      const marketInfo = this.game.getMarketInfo ? this.game.getMarketInfo() : null;
      if (marketInfo && marketInfo.activeEvents && marketInfo.activeEvents.length > 0) {
        for (const event of marketInfo.activeEvents) {
          if (event.priceMultiplier > 1) {
            const remainingMin = Math.ceil(event.remaining / 60);
            thinking += `\n${event.emoji} 趁着${event.name}，赶紧多卖点东西！还剩${remainingMin}分钟。`;
            // 节日期间提高收获和销售优先级
            this.goalPlanner.strategyPlan.push({
              action: '收获作物',
              reason: `${event.name}期间价格${Math.round((event.priceMultiplier - 1) * 100)}%上涨`,
              priority: 'high',
              weightBonus: 8
            });
          }
        }
      }

      // 策略计划
      if (this.goalPlanner.strategyPlan.length > 0) {
        thinking += `\n得赶紧${this.goalPlanner.strategyPlan[0].reason}！`;
      }

      // 教训反思
      const recentLessons = this.lessonLearner.getRecentLessons(2);
      if (recentLessons.length > 0) {
        thinking += `\n上次${recentLessons[0]}，可不能再犯了。`;
      }

      this._log(thinking, '🧠', 'farmer');
    }
  }

  /** 记录失败/教训（供外部调用） */
  recordFailure(type, details) {
    const thought = this.lessonLearner.recordFailure(type, details);
    this._log(`❌ ${this.fullName} 吸取教训: ${thought}`, '😔', 'farmer');
  }

  /** 记录收益（供行为类调用） */
  recordEarning(amount) {
    this.goalPlanner.recordEarning(amount);
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
  // 核心类
  Farmer,
  FarmerBehavior,
  DecisionEngine,
  UrgencyEvaluator,
  DECISION_CONFIG,
  // 行为类
  SleepBehavior,
  EatBehavior,
  EmergencyLiquidateBehavior,
  KillPestBehavior,
  HarvestCropBehavior,
  WaterCropBehavior,
  PlantCropBehavior,
  HarvestAnimalBehavior,
  FeedAnimalBehavior,
  HuntWildAnimalBehavior,
  BuyAnimalBehavior,
  SellOldAnimalBehavior,
  HireFireFarmerBehavior,
  FertilizeBehavior,
  BuySeedsBehavior,
  BuyPesticideBehavior,
  BuyWeaponBehavior,
  InvestGoldBehavior,
  WanderBehavior
};

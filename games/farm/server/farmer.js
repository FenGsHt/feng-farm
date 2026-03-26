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
    if (game.sharedMoney < 10 || farmer.hunger < 60) {
      cost = 5; satiety = 25; foodName = '面包 🍞';
    } else if (game.sharedMoney < 20 || farmer.hunger < 75) {
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

    const bestSeed = available.sort((a, b) => b[1] - a[1])[0][0];

    const t    = this._findEmpty(farmer, game) || { x: farmer.x, y: farmer.y };
    const plot = game.plots[t.y]?.[t.x];
    if (!plot || plot.crop) return { log: '', acted: false, earned: 0 };

    const result = plot.plant(bestSeed, farmer.fullName);
    if (!result.success) return { log: '', acted: false, earned: 0 };

    farmer.seeds[bestSeed]--;
    if (farmer.seeds[bestSeed] <= 0) delete farmer.seeds[bestSeed];

    const cfg = game.getCropConfig(bestSeed);
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `种下了 ${cfg.emoji}${cfg.name}`;
    return {
      log:    `${farmer.fullName} 在 (${t.x},${t.y}) 种下了 ${cfg.emoji}${cfg.name} 🌱`,
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
    return { x: 0, y: game.height - 1 };
  }

  execute(farmer, game) {
    let totalEarned = 0;
    const harvested = [];

    for (const pen of game.animalPens) {
      if (!pen.animal || !pen.isReady) continue;
      const result = pen.harvest();
      if (result.success) {
        game.sharedMoney += result.reward;
        totalEarned      += result.reward;
        const ANIMAL_EMOJI = { chicken:'🐔', duck:'🦆', sheep:'🐑', cow:'🐄', pig:'🐖', horse:'🐴', rabbit:'🐰', bee:'🐝' };
        harvested.push(`${ANIMAL_EMOJI[result.animalType] || '🐾'}${result.product}`);
      }
    }

    if (!harvested.length) return { log: '', acted: false, earned: 0 };

    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = '收获了动物产品';
    return {
      log:    `${farmer.fullName} 收获了 ${harvested.join('、')}，公库 +${totalEarned} 💰`,
      acted:  true,
      earned: totalEarned
    };
  }
}

/** 🌽 喂养饥饿的动物 */
class FeedAnimalBehavior extends FarmerBehavior {
  constructor() { super('喂养动物', '🌽', 9); }

  canExecute(farmer, game) {
    return game.animalPens.some(p => p.animal && (p.hunger || 0) >= 60)
      && game.sharedMoney >= 10;
  }

  getTarget(farmer, game) { return { x: 0, y: game.height - 1 }; }

  execute(farmer, game) {
    let fed = 0, cost = 0;
    for (const pen of game.animalPens) {
      if (pen.animal && (pen.hunger || 0) >= 60) {
        pen.hunger = Math.max(0, (pen.hunger || 0) - 65);
        cost += 5;
        fed++;
      }
    }
    if (!fed || game.sharedMoney < cost) return { log: '', acted: false, earned: 0 };

    game.sharedMoney -= cost;
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `喂养了 ${fed} 只动物`;
    return {
      log:    `${farmer.fullName} 喂养了 ${fed} 只动物 🌽，花费 ${cost} 💰`,
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
    // 通过 game.ANIMALS 访问，避免循环 require
    const affordable = Object.entries(game.ANIMALS)
      .filter(([, a]) => game.sharedMoney >= a.buyPrice + 50)
      .sort((a, b) => (b[1].productPrice / b[1].growthTime) - (a[1].productPrice / a[1].growthTime));

    if (!affordable.length) return { log: '', acted: false, earned: 0 };

    const [animalType, animal] = affordable[0];
    const pen = game.animalPens.find(p => !p.animal);
    if (!pen) return { log: '', acted: false, earned: 0 };

    // AnimalPen.place() 方法
    const result = pen.place(animalType, farmer.fullName);
    if (!result.success) return { log: '', acted: false, earned: 0 };

    game.sharedMoney -= animal.buyPrice;
    this._cooldown = Date.now() + 120000; // 2 分钟冷却

    farmer.state         = 'working';
    farmer.currentAction = `买了 ${animal.emoji}${animal.name}`;
    return {
      log:    `${farmer.fullName} 花 ${animal.buyPrice} 💰 买了一只 ${animal.emoji}${animal.name}！`,
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

    // 从注册表实例化所有行为
    this.behaviors = Array.from(FarmerBehavior.registry.values()).map(Cls => new Cls());

    this.tickIntervalMs = options.tickInterval || 28000;
    this.moveIntervalMs = options.moveInterval || 1600;

    this._tickIntervalId = null;
    this._moveIntervalId = null;
    this._tickCount      = 0;

    setTimeout(() => this._start(), options.startDelay ?? 5000);
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
    const h = (new Date().getUTCHours() + 8) % 24;
    return h >= 22 || h < 6;
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

  async thinkWithAI(context) {
    // TODO: 接入 Anthropic Claude / OpenAI 等
    return null;
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
      const hungerRate = this.state === 'sleeping' ? 0.6 : 1.2;
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
    for (const [crop, price] of Object.entries(SEED_PRICES)) {
      const cost = price * 5;
      if ((this.seeds[crop] || 0) < 5 && this.game.sharedMoney >= cost + 50) {
        this.seeds[crop] = (this.seeds[crop] || 0) + 5;
        this.game.sharedMoney -= cost;
      }
    }
    if ((this.items.pesticide || 0) < 2 && this.game.sharedMoney >= 90) {
      this.items.pesticide = (this.items.pesticide || 0) + 2;
      this.game.sharedMoney -= 40;
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

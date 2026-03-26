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
    this._earnedTotal = 0;  // 累计收入
    this._callCount   = 0;  // 累计执行次数
  }

  /** 执行后记录收益，重新计算动态权重 */
  recordProfit(earned = 0) {
    if (earned <= 0) return;
    this._earnedTotal += earned;
    this._callCount   += 1;
    const avgEarned = this._earnedTotal / this._callCount;
    // weight = baseWeight + 平均收益 × 系数（上限 baseWeight × 8）
    this.weight = Math.min(
      this.baseWeight + avgEarned * 0.6,
      this.baseWeight * 8
    );
  }

  // ---------- 子类实现 ----------

  /** 当前是否可以执行 */
  canExecute(farmer, game) { return false; }

  /**
   * 返回需要前往的目标坐标，null = 原地执行
   * @returns {{ x:number, y:number } | null}
   */
  getTarget(farmer, game) { return null; }

  /**
   * 到达目标后执行
   * @returns {{ log:string, acted:boolean, earned:number }}
   */
  execute(farmer, game) { return { log: '', acted: false, earned: 0 }; }

  // ---------- 静态注册表 ----------

  /** 全局行为注册表 name → class */
  static registry = new Map();

  /**
   * 注册一个行为类（在类定义后调用一次即可）
   * 未来新增功能只需继承 + register，无需改动 Farmer 主类
   */
  static register(BehaviorClass) {
    const instance = new BehaviorClass();
    FarmerBehavior.registry.set(instance.name, BehaviorClass);
  }
}

// ============================================================
//  内置行为
// ============================================================

/** 夜间睡觉（UTC+8 22:00–06:00），回 (0,0) 小屋 */
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
      earned: 0  // 浇水不直接产生收入，但加速成熟（权重靠 harvest 拉动）
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

    // 优先种植平均收益最高的（基于 harvest 行为的动态权重估算）
    const harvestBeh = farmer.behaviors.find(b => b.name === '收获作物');
    const bestSeed = this._pickBestSeed(available, harvestBeh);

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

  /** 按种子卖价选收益最高的 */
  _pickBestSeed(available, harvestBeh) {
    // 简单策略：选卖价最高的种子（后续可接 AI 决策）
    return available.sort((a, b) => b[1] - a[1])[0][0];
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

/** 消灭害虫（有杀虫剂时） */
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
    // 消灭害虫间接保护作物收益，给予象征性权重奖励
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

/** 收获动物产品（鸡蛋/牛奶/羊毛等） */
class HarvestAnimalBehavior extends FarmerBehavior {
  constructor() { super('收获动物产品', '🐾', 12); }

  canExecute(farmer, game) {
    return game.animalPens.some(pen => pen.animal && pen.isReady);
  }

  // 动物在"牧场区域"——农场左下角，农夫走过去
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
    farmer.currentAction = `收获了动物产品`;
    return {
      log:    `${farmer.fullName} 收获了 ${harvested.join('、')}，公库 +${totalEarned} 💰`,
      acted:  true,
      earned: totalEarned
    };
  }
}

/** 购买动物（金库充足时自动扩充牧场） */
class BuyAnimalBehavior extends FarmerBehavior {
  constructor() {
    super('购买动物', '🛒', 4);
    this._cooldown = 0; // 购买冷却（避免频繁买）
  }

  canExecute(farmer, game) {
    if (Date.now() < this._cooldown) return false;
    // 有空栏 + 金库足够买最便宜的动物（鸡 50）
    const hasEmpty = game.animalPens.some(p => !p.animal);
    return hasEmpty && game.sharedMoney >= 100; // 留一点余量
  }

  getTarget(farmer, game) {
    return { x: 0, y: game.height - 1 }; // 走向牧场区域
  }

  execute(farmer, game) {
    // 按性价比排序：productPrice / buyPrice 最高的优先
    // 通过 game.ANIMALS 访问，避免循环 require
    const affordable = Object.entries(game.ANIMALS)
      .filter(([, a]) => game.sharedMoney >= a.buyPrice + 50)
      .sort((a, b) => (b[1].productPrice / b[1].growthTime) - (a[1].productPrice / a[1].growthTime));

    if (!affordable.length) return { log: '', acted: false, earned: 0 };

    const [animalType, animal] = affordable[0];
    const pen = game.animalPens.find(p => !p.animal);
    if (!pen) return { log: '', acted: false, earned: 0 };

    const result = pen.occupy(animalType, farmer.fullName);
    if (!result.success) return { log: '', acted: false, earned: 0 };

    game.sharedMoney -= animal.buyPrice;
    // 购买冷却：2 分钟内不再购买，避免一口气买空金库
    this._cooldown = Date.now() + 120000;

    farmer.state         = 'working';
    farmer.currentAction = `买了 ${animal.emoji}${animal.name}`;
    return {
      log:    `${farmer.fullName} 花 ${animal.buyPrice} 💰 买了一只 ${animal.emoji}${animal.name}！`,
      acted:  true,
      earned: 0
    };
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
FarmerBehavior.register(KillPestBehavior);
FarmerBehavior.register(HarvestCropBehavior);
FarmerBehavior.register(WaterCropBehavior);
FarmerBehavior.register(PlantCropBehavior);
FarmerBehavior.register(HarvestAnimalBehavior);
FarmerBehavior.register(BuyAnimalBehavior);
FarmerBehavior.register(WanderBehavior);

// ============================================================
//  农夫 NPC 主类
// ============================================================
class Farmer {
  /**
   * @param {object}   game         FarmGame 实例
   * @param {Function} logCallback  (message, emoji, type) => void
   * @param {object}   [options]
   */
  constructor(game, logCallback, options = {}) {
    this.game        = game;
    this.logCallback = logCallback;

    this.name     = options.name || '阿明';
    this.emoji    = '🧑‍🌾';
    this.fullName = `农夫${this.name}`;

    this.x = options.startX || 0;
    this.y = options.startY || 0;

    // 行走状态
    this.walkTarget       = null;
    this.onArriveCallback = null;

    this.state         = 'idle';
    this.currentAction = '准备工作';

    // 农夫库存（从公库购买）
    this.seeds = options.seeds || { wheat: 8, carrot: 8, tomato: 6, rice: 4 };
    this.items = options.items || { pesticide: 3 };

    // 从注册表实例化所有行为
    this.behaviors = Array.from(FarmerBehavior.registry.values()).map(Cls => new Cls());

    // 决策间隔 28s；移动间隔 1.6s/格
    this.tickIntervalMs = options.tickInterval || 28000;
    this.moveIntervalMs = options.moveInterval || 1600;

    this._tickIntervalId = null;
    this._moveIntervalId = null;
    this._tickCount      = 0;

    setTimeout(() => this._start(), options.startDelay || 5000);
  }

  // ---------- 行为管理 ----------

  /** 动态注册额外行为（新功能钩子） */
  registerBehavior(behaviorInstance) {
    this.behaviors.push(behaviorInstance);
    return this;
  }

  /** 按名称移除行为 */
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

  // ---------- LLM 预留接口 ----------

  /**
   * 使用大模型决策下一步行为（stub）
   * 返回 { behaviorName:string } 则覆盖默认加权随机逻辑；返回 null 则走默认路径
   * @param {{ farmState, farmerState, weights: Array<{name,weight}> }} context
   * @returns {Promise<{ behaviorName:string, reason:string } | null>}
   */
  async thinkWithAI(context) {
    // TODO: 接入 Anthropic Claude / OpenAI 等
    // const res = await anthropic.messages.create({ model:'claude-opus-4-5', messages:[...] });
    return null;
  }

  // ---------- 加权随机选择 ----------

  _pickBehavior() {
    const eligible = this.behaviors.filter(b => b.canExecute(this, this.game));
    if (!eligible.length) return null;

    // SleepBehavior 直接强制执行（夜间必须睡觉）
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
    this._tickCount++;
    try {
      // 起床检查
      if (!this.isNightTime() && this.state === 'sleeping') {
        this.state         = 'idle';
        this.emoji         = '🧑‍🌾';
        this.currentAction = '起床啦！';
        this._log(`${this.fullName} 从小屋醒来，开始新的一天 🌅`, '🌅', 'farmer');
      }

      if (this.walkTarget) return; // 仍在赶路，等到达再决策

      if (this._tickCount % 20 === 0) this._restockSeeds();

      // 加权随机选择行为
      const beh = this._pickBehavior();
      if (!beh) return;

      const target = beh.getTarget(this, this.game);
      const needWalk = target && (target.x !== this.x || target.y !== this.y);

      if (needWalk) {
        this.walkTarget    = target;
        this.state         = 'walking';
        this.currentAction = `前往 (${target.x},${target.y})`;
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
      beh.recordProfit(earned); // 更新动态权重
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
      walkTarget:    this.walkTarget,
      timeString:    this.getTimeString(),
      // 权重快照（可供调试/日志查看）
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
  // 导出所有行为类，方便外部扩展
  SleepBehavior,
  KillPestBehavior,
  HarvestCropBehavior,
  WaterCropBehavior,
  PlantCropBehavior,
  HarvestAnimalBehavior,
  BuyAnimalBehavior,
  WanderBehavior
};

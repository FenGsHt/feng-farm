'use strict';

// ========== 农夫行为基类（可拓展） ==========
class FarmerBehavior {
  /**
   * @param {string} name     行为名称（唯一标识）
   * @param {string} emoji    行为 emoji（用于日志）
   * @param {number} priority 优先级，越大越优先执行
   */
  constructor(name, emoji, priority) {
    this.name = name;
    this.emoji = emoji;
    this.priority = priority;
  }

  /**
   * 判断此行为当前是否可以执行
   * @param {Farmer}    farmer
   * @param {FarmGame}  game
   * @returns {boolean}
   */
  canExecute(farmer, game) { return false; }

  /**
   * 执行行为
   * @param {Farmer}    farmer
   * @param {FarmGame}  game
   * @returns {{ log: string, acted: boolean }}
   */
  execute(farmer, game) { return { log: '', acted: false }; }
}

// ========== 内置行为 ==========

/** 夜间睡觉（UTC+8 22:00 - 06:00） */
class SleepBehavior extends FarmerBehavior {
  constructor() { super('睡觉', '💤', 100); }

  canExecute(farmer) { return farmer.isNightTime(); }

  execute(farmer) {
    const wasAwake = farmer.state !== 'sleeping';
    farmer.state = 'sleeping';
    farmer.currentAction = '正在睡觉 💤';
    farmer.x = 0;
    farmer.y = 0;
    if (wasAwake) {
      return { log: `${farmer.fullName} 回小屋睡觉了，晚安 💤`, acted: true };
    }
    return { log: '', acted: false }; // 已经在睡不再重复记录
  }
}

/** 消灭害虫（有杀虫剂时） */
class KillPestBehavior extends FarmerBehavior {
  constructor() { super('消灭害虫', '🧴', 80); }

  canExecute(farmer, game) {
    return (farmer.items.pesticide || 0) > 0 && game.pests.length > 0;
  }

  execute(farmer, game) {
    const pest = this._findNearest(farmer, game.pests);
    if (!pest) return { log: '', acted: false };

    farmer.x = pest.x;
    farmer.y = pest.y;
    farmer.state = 'working';

    const result = game.usePesticide(pest.x, pest.y);
    if (result.success) {
      farmer.items.pesticide--;
      if (farmer.items.pesticide <= 0) delete farmer.items.pesticide;
      const pestNames = { aphid: '🐛蚜虫', locust: '🦗蝗虫', rat: '🐀老鼠' };
      const pestLabel = pestNames[pest.type] || '害虫';
      farmer.currentAction = `消灭了${pestLabel}`;
      return {
        log: `${farmer.fullName} 喷洒杀虫剂，消灭了附近的 ${pestLabel}！`,
        acted: true
      };
    }
    return { log: '', acted: false };
  }

  _findNearest(farmer, pests) {
    let nearest = null, minDist = Infinity;
    for (const p of pests) {
      const d = Math.abs(p.x - farmer.x) + Math.abs(p.y - farmer.y);
      if (d < minDist) { minDist = d; nearest = p; }
    }
    return nearest;
  }
}

/** 收获成熟作物 */
class HarvestBehavior extends FarmerBehavior {
  constructor() { super('收获', '🧺', 70); }

  canExecute(farmer, game) {
    return this._findRipe(farmer, game) !== null;
  }

  execute(farmer, game) {
    const target = this._findRipe(farmer, game);
    if (!target) return { log: '', acted: false };

    farmer.x = target.x;
    farmer.y = target.y;
    farmer.state = 'working';

    const result = target.plot.harvest();
    if (result.success) {
      const cfg = game.getCropConfig(result.cropType);
      game.sharedMoney += result.reward; // 收益归入共用金库
      farmer.currentAction = `收获了 ${cfg.emoji}${cfg.name}`;
      return {
        log: `${farmer.fullName} 收获了 ${cfg.emoji}${cfg.name}，公共金库 +${result.reward} 💰`,
        acted: true
      };
    }
    return { log: '', acted: false };
  }

  _findRipe(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop && plot.growthStage >= 3) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y, plot }; }
        }
      }
    }
    return best;
  }
}

/** 给未浇水的作物浇水 */
class WaterBehavior extends FarmerBehavior {
  constructor() { super('浇水', '💧', 60); }

  canExecute(farmer, game) {
    return this._findDry(farmer, game) !== null;
  }

  execute(farmer, game) {
    const target = this._findDry(farmer, game);
    if (!target) return { log: '', acted: false };

    farmer.x = target.x;
    farmer.y = target.y;
    farmer.state = 'working';

    const result = target.plot.water();
    if (result.success) {
      const cfg = game.getCropConfig(target.plot.crop);
      farmer.currentAction = `给 ${cfg.emoji} 浇水`;
      return {
        log: `${farmer.fullName} 给 (${target.x},${target.y}) 的 ${cfg.emoji}${cfg.name} 浇了水 💧`,
        acted: true
      };
    }
    return { log: '', acted: false };
  }

  _findDry(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop && !plot.isWatered && plot.growthStage < 3) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y, plot }; }
        }
      }
    }
    return best;
  }
}

/** 在空地上种植种子 */
class PlantBehavior extends FarmerBehavior {
  constructor() { super('种植', '🌱', 50); }

  canExecute(farmer, game) {
    const hasSeeds = Object.values(farmer.seeds).some(v => v > 0);
    if (!hasSeeds) return false;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (!game.plots[y][x].crop) return true;
      }
    }
    return false;
  }

  execute(farmer, game) {
    // 从有种子的列表中随机选一种
    const available = Object.entries(farmer.seeds).filter(([, v]) => v > 0);
    if (available.length === 0) return { log: '', acted: false };
    const [cropType] = available[Math.floor(Math.random() * available.length)];

    // 找最近空地块
    let target = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (!game.plots[y][x].crop) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; target = { x, y }; }
        }
      }
    }
    if (!target) return { log: '', acted: false };

    farmer.x = target.x;
    farmer.y = target.y;
    farmer.state = 'working';

    const result = game.plots[target.y][target.x].plant(cropType, farmer.fullName);
    if (result.success) {
      farmer.seeds[cropType]--;
      if (farmer.seeds[cropType] <= 0) delete farmer.seeds[cropType];
      const cfg = game.getCropConfig(cropType);
      farmer.currentAction = `种下了 ${cfg.emoji}${cfg.name}`;
      return {
        log: `${farmer.fullName} 在 (${target.x},${target.y}) 种下了 ${cfg.emoji}${cfg.name} 🌱`,
        acted: true
      };
    }
    return { log: '', acted: false };
  }
}

/** 巡视/闲逛（兜底行为，优先级最低） */
class WanderBehavior extends FarmerBehavior {
  constructor() { super('巡视', '🚶', 10); }

  canExecute() { return true; }

  execute(farmer, game) {
    const dx = Math.floor(Math.random() * 3) - 1;
    const dy = Math.floor(Math.random() * 3) - 1;
    farmer.x = Math.max(0, Math.min(game.width - 1, farmer.x + dx));
    farmer.y = Math.max(0, Math.min(game.height - 1, farmer.y + dy));
    farmer.state = 'wandering';

    const texts = ['在农场里溜达', '检查作物状况', '巡视田地', '在地里转转', '看看今天的收成'];
    const text = texts[Math.floor(Math.random() * texts.length)];
    farmer.currentAction = text;
    return { log: `${farmer.fullName} ${text}...`, acted: true };
  }
}

// ========== 农夫 NPC 主类 ==========
class Farmer {
  /**
   * @param {object}   game           FarmGame 实例
   * @param {Function} logCallback    function(message, emoji, type) 日志回调
   * @param {object}   [options]      配置项
   */
  constructor(game, logCallback, options = {}) {
    this.game = game;
    this.logCallback = logCallback;

    // 基本信息
    this.name       = options.name || '阿明';
    this.emoji      = '🧑‍🌾';
    this.fullName   = `农夫${this.name}`;

    // 地图位置
    this.x = options.startX || 0;
    this.y = options.startY || 0;

    // 状态
    this.state         = 'idle';
    this.currentAction = '准备工作';

    // 农夫库存（种子/道具从公共金库购买，收益也归入公共金库）
    this.seeds = options.seeds || { wheat: 8, carrot: 8, tomato: 6, rice: 4 };
    this.items = options.items || { pesticide: 3 };

    // 行为列表（按优先级降序）
    this.behaviors = [];
    this._registerDefaultBehaviors();

    // Tick 间隔（默认 45 秒）
    this.tickIntervalMs = options.tickInterval || 45000;
    this._intervalId    = null;

    // 补充种子的计时器（每隔若干 tick 自动补仓）
    this._tickCount = 0;

    // 延迟启动，等游戏完成初始化
    setTimeout(() => this._start(), options.startDelay || 8000);
  }

  // ---------- 行为管理 ----------

  /** 注册行为（自动按优先级排序） */
  registerBehavior(behavior) {
    this.behaviors.push(behavior);
    this.behaviors.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /** 按名称移除行为 */
  removeBehavior(name) {
    this.behaviors = this.behaviors.filter(b => b.name !== name);
    return this;
  }

  _registerDefaultBehaviors() {
    this.registerBehavior(new SleepBehavior());
    this.registerBehavior(new KillPestBehavior());
    this.registerBehavior(new HarvestBehavior());
    this.registerBehavior(new WaterBehavior());
    this.registerBehavior(new PlantBehavior());
    this.registerBehavior(new WanderBehavior());
  }

  // ---------- 时间工具 ----------

  /** 判断当前是否是夜晚（UTC+8 22:00 - 06:00） */
  isNightTime() {
    const h = (new Date().getUTCHours() + 8) % 24;
    return h >= 22 || h < 6;
  }

  /** 获取 UTC+8 时间字符串，如 "08:30" */
  getTimeString() {
    const now = new Date();
    const h   = String((now.getUTCHours() + 8) % 24).padStart(2, '0');
    const m   = String(now.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  // ---------- LLM 预留接口 ----------

  /**
   * 使用大模型决策下一步行为（目前为 stub）
   * 未来可在此接入 Anthropic / OpenAI 等 API
   *
   * @param {object} context  { farmState, farmerState, availableBehaviors }
   * @returns {Promise<{ behavior: string, reason: string } | null>}
   *   返回 null 时使用默认优先级逻辑
   */
  async thinkWithAI(context) {
    // TODO: 在此接入大模型 API
    // 示例（伪代码）:
    // const res = await fetch('/api/llm', { method: 'POST', body: JSON.stringify(context) });
    // return res.json();
    console.log('[Farmer] thinkWithAI (stub) context:', JSON.stringify(context).slice(0, 200));
    return null;
  }

  // ---------- 主 tick ----------

  tick() {
    this._tickCount++;
    try {
      // 检查是否刚从夜间醒来
      if (!this.isNightTime() && this.state === 'sleeping') {
        this.state = 'idle';
        this.currentAction = '起床啦！';
        this._log(`${this.fullName} 从小屋醒来，开始新的一天 🌅`, '🌅', 'farmer');
      }

      // 每 20 tick 自动补充一批种子（保持持续种植）
      if (this._tickCount % 20 === 0) {
        this._restockSeeds();
      }

      // 按优先级执行第一个可执行行为
      for (const beh of this.behaviors) {
        if (beh.canExecute(this, this.game)) {
          const { log, acted } = beh.execute(this, this.game);
          if (acted && log) this._log(log, beh.emoji, 'farmer');
          break;
        }
      }
    } catch (err) {
      console.error('[Farmer] tick error:', err);
    }
  }

  // 自动补仓种子（从公共金库购买）
  _restockSeeds() {
    const cheapSeeds = ['wheat', 'carrot', 'rice', 'tomato'];
    const SEED_PRICES = { wheat: 2, carrot: 3, rice: 8, tomato: 5 };
    for (const crop of cheapSeeds) {
      const cnt = this.seeds[crop] || 0;
      const cost = SEED_PRICES[crop] * 5;
      if (cnt < 5 && this.game.sharedMoney >= cost) {
        this.seeds[crop] = (this.seeds[crop] || 0) + 5;
        this.game.sharedMoney -= cost;
      }
    }
    // 补充杀虫剂
    if ((this.items.pesticide || 0) < 2 && this.game.sharedMoney >= 40) {
      this.items.pesticide = (this.items.pesticide || 0) + 2;
      this.game.sharedMoney -= 40;
    }
  }

  _log(message, emoji, type) {
    if (this.logCallback) this.logCallback(message, emoji, type);
  }

  _start() {
    this._log(`${this.fullName} 上班了，开始照料农场！`, '🧑‍🌾', 'system');
    this.tick(); // 立即执行一次
    this._intervalId = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  destroy() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
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
      timeString:    this.getTimeString()
    };
  }
}

module.exports = {
  Farmer,
  FarmerBehavior,
  SleepBehavior,
  KillPestBehavior,
  HarvestBehavior,
  WaterBehavior,
  PlantBehavior,
  WanderBehavior
};

'use strict';

// ========== 农夫行为基类（可拓展） ==========
class FarmerBehavior {
  /**
   * @param {string} name     行为名称（唯一标识）
   * @param {string} emoji    行为 emoji（用于日志）
   * @param {number} priority 优先级，越大越优先执行
   */
  constructor(name, emoji, priority) {
    this.name     = name;
    this.emoji    = emoji;
    this.priority = priority;
  }

  /** 判断此行为当前是否可以执行 */
  canExecute(farmer, game) { return false; }

  /**
   * 返回需要前往的目标坐标。农夫会先走到这里，到达后再调用 execute()。
   * 返回 null 则不需要移动，直接原地执行。
   * @returns {{ x: number, y: number } | null}
   */
  getTarget(farmer, game) { return null; }

  /**
   * 到达目标格子后执行具体动作（农夫已在目标坐标）。
   * @returns {{ log: string, acted: boolean }}
   */
  execute(farmer, game) { return { log: '', acted: false }; }
}

// ========== 内置行为 ==========

/** 夜间睡觉（UTC+8 22:00–06:00），走回 (0,0) 小屋 */
class SleepBehavior extends FarmerBehavior {
  constructor() { super('睡觉', '💤', 100); }

  canExecute(farmer) { return farmer.isNightTime(); }

  getTarget() { return { x: 0, y: 0 }; }

  execute(farmer) {
    const wasAwake = farmer.state !== 'sleeping';
    farmer.state         = 'sleeping';
    farmer.emoji         = '😴';
    farmer.currentAction = '正在睡觉 💤';
    if (wasAwake) {
      return { log: `${farmer.fullName} 回小屋睡觉了，晚安 💤`, acted: true };
    }
    return { log: '', acted: false };
  }
}

/** 消灭害虫（有杀虫剂时走到最近害虫处） */
class KillPestBehavior extends FarmerBehavior {
  constructor() { super('消灭害虫', '🧴', 80); }

  canExecute(farmer, game) {
    return (farmer.items.pesticide || 0) > 0 && game.pests.length > 0;
  }

  getTarget(farmer, game) { return this._findNearest(farmer, game.pests); }

  execute(farmer, game) {
    // 尝试消灭当前格或最近害虫
    const pest = game.pests.find(p => p.x === farmer.x && p.y === farmer.y)
      || this._findNearest(farmer, game.pests);
    if (!pest) return { log: '', acted: false };

    const result = game.usePesticide(pest.x, pest.y);
    if (!result.success) return { log: '', acted: false };

    farmer.items.pesticide--;
    if (farmer.items.pesticide <= 0) delete farmer.items.pesticide;

    const PEST_NAMES = { aphid: '🐛蚜虫', locust: '🦗蝗虫', rat: '🐀老鼠' };
    const label = PEST_NAMES[pest.type] || '害虫';
    farmer.state         = 'working';
    farmer.currentAction = `消灭了 ${label}`;
    return {
      log:   `${farmer.fullName} 喷洒杀虫剂，消灭了附近的 ${label}！`,
      acted: true
    };
  }

  _findNearest(farmer, pests) {
    let nearest = null, minDist = Infinity;
    for (const p of pests) {
      const d = Math.abs(p.x - farmer.x) + Math.abs(p.y - farmer.y);
      if (d < minDist) { minDist = d; nearest = p; }
    }
    return nearest ? { x: nearest.x, y: nearest.y } : null;
  }
}

/** 收获成熟作物（走到最近成熟格） */
class HarvestBehavior extends FarmerBehavior {
  constructor() { super('收获', '🧺', 70); }

  canExecute(farmer, game) { return this._findRipe(farmer, game) !== null; }

  getTarget(farmer, game) { return this._findRipe(farmer, game); }

  execute(farmer, game) {
    // 优先当前格，其次重新寻找最近成熟格（途中可能被玩家抢收）
    const candidates = [
      { x: farmer.x, y: farmer.y },
      ...( this._findRipe(farmer, game) ? [this._findRipe(farmer, game)] : [] )
    ];
    for (const t of candidates) {
      const plot = game.plots[t.y]?.[t.x];
      if (!plot || !plot.crop || plot.growthStage < 3) continue;
      const result = plot.harvest();
      if (!result.success) continue;
      const cfg = game.getCropConfig(result.cropType);
      game.sharedMoney += result.reward;
      farmer.state         = 'working';
      farmer.emoji         = '🧑‍🌾';
      farmer.currentAction = `收获了 ${cfg.emoji}${cfg.name}`;
      return {
        log:   `${farmer.fullName} 收获了 ${cfg.emoji}${cfg.name}，公共金库 +${result.reward} 💰`,
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
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
      }
    }
    return best;
  }
}

/** 给未浇水的作物浇水 */
class WaterBehavior extends FarmerBehavior {
  constructor() { super('浇水', '💧', 60); }

  canExecute(farmer, game) { return this._findDry(farmer, game) !== null; }

  getTarget(farmer, game) { return this._findDry(farmer, game); }

  execute(farmer, game) {
    const target = this._findDry(farmer, game) || { x: farmer.x, y: farmer.y };
    const plot   = game.plots[target.y]?.[target.x];
    if (!plot || !plot.crop || plot.isWatered) return { log: '', acted: false };

    const result = plot.water();
    if (!result.success) return { log: '', acted: false };

    const cfg = game.getCropConfig(plot.crop);
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `给 ${cfg.emoji} 浇水`;
    return {
      log:   `${farmer.fullName} 给 ${cfg.emoji}${cfg.name} 浇了水 💧`,
      acted: true
    };
  }

  _findDry(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        const plot = game.plots[y][x];
        if (plot.crop && !plot.isWatered && plot.growthStage < 3) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
      }
    }
    return best;
  }
}

/** 在空地上种植种子（走到最近空格） */
class PlantBehavior extends FarmerBehavior {
  constructor() { super('种植', '🌱', 50); }

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
    if (!available.length) return { log: '', acted: false };

    const [cropType] = available[Math.floor(Math.random() * available.length)];
    const target = this._findEmpty(farmer, game) || { x: farmer.x, y: farmer.y };
    const plot   = game.plots[target.y]?.[target.x];
    if (!plot || plot.crop) return { log: '', acted: false };

    const result = plot.plant(cropType, farmer.fullName);
    if (!result.success) return { log: '', acted: false };

    farmer.seeds[cropType]--;
    if (farmer.seeds[cropType] <= 0) delete farmer.seeds[cropType];

    const cfg = game.getCropConfig(cropType);
    farmer.state         = 'working';
    farmer.emoji         = '🧑‍🌾';
    farmer.currentAction = `种下了 ${cfg.emoji}${cfg.name}`;
    return {
      log:   `${farmer.fullName} 在 (${target.x},${target.y}) 种下了 ${cfg.emoji}${cfg.name} 🌱`,
      acted: true
    };
  }

  _findEmpty(farmer, game) {
    let best = null, minDist = Infinity;
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (!game.plots[y][x].crop) {
          const d = Math.abs(x - farmer.x) + Math.abs(y - farmer.y);
          if (d < minDist) { minDist = d; best = { x, y }; }
        }
      }
    }
    return best;
  }
}

/** 巡视/闲逛（兜底行为，优先级最低） */
class WanderBehavior extends FarmerBehavior {
  constructor() { super('巡视', '🚶', 10); }

  canExecute() { return true; }

  getTarget(farmer, game) {
    // 随机走到一个相邻格
    const dx = Math.floor(Math.random() * 5) - 2;
    const dy = Math.floor(Math.random() * 5) - 2;
    return {
      x: Math.max(0, Math.min(game.width  - 1, farmer.x + dx)),
      y: Math.max(0, Math.min(game.height - 1, farmer.y + dy))
    };
  }

  execute(farmer) {
    farmer.state = 'wandering';
    farmer.emoji = '🧑‍🌾';
    const texts  = ['在农场里溜达', '检查作物状况', '巡视田地', '在地里转转', '看看今天收成'];
    const text   = texts[Math.floor(Math.random() * texts.length)];
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
    this.game        = game;
    this.logCallback = logCallback;

    // 基本信息
    this.name     = options.name || '阿明';
    this.emoji    = '🧑‍🌾';
    this.fullName = `农夫${this.name}`;

    // 地图位置
    this.x = options.startX || 0;
    this.y = options.startY || 0;

    // ---- 行走状态 ----
    /** 当前行走目标格，null = 原地 */
    this.walkTarget         = null;
    /** 到达目标后执行的回调 */
    this.onArriveCallback   = null;

    // 行为状态
    this.state         = 'idle';
    this.currentAction = '准备工作';

    // 农夫库存
    this.seeds = options.seeds || { wheat: 8, carrot: 8, tomato: 6, rice: 4 };
    this.items = options.items || { pesticide: 3 };

    // 行为列表（按优先级降序）
    this.behaviors = [];
    this._registerDefaultBehaviors();

    // 决策间隔：每 28 秒选一次下一步行为
    this.tickIntervalMs = options.tickInterval || 28000;
    // 移动间隔：每格移动耗时（ms），决定走路速度
    this.moveIntervalMs = options.moveInterval || 1600;

    this._tickIntervalId = null;
    this._moveIntervalId = null;
    this._tickCount      = 0;

    // 延迟启动，等游戏完成初始化
    setTimeout(() => this._start(), options.startDelay || 5000);
  }

  // ---------- 行为管理（可拓展） ----------

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

  /** 判断当前是否是夜晚（UTC+8 22:00–06:00） */
  isNightTime() {
    const h = (new Date().getUTCHours() + 8) % 24;
    return h >= 22 || h < 6;
  }

  getTimeString() {
    const now = new Date();
    const h   = String((now.getUTCHours() + 8) % 24).padStart(2, '0');
    const m   = String(now.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  // ---------- LLM 预留接口 ----------

  /**
   * 使用大模型决策下一步行为（目前为 stub，可后续接入 Anthropic / OpenAI 等）
   *
   * 调用时机建议：tick() 开始时调用，返回非 null 则覆盖默认优先级逻辑。
   *
   * @param {object} context  { farmState, farmerState, availableBehaviors }
   * @returns {Promise<{ behaviorName: string, reason: string } | null>}
   *   返回 null 时使用默认优先级逻辑
   */
  async thinkWithAI(context) {
    // TODO: 在此接入大模型 API
    // 示例（伪代码）:
    // const res = await fetch('/api/llm', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     model: 'claude-opus-4-5',
    //     messages: [{ role: 'user', content: JSON.stringify(context) }]
    //   })
    // });
    // const { content } = await res.json();
    // return JSON.parse(content[0].text);
    return null;
  }

  // ---------- 移动系统 ----------

  /**
   * 每 moveIntervalMs 触发一次：向 walkTarget 走一格（曼哈顿）。
   * 到达后调用 onArriveCallback。
   */
  _moveStep() {
    if (!this.walkTarget) return;

    const { x: tx, y: ty } = this.walkTarget;

    // 已到达
    if (this.x === tx && this.y === ty) {
      this.walkTarget = null;
      if (this.onArriveCallback) {
        const cb          = this.onArriveCallback;
        this.onArriveCallback = null;
        try { cb(); } catch (e) { console.error('[Farmer] onArriveCallback error:', e); }
      }
      return;
    }

    // 向目标移动一步（先调整 x，再调整 y）
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
      // 检查是否刚从夜间醒来
      if (!this.isNightTime() && this.state === 'sleeping') {
        this.state         = 'idle';
        this.emoji         = '🧑‍🌾';
        this.currentAction = '起床啦！';
        this._log(`${this.fullName} 从小屋醒来，开始新的一天 🌅`, '🌅', 'farmer');
      }

      // 正在走路，等到达再做下一步决策
      if (this.walkTarget) return;

      // 每 20 tick 补充一批种子
      if (this._tickCount % 20 === 0) this._restockSeeds();

      // （可选）AI 决策：此处为同步调用 stub；如需异步 LLM 可在 stub 里设置 flag
      // const aiChoice = await this.thinkWithAI({ ... }); // 异步版本需重构为 async tick

      // 按优先级执行第一个可执行行为
      for (const beh of this.behaviors) {
        if (!beh.canExecute(this, this.game)) continue;

        const target = beh.getTarget(this, this.game);

        if (target && (target.x !== this.x || target.y !== this.y)) {
          // 需要先走到目标格
          this.walkTarget = target;
          this.state      = 'walking';
          this.currentAction = `前往 (${target.x},${target.y})`;

          this.onArriveCallback = () => {
            const { log, acted } = beh.execute(this, this.game);
            if (acted && log) this._log(log, beh.emoji, 'farmer');
          };
        } else {
          // 原地执行（或无需移动）
          if (target) { this.x = target.x; this.y = target.y; }
          const { log, acted } = beh.execute(this, this.game);
          if (acted && log) this._log(log, beh.emoji, 'farmer');
        }
        break;
      }
    } catch (err) {
      console.error('[Farmer] tick error:', err);
    }
  }

  // ---------- 补仓 ----------

  _restockSeeds() {
    const SEED_PRICES = { wheat: 2, carrot: 3, rice: 8, tomato: 5 };
    for (const [crop, price] of Object.entries(SEED_PRICES)) {
      const cost = price * 5;
      if ((this.seeds[crop] || 0) < 5 && this.game.sharedMoney >= cost) {
        this.seeds[crop] = (this.seeds[crop] || 0) + 5;
        this.game.sharedMoney -= cost;
      }
    }
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

    // 移动循环（快）
    this._moveIntervalId = setInterval(() => this._moveStep(), this.moveIntervalMs);

    // 决策循环（慢）
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

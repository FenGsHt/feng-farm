// 防作弊检查模块
const dataStore = require('./dataStore');

// 操作频率限制配置
const RATE_LIMITS = {
  plant: { maxPerSecond: 2, windowMs: 1000 },
  water: { maxPerSecond: 1, windowMs: 1000 },
  harvest: { maxPerSecond: 2, windowMs: 1000 },
  move: { maxPerSecond: 5, windowMs: 1000 }
};

// 玩家操作记录
const playerActions = new Map();

// 验证操作频率
function checkRateLimit(playerId, actionType) {
  const limit = RATE_LIMITS[actionType];
  if (!limit) return { allowed: true };

  const key = `${playerId}:${actionType}`;
  const now = Date.now();
  
  if (!playerActions.has(key)) {
    playerActions.set(key, []);
  }
  
  const actions = playerActions.get(key);
  // 清理过期的记录
  const validActions = actions.filter(t => now - t < limit.windowMs);
  
  if (validActions.length >= limit.maxPerSecond) {
    return { allowed: false, message: `操作过于频繁，请稍后再试` };
  }
  
  validActions.push(now);
  playerActions.set(key, validActions);
  return { allowed: true };
}

// 验证金币是否足够（服务器端二次验证）
function validateMoney(playerMoney, cost) {
  if (playerMoney < cost) {
    return { valid: false, message: '金币不足' };
  }
  return { valid: true };
}

// 验证位置是否在边界内
function validatePosition(x, y, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return { valid: false, message: '位置超出边界' };
  }
  return { valid: true };
}

// 验证作物状态是否可以操作
function validateCropState(plot, action) {
  switch (action) {
    case 'plant':
      if (plot.crop) {
        return { valid: false, message: '该位置已有作物' };
      }
      break;
    case 'water':
      if (!plot.crop) {
        return { valid: false, message: '没有作物可浇水' };
      }
      if (plot.isWatered) {
        return { valid: false, message: '已经浇过水了' };
      }
      break;
    case 'harvest':
      if (!plot.crop) {
        return { valid: false, message: '没有作物可收获' };
      }
      if (plot.growthStage < 3) {
        return { valid: false, message: '作物还未成熟' };
      }
      break;
  }
  return { valid: true };
}

// 验证玩家状态
function validatePlayerState(player) {
  if (!player) {
    return { valid: false, message: '玩家不存在' };
  }
  if (player.money < 0) {
    return { valid: false, message: '金币异常' };
  }
  return { valid: true };
}

// 全面验证玩家操作
function validateAction(player, plot, action, cost = 0, x, y, width, height) {
  // 1. 验证玩家状态
  const playerCheck = validatePlayerState(player);
  if (!playerCheck.valid) return playerCheck;

  // 2. 验证金币
  if (cost > 0) {
    const moneyCheck = validateMoney(player.money, cost);
    if (!moneyCheck.valid) return moneyCheck;
  }

  // 3. 验证位置
  const posCheck = validatePosition(x, y, width, height);
  if (!posCheck.valid) return posCheck;

  // 4. 验证操作频率
  const rateCheck = checkRateLimit(player.id, action);
  if (!rateCheck.allowed) return rateCheck;

  // 5. 验证作物状态
  const cropCheck = validateCropState(plot, action);
  if (!cropCheck.valid) return cropCheck;

  return { valid: true };
}

// 验证收获奖励（cropType 为已收获的作物类型，此时 plot.crop 已被清空）
function validateHarvestReward(cropType, expectedReward) {
  if (!cropType) return { valid: false, message: '收获奖励异常' };

  const CROP_SELL_PRICES = {
    // 谷物
    wheat: 10,
    corn: 60,
    rice: 45,
    // 蔬菜
    tomato: 25,
    carrot: 15,
    eggplant: 30,
    cucumber: 20,
    pumpkin: 80,
    // 水果
    strawberry: 20,
    watermelon: 50,
    grape: 100,
    apple: 150,
    // 经济作物
    cotton: 70,
    tea: 90
  };

  const sellPrice = CROP_SELL_PRICES[cropType];
  if (sellPrice === undefined || sellPrice !== expectedReward) {
    return { valid: false, message: '收获奖励异常' };
  }

  return { valid: true };
}

// 记录可疑操作
function logSuspiciousAction(playerId, playerName, action, reason, details) {
  dataStore.logAction(playerId, playerName, 'SUSPICIOUS_' + action, { reason, ...details });
  console.warn(`[AntiCheat] Suspicious action detected: ${playerName} - ${action} - ${reason}`);
}

// 清理过期的操作记录（定时任务）
setInterval(() => {
  const now = Date.now();
  for (const [key, actions] of playerActions.entries()) {
    const validActions = actions.filter(t => now - t < 10000); // 保留10秒内的记录
    if (validActions.length === 0) {
      playerActions.delete(key);
    } else {
      playerActions.set(key, validActions);
    }
  }
}, 30000); // 每30秒清理一次

module.exports = {
  checkRateLimit,
  validateMoney,
  validatePosition,
  validateCropState,
  validatePlayerState,
  validateAction,
  validateHarvestReward,
  logSuspiciousAction
};
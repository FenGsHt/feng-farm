// 增量状态同步模块
// 用于计算和同步状态变化，减少网络传输量

// 深度比较两个对象，返回差异
function deepDiff(oldObj, newObj) {
  if (oldObj === newObj) return null;
  if (oldObj === null || newObj === null) return newObj;
  if (typeof oldObj !== typeof newObj) return newObj;
  
  if (Array.isArray(newObj)) {
    if (!Array.isArray(oldObj)) return newObj;
    const diff = [];
    const maxLen = Math.max(oldObj.length, newObj.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= oldObj.length) {
        diff[i] = newObj[i]; // 新增
      } else if (i >= newObj.length) {
        diff[i] = null; // 删除
      } else {
        const d = deepDiff(oldObj[i], newObj[i]);
        if (d !== undefined) diff[i] = d;
      }
    }
    return diff.some(d => d !== undefined) ? diff : undefined;
  }
  
  if (typeof newObj === 'object') {
    const diff = {};
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj)]);
    let hasDiff = false;
    
    for (const key of allKeys) {
      if (!(key in newObj)) {
        diff[key] = undefined; // 删除
        hasDiff = true;
      } else if (!(key in (oldObj || {}))) {
        diff[key] = newObj[key]; // 新增
        hasDiff = true;
      } else {
        const d = deepDiff(oldObj[key], newObj[key]);
        if (d !== undefined) {
          diff[key] = d;
          hasDiff = true;
        }
      }
    }
    
    return hasDiff ? diff : undefined;
  }
  
  return newObj;
}

// 计算游戏状态的增量更新
function computeGameStateDiff(oldState, newState) {
  if (!oldState) return { full: true, state: newState };
  
  const diff = deepDiff(oldState, newState);
  if (diff === undefined) return null; // 无变化
  
  return { full: false, diff };
}

// 玩家位置变化检查
function getPlayerPositionChanges(oldPlayers, newPlayers) {
  const changes = [];
  
  const oldMap = new Map(oldPlayers.map(p => [p.id, p]));
  const newMap = new Map(newPlayers.map(p => [p.id, p]));
  
  for (const [id, newPlayer] of newMap) {
    const oldPlayer = oldMap.get(id);
    if (!oldPlayer) {
      changes.push({ type: 'join', player: newPlayer });
    } else if (oldPlayer.position.x !== newPlayer.position.x || 
               oldPlayer.position.y !== newPlayer.position.y ||
               oldPlayer.money !== newPlayer.money) {
      changes.push({ 
        type: 'update', 
        playerId: id,
        position: newPlayer.position,
        money: newPlayer.money,
        name: newPlayer.name
      });
    }
  }
  
  // 检查离开的玩家
  for (const [id, oldPlayer] of oldMap) {
    if (!newMap.has(id)) {
      changes.push({ type: 'leave', playerId: id });
    }
  }
  
  return changes;
}

// 地块变化检查
function getPlotChanges(oldPlots, newPlots) {
  const changes = [];
  
  for (let y = 0; y < newPlots.length; y++) {
    for (let x = 0; x < newPlots[y].length; x++) {
      const oldPlot = oldPlots?.[y]?.[x];
      const newPlot = newPlots[y][x];
      
      // 检查是否有变化
      if (!oldPlot || 
          oldPlot.crop !== newPlot.crop ||
          oldPlot.growthStage !== newPlot.growthStage ||
          oldPlot.isWatered !== newPlot.isWatered ||
          oldPlot.owner !== newPlot.owner) {
        changes.push({ x, y, plot: newPlot });
      }
    }
  }
  
  return changes;
}

// 增量同步管理器
class IncrementalSync {
  constructor() {
    this.lastStates = new Map(); // roomId -> last state
    this.clientVersions = new Map(); // socketId -> last sync version
  }

  // 获取或初始化房间的最后一个状态
  getLastState(roomId) {
    return this.lastStates.get(roomId);
  }

  // 更新房间的最后状态
  updateLastState(roomId, state) {
    this.lastStates.set(roomId, state);
  }

  // 计算增量更新
  computeUpdate(roomId, newState) {
    const oldState = this.lastStates.get(roomId);
    
    if (!oldState) {
      this.lastStates.set(roomId, newState);
      return { type: 'full', state: newState };
    }
    
    // 计算增量
    const update = {
      type: 'incremental',
      timestamp: Date.now(),
      players: getPlayerPositionChanges(oldState.players, newState.players),
      plots: getPlotChanges(oldState.plots, newState.plots)
    };
    
    // 如果没有变化
    if (update.players.length === 0 && update.plots.length === 0) {
      return null;
    }
    
    // 更新最后状态
    this.lastStates.set(roomId, newState);
    
    return update;
  }

  // 清理房间状态
  clearRoom(roomId) {
    this.lastStates.delete(roomId);
  }

  // 客户端确认同步
  confirmSync(socketId, roomId, version) {
    this.clientVersions.set(`${roomId}:${socketId}`, version);
  }

  // 获取客户端版本
  getClientVersion(socketId, roomId) {
    return this.clientVersions.get(`${roomId}:${socketId}`);
  }
}

module.exports = {
  deepDiff,
  computeGameStateDiff,
  getPlayerPositionChanges,
  getPlotChanges,
  IncrementalSync
};
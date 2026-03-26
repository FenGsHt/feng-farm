// 数据持久化模块 - 玩家数据存储
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const PLAYER_STATS_FILE = path.join(DATA_DIR, 'player_stats.json');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const ROOMS_DIR = path.join(DATA_DIR, 'rooms'); // 房间游戏状态目录

// 内存缓存（避免每次操作都读写磁盘）
let playersCache = null;
let playerStatsCache = null;
let cachesDirty = false;
let statsCacheDirty = false;

// 房间游戏状态缓存
const roomStateCache = new Map();  // roomId -> state object
const roomStateDirty = new Set();  // 需要写盘的 roomId

// 操作日志内存上限
const MAX_ACTION_LOGS = 500;

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(ROOMS_DIR)) {
    fs.mkdirSync(ROOMS_DIR, { recursive: true });
  }
}

// 将 roomId 转为安全的文件名（支持中文）
function sanitizeRoomId(roomId) {
  // 只保留字母/数字/下划线/中文/连字符，截断到50字符
  return String(roomId).replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 50);
}

// ========== 房间游戏状态持久化 ==========

// 读取房间状态（优先内存缓存，次则磁盘）
function getRoomState(roomId) {
  if (roomStateCache.has(roomId)) return roomStateCache.get(roomId);
  ensureDataDir();
  const file = path.join(ROOMS_DIR, `${sanitizeRoomId(roomId)}.json`);
  try {
    if (fs.existsSync(file)) {
      const state = JSON.parse(fs.readFileSync(file, 'utf-8'));
      roomStateCache.set(roomId, state);
      console.log(`[DataStore] Loaded room state: ${roomId}`);
      return state;
    }
  } catch (err) {
    console.error(`[DataStore] Failed to load room state "${roomId}":`, err.message);
  }
  return null;
}

// 保存房间状态到缓存并标记为脏
function saveRoomState(roomId, state) {
  roomStateCache.set(roomId, state);
  roomStateDirty.add(roomId);
}

// 从磁盘加载玩家缓存（仅在启动时调用一次）
function initPlayersCache() {
  if (playersCache !== null) return;
  ensureDataDir();
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const data = fs.readFileSync(PLAYERS_FILE, 'utf-8');
      playersCache = JSON.parse(data);
    } else {
      playersCache = {};
    }
  } catch (err) {
    console.error('[DataStore] Failed to load players:', err.message);
    playersCache = {};
  }
}

// 从磁盘加载统计缓存（仅在启动时调用一次）
function initStatsCache() {
  if (playerStatsCache !== null) return;
  ensureDataDir();
  try {
    if (fs.existsSync(PLAYER_STATS_FILE)) {
      const data = fs.readFileSync(PLAYER_STATS_FILE, 'utf-8');
      playerStatsCache = JSON.parse(data);
    } else {
      playerStatsCache = {};
    }
  } catch (err) {
    console.error('[DataStore] Failed to load player stats:', err.message);
    playerStatsCache = {};
  }
}

// 读取所有玩家数据（从缓存）
function loadPlayers() {
  initPlayersCache();
  return playersCache;
}

// 写入玩家数据到磁盘
function savePlayers(players) {
  ensureDataDir();
  try {
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[DataStore] Failed to save players:', err.message);
    return false;
  }
}

// 获取单个玩家数据（从缓存）
function getPlayer(playerId) {
  initPlayersCache();
  return playersCache[playerId] || null;
}

// 保存单个玩家数据（写入缓存，标记为脏）
function savePlayer(playerId, playerData) {
  initPlayersCache();
  playersCache[playerId] = {
    ...playersCache[playerId],
    ...playerData,
    lastSaveTime: Date.now()
  };
  cachesDirty = true;
  return true;
}

// 更新玩家金币
function updatePlayerMoney(playerId, money) {
  return savePlayer(playerId, { money });
}

// 更新玩家名称
function updatePlayerName(playerId, name) {
  return savePlayer(playerId, { name });
}

// 获取玩家统计数据（从缓存）
function getPlayerStats(playerId) {
  initStatsCache();
  return playerStatsCache[playerId] || null;
}

// 保存玩家统计数据（写入缓存，标记为脏）
function savePlayerStats(playerId, statsData) {
  initStatsCache();
  playerStatsCache[playerId] = {
    ...playerStatsCache[playerId],
    ...statsData,
    lastUpdate: Date.now()
  };
  statsCacheDirty = true;
  return true;
}

// 立即将缓存刷新到磁盘
function flushToDisk() {
  if (cachesDirty && playersCache !== null) {
    savePlayers(playersCache);
    cachesDirty = false;
  }
  if (statsCacheDirty && playerStatsCache !== null) {
    ensureDataDir();
    try {
      fs.writeFileSync(PLAYER_STATS_FILE, JSON.stringify(playerStatsCache, null, 2), 'utf-8');
      statsCacheDirty = false;
    } catch (err) {
      console.error('[DataStore] Failed to save player stats:', err.message);
    }
  }
  // 刷新所有脏房间状态
  if (roomStateDirty.size > 0) {
    ensureDataDir();
    for (const roomId of roomStateDirty) {
      const state = roomStateCache.get(roomId);
      if (!state) continue;
      const file = path.join(ROOMS_DIR, `${sanitizeRoomId(roomId)}.json`);
      try {
        fs.writeFileSync(file, JSON.stringify(state), 'utf-8');
      } catch (err) {
        console.error(`[DataStore] Failed to save room state "${roomId}":`, err.message);
      }
    }
    roomStateDirty.clear();
  }
}

// 玩家操作日志（内存有上限）
const actionLogs = [];

function logAction(playerId, playerName, action, details) {
  const log = {
    timestamp: Date.now(),
    playerId,
    playerName,
    action,
    details
  };

  actionLogs.push(log);
  // 超过上限时删除最旧的条目
  if (actionLogs.length > MAX_ACTION_LOGS) {
    actionLogs.splice(0, actionLogs.length - MAX_ACTION_LOGS);
  }

  // 异步写入日志文件（不阻塞主逻辑）
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `${today}.json`);
  setImmediate(() => {
    try {
      let logs = [];
      if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      }
      logs.push(log);
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DataStore] Failed to write log:', err.message);
    }
  });

  return log;
}

// 获取玩家操作日志
function getPlayerLogs(playerId, limit = 50) {
  const logs = actionLogs.filter(l => l.playerId === playerId);
  return logs.slice(-limit);
}

// 从文件加载历史日志到内存（启动时调用）
function loadTodayLogs() {
  ensureDataDir();
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `${today}.json`);

  try {
    if (fs.existsSync(logFile)) {
      const logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      // 只保留最近 MAX_ACTION_LOGS 条
      const recent = logs.slice(-MAX_ACTION_LOGS);
      actionLogs.push(...recent);
    }
  } catch (err) {
    console.error('[DataStore] Failed to load today logs:', err.message);
  }
}

// 定期将缓存刷新到磁盘（每5秒）
setInterval(flushToDisk, 5000);

// 进程退出时强制刷新
process.on('exit', flushToDisk);
process.on('SIGINT', () => { flushToDisk(); process.exit(); });
process.on('SIGTERM', () => { flushToDisk(); process.exit(); });

// 初始化
ensureDataDir();
initPlayersCache();
initStatsCache();
loadTodayLogs();

module.exports = {
  loadPlayers,
  savePlayers,
  getPlayer,
  savePlayer,
  updatePlayerMoney,
  updatePlayerName,
  getPlayerStats,
  savePlayerStats,
  flushToDisk,
  logAction,
  getPlayerLogs,
  // 房间状态持久化
  getRoomState,
  saveRoomState
};

// 数据持久化模块 - 玩家数据存储
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const PLAYER_STATS_FILE = path.join(DATA_DIR, 'player_stats.json');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// 读取玩家数据
function loadPlayers() {
  ensureDataDir();
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const data = fs.readFileSync(PLAYERS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[DataStore] Failed to load players:', err.message);
  }
  return {};
}

// 保存玩家数据
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

// 获取玩家数据
function getPlayer(playerId) {
  const players = loadPlayers();
  return players[playerId] || null;
}

// 保存玩家数据
function savePlayer(playerId, playerData) {
  const players = loadPlayers();
  players[playerId] = {
    ...players[playerId],
    ...playerData,
    lastSaveTime: Date.now()
  };
  return savePlayers(players);
}

// 更新玩家金币
function updatePlayerMoney(playerId, money) {
  return savePlayer(playerId, { money });
}

// 更新玩家名称
function updatePlayerName(playerId, name) {
  return savePlayer(playerId, { name });
}

// 读取玩家统计数据
function loadPlayerStats() {
  ensureDataDir();
  try {
    if (fs.existsSync(PLAYER_STATS_FILE)) {
      const data = fs.readFileSync(PLAYER_STATS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[DataStore] Failed to load player stats:', err.message);
  }
  return {};
}

// 保存玩家统计数据
function savePlayerStatsToFile(playerStats) {
  ensureDataDir();
  try {
    fs.writeFileSync(PLAYER_STATS_FILE, JSON.stringify(playerStats, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[DataStore] Failed to save player stats:', err.message);
    return false;
  }
}

// 获取玩家统计数据
function getPlayerStats(playerId) {
  const stats = loadPlayerStats();
  return stats[playerId] || null;
}

// 保存玩家统计数据
function savePlayerStats(playerId, statsData) {
  const stats = loadPlayerStats();
  stats[playerId] = {
    ...stats[playerId],
    ...statsData,
    lastUpdate: Date.now()
  };
  return savePlayerStatsToFile(stats);
}

// 玩家操作日志
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
  
  // 写入日志文件
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `${today}.json`);
  
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
  
  return log;
}

// 获取玩家操作日志
function getPlayerLogs(playerId, limit = 50) {
  const logs = actionLogs.filter(l => l.playerId === playerId);
  return logs.slice(-limit);
}

// 从文件加载历史日志
function loadTodayLogs() {
  ensureDataDir();
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `${today}.json`);
  
  try {
    if (fs.existsSync(logFile)) {
      const logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      actionLogs.push(...logs);
    }
  } catch (err) {
    console.error('[DataStore] Failed to load today logs:', err.message);
  }
}

// 初始化
ensureDataDir();
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
  logAction,
  getPlayerLogs
};
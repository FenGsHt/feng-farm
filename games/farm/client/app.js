// 多人种田游戏前端 - 简化版（单农场模式）
const SERVER_URL = window.location.origin;
const DEFAULT_ROOM = 'Feng Farm';
const PLAYER_NAME_KEY = 'fengfarm_player_name';

// 游戏配置
const CONFIG = {
  initialMoney: 50,
  cellSize: 45,
  maxGridWidth: 400,
  animationDuration: 300
};

let socket = null;
let currentRoom = null;
let currentPlayer = null;
let currentPlayerName = '';
let gameState = null;

// DOM 元素
const nameModal = document.getElementById('name-modal');
const createModal = document.getElementById('create-modal');
const mainScreen = document.getElementById('main-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name-input');
const startBtn = document.getElementById('start-btn');
const roomNameInput = document.getElementById('room-name-input');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');
const roomListDiv = document.getElementById('room-list');
const farmGrid = document.getElementById('farm-grid');
const playersLayer = document.getElementById('players-layer');
const playersList = document.getElementById('players-list');
const moneyDisplay = document.getElementById('money-display');
const roomNameDisplay = document.getElementById('room-name');
const farmSizeDisplay = document.getElementById('farm-size');
const onlineCount = document.getElementById('online-count');
const notification = document.getElementById('notification');

// 初始化 Socket
function initSocket() {
  socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('[Farm] Connected to server');
    if (currentPlayerName) {
      joinDefaultRoom();
    }
  });

  socket.on('disconnect', () => {
    showNotification('连接断开，正在重连...');
  });

  socket.on('room-list', (rooms) => {
    renderRoomList(rooms);
  });

  socket.on('game-state', (state) => {
    updateGameState(state);
  });

  socket.on('player-info', (player) => {
    currentPlayer = player;
    updatePlayerInfo();
  });

  socket.on('action-result', (result) => {
    if (result.success) {
      showNotification(`✅ ${result.message}`, 'success');
    } else {
      showNotification(`❌ ${result.message}`, 'error');
    }
  });

  socket.on('notification', (data) => {
    showNotification(data.message);
  });

  socket.on('error', (error) => {
    showNotification(error.message || '发生错误', 'error');
  });
}

// 渲染房间列表
function renderRoomList(rooms) {
  if (!roomListDiv) return;
  if (!rooms || rooms.length === 0) {
    roomListDiv.innerHTML = '<div class="room-empty">暂无农场，创建一个吧！</div>';
    return;
  }

  roomListDiv.innerHTML = '';
  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    const playerNames = room.players.slice(0, 3).join('、') + (room.players.length > 3 ? '...' : '');
    card.innerHTML = `
      <div class="room-card-info">
        <div class="room-card-name">🏡 ${room.roomId}</div>
        <div class="room-card-players">👥 ${room.playerCount}人${playerNames ? `：${playerNames}` : ''}</div>
      </div>
      <button class="btn-join">加入</button>
    `;
    card.querySelector('.btn-join').addEventListener('click', () => joinRoom(room.roomId));
    roomListDiv.appendChild(card);
  });
}

// 加入默认房间
function joinDefaultRoom() {
  currentRoom = DEFAULT_ROOM;
  socket.emit('join-room', { roomId: DEFAULT_ROOM, playerName: currentPlayerName });
}

// 加入房间
function joinRoom(roomId) {
  const playerName = playerNameInput?.value?.trim() || currentPlayerName || '匿名农夫';
  currentRoom = roomId;
  socket.emit('join-room', { roomId, playerName });
}

// 创建房间
function createRoom() {
  const playerName = playerNameInput?.value?.trim() || currentPlayerName || '匿名农夫';
  const roomId = roomNameInput?.value?.trim() || `${playerName}的农场`;
  const width = parseInt(widthInput?.value) || 12;
  const height = parseInt(heightInput?.value) || 12;
  currentRoom = roomId;
  socket.emit('join-room', { roomId, playerName, width, height });
  createModal.classList.add('hidden');
}

// 更新游戏状态
function updateGameState(state) {
  gameState = state;
  renderFarm();
  renderPlayers();
  renderPlayerList();
  updateOnlineCount();
  updateMoneyDisplay();
}

// 更新金币显示（带动画）
function updateMoneyDisplay() {
  if (!gameState || !currentPlayer) return;
  
  const player = gameState.players.find(p => p.id === currentPlayer.id);
  if (!player || !moneyDisplay) return;
  
  const currentMoney = parseInt(moneyDisplay.textContent.replace(/[^0-9]/g, '')) || 0;
  const newMoney = player.money;
  
  if (currentMoney !== newMoney) {
    // 金币变化动画
    moneyDisplay.classList.add('money-changed');
    setTimeout(() => moneyDisplay.classList.remove('money-changed'), 300);
    
    moneyDisplay.textContent = `💰 ${newMoney}`;
    currentPlayer.money = newMoney;
  }
}

// 当前选中的地块
let selectedPlot = null;

// 渲染农场地图
function renderFarm() {
  if (!gameState || !farmGrid) return;

  const { width, height, plots, crops: cropConfig } = gameState;
  const cellSize = Math.min(CONFIG.cellSize, Math.min(CONFIG.maxGridWidth / width, CONFIG.maxGridWidth / height));

  // 只在首次渲染或尺寸变化时更新 grid 样式
  if (farmGrid.dataset.width !== String(width) || farmGrid.dataset.height !== String(height)) {
    farmGrid.style.gridTemplateColumns = `repeat(${width}, ${cellSize}px)`;
    farmGrid.style.gridTemplateRows = `repeat(${height}, ${cellSize}px)`;
    farmGrid.dataset.width = width;
    farmGrid.dataset.height = height;
    farmGrid.innerHTML = '';
  }

  // 更新或创建格子
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const plot = plots[y][x];
      const cellId = `plot-${x}-${y}`;
      let cell = document.getElementById(cellId);
      
      // 创建新格子
      if (!cell) {
        cell = document.createElement('div');
        cell.id = cellId;
        cell.className = 'plot-cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
        
        // 点击移动
        cell.addEventListener('click', () => {
          if (currentPlayer && socket) {
            socket.emit('move', { x, y });
            highlightPlot(x, y);
          }
        });
        
        // 悬停显示信息
        cell.addEventListener('mouseenter', (e) => showPlotTooltip(e, plot, cropConfig));
        cell.addEventListener('mouseleave', hidePlotTooltip);
        
        farmGrid.appendChild(cell);
      }

      // 更新土壤颜色（湿度越高越深）
      const moistureRatio = plot.soilMoisture / 100;
      const r = Math.floor(139 + moistureRatio * 60);
      const g = Math.floor(119 + moistureRatio * 60);
      const b = Math.floor(101 + moistureRatio * 40);
      cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

      // 更新作物显示
      const oldCrop = cell.dataset.crop;
      const newCrop = plot.crop || '';
      
      if (oldCrop !== newCrop || cell.dataset.growthStage !== String(plot.growthStage)) {
        cell.dataset.crop = newCrop;
        cell.dataset.growthStage = plot.growthStage;
        cell.innerHTML = ''; // 清除旧内容
        
        if (plot.crop) {
          cell.classList.add('has-crop');
          
          // 生长阶段图标
          const stageEmojis = ['🌱', '🌿', '🌾', cropConfig[plot.crop]?.emoji || '🌾'];
          const emoji = stageEmojis[plot.growthStage] || stageEmojis[3];
          
          const cropSpan = document.createElement('span');
          cropSpan.className = 'crop-emoji';
          cropSpan.textContent = emoji;
          cell.appendChild(cropSpan);

          // 浇水标记
          if (plot.isWatered) {
            cell.classList.add('watered');
            const waterMark = document.createElement('span');
            waterMark.className = 'water-mark';
            waterMark.textContent = '💧';
            cell.appendChild(waterMark);
          } else {
            cell.classList.remove('watered');
          }

          // 成熟发光效果
          if (plot.growthStage >= 3) {
            cell.classList.add('ready');
          } else {
            cell.classList.remove('ready');
          }
        } else {
          cell.classList.remove('has-crop', 'watered', 'ready');
        }
      }
    }
  }

  // 更新 farm size 显示
  if (farmSizeDisplay) {
    farmSizeDisplay.textContent = `${width}×${height}`;
  }
}

// 高亮选中的地块
function highlightPlot(x, y) {
  document.querySelectorAll('.plot-cell').forEach(cell => {
    cell.classList.remove('selected');
  });
  const cell = document.getElementById(`plot-${x}-${y}`);
  if (cell) {
    cell.classList.add('selected');
    selectedPlot = { x, y };
  }
}

// 显示地块信息提示
function showPlotTooltip(e, plot, cropConfig) {
  const tooltip = document.getElementById('plot-tooltip') || createTooltip();
  
  let content = '';
  if (plot.crop && cropConfig[plot.crop]) {
    const crop = cropConfig[plot.crop];
    const stageNames = ['种子', '幼苗', '生长中', '成熟'];
    content = `
      <div class="tooltip-title">${crop.emoji} ${crop.name}</div>
      <div class="tooltip-row">阶段: ${stageNames[plot.growthStage]}</div>
      <div class="tooltip-row">湿度: ${plot.soilMoisture}%</div>
      <div class="tooltip-row">${plot.isWatered ? '💧 已浇水' : '💧 未浇水'}</div>
      ${plot.growthStage >= 3 ? `<div class="tooltip-row ready-text">✨ 可收获 (+${crop.sellPrice}💰)</div>` : ''}
    `;
  } else {
    content = `
      <div class="tooltip-title">🟫 空地</div>
      <div class="tooltip-row">湿度: ${plot.soilMoisture}%</div>
      <div class="tooltip-row">点击移动至此</div>
    `;
  }
  
  tooltip.innerHTML = content;
  tooltip.classList.remove('hidden');
  
  // 定位提示框
  const rect = e.target.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
}

// 隐藏地块提示
function hidePlotTooltip() {
  const tooltip = document.getElementById('plot-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

// 创建提示框
function createTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'plot-tooltip';
  tooltip.className = 'plot-tooltip hidden';
  document.body.appendChild(tooltip);
  return tooltip;
}

// 渲染玩家位置
function renderPlayers() {
  if (!gameState || !playersLayer) return;

  playersLayer.innerHTML = '';
  const { width, height, players } = gameState;
  const cellSize = Math.min(50, Math.min(400 / width, 400 / height));

  players.forEach(player => {
    const marker = document.createElement('div');
    marker.className = 'player-marker';
    if (currentPlayer && player.id === currentPlayer.id) {
      marker.classList.add('current');
    }
    
    const x = player.position.x * cellSize + cellSize / 2;
    const y = player.position.y * cellSize + cellSize / 2;
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.style.backgroundColor = player.color;
    marker.title = player.name;

    // 玩家名
    const nameLabel = document.createElement('span');
    nameLabel.className = 'player-name';
    nameLabel.textContent = player.name;
    nameLabel.style.backgroundColor = player.color;
    marker.appendChild(nameLabel);

    playersLayer.appendChild(marker);
  });
}

// 渲染玩家位置（带平滑动画）
const playerElements = new Map();

function renderPlayers() {
  if (!gameState || !playersLayer || !farmGrid) return;

  const { width, height, players } = gameState;
  const cellSize = Math.min(CONFIG.cellSize, Math.min(CONFIG.maxGridWidth / width, CONFIG.maxGridWidth / height));

  // 更新或创建玩家标记
  players.forEach(player => {
    let marker = playerElements.get(player.id);
    
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'player-marker';
      marker.id = `player-${player.id}`;
      
      // 玩家颜色圆点
      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.backgroundColor = player.color;
      marker.appendChild(dot);
      
      // 玩家名标签
      const nameLabel = document.createElement('span');
      nameLabel.className = 'player-name-label';
      nameLabel.textContent = player.name;
      nameLabel.style.backgroundColor = player.color;
      marker.appendChild(nameLabel);
      
      // 标记当前玩家
      if (currentPlayer && player.id === currentPlayer.id) {
        marker.classList.add('current-player');
        nameLabel.textContent += ' (你)';
      }
      
      playersLayer.appendChild(marker);
      playerElements.set(player.id, marker);
    }
    
    // 计算位置（带偏移使标记居中在格子上）
    const targetX = player.position.x * cellSize + cellSize / 2;
    const targetY = player.position.y * cellSize + cellSize / 2;
    
    // 使用 CSS transition 实现平滑移动
    marker.style.transition = `all ${CONFIG.animationDuration}ms ease-out`;
    marker.style.left = `${targetX}px`;
    marker.style.top = `${targetY}px`;
    marker.style.width = `${cellSize * 0.6}px`;
    marker.style.height = `${cellSize * 0.6}px`;
  });
  
  // 移除离线的玩家标记
  playerElements.forEach((marker, playerId) => {
    if (!players.find(p => p.id === playerId)) {
      marker.remove();
      playerElements.delete(playerId);
    }
  });
}

// 渲染在线玩家列表（侧边栏）
function renderPlayerList() {
  if (!gameState || !playersList) return;

  // 保留现有元素，只更新数据
  const existingBadges = new Map();
  playersList.querySelectorAll('.player-badge').forEach(badge => {
    const id = badge.dataset.playerId;
    if (id) existingBadges.set(id, badge);
  });
  
  gameState.players.forEach(player => {
    let badge = existingBadges.get(player.id);
    
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'player-badge';
      badge.dataset.playerId = player.id;
      
      const colorDot = document.createElement('span');
      colorDot.className = 'player-dot';
      colorDot.style.backgroundColor = player.color;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      
      const moneySpan = document.createElement('span');
      moneySpan.className = 'player-money';
      
      badge.appendChild(colorDot);
      badge.appendChild(nameSpan);
      badge.appendChild(moneySpan);
      playersList.appendChild(badge);
    }
    
    // 更新内容
    badge.classList.toggle('current', currentPlayer && player.id === currentPlayer.id);
    badge.querySelector('.player-name').textContent = player.name;
    badge.querySelector('.player-money').textContent = `💰${player.money}`;
  });
  
  // 移除离线的玩家
  existingBadges.forEach((badge, playerId) => {
    if (!gameState.players.find(p => p.id === playerId)) {
      badge.remove();
    }
  });
}

// 更新玩家信息
function updatePlayerInfo() {
  if (!currentPlayer) return;
  
  if (moneyDisplay) {
    moneyDisplay.textContent = `💰 ${currentPlayer.money}`;
  }
  
  if (roomNameDisplay && currentRoom) {
    roomNameDisplay.textContent = currentRoom;
  }
}

// 更新在线人数
function updateOnlineCount() {
  if (!gameState || !onlineCount) return;
  onlineCount.textContent = `👥 ${gameState.players.length}`;
}

// 显示通知
function showNotification(message, type = 'info') {
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.remove('hidden');

  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

// 切换到游戏界面
function switchToGame() {
  mainScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  nameModal.classList.add('hidden');
  createModal.classList.add('hidden');
}

// 离开房间
function leaveRoom() {
  if (socket) {
    socket.emit('leave-room');
  }
  currentRoom = null;
  currentPlayer = null;
  gameState = null;
  
  gameScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  
  // 显示名字输入
  nameModal.classList.remove('hidden');
  playerNameInput.value = '';
  setTimeout(() => playerNameInput.focus(), 100);
}

// 事件绑定
startBtn?.addEventListener('click', () => {
  const name = playerNameInput?.value?.trim();
  if (!name) {
    playerNameInput.focus();
    return;
  }
  currentPlayerName = name.slice(0, 12);
  localStorage.setItem(PLAYER_NAME_KEY, currentPlayerName);
  nameModal.classList.add('hidden');
  
  if (socket && socket.connected) {
    joinDefaultRoom();
  }
});

playerNameInput?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startBtn.click();
});

document.getElementById('create-room-btn')?.addEventListener('click', () => {
  createModal.classList.remove('hidden');
});

document.getElementById('cancel-create-btn')?.addEventListener('click', () => {
  createModal.classList.add('hidden');
});

document.getElementById('confirm-create-btn')?.addEventListener('click', createRoom);

// 简化版：不需要刷新和离开按钮

// 作物按钮
document.getElementById('plant-wheat')?.addEventListener('click', () => socket?.emit('plant', { cropType: 'wheat' }));
document.getElementById('plant-tomato')?.addEventListener('click', () => socket?.emit('plant', { cropType: 'tomato' }));
document.getElementById('plant-corn')?.addEventListener('click', () => socket?.emit('plant', { cropType: 'corn' }));

// 操作按钮
document.getElementById('water-btn')?.addEventListener('click', () => socket?.emit('water'));
document.getElementById('harvest-btn')?.addEventListener('click', () => socket?.emit('harvest'));
document.getElementById('reset-btn')?.addEventListener('click', () => socket?.emit('new-farm'));

// 初始化 - 简化版：自动进入农场
function init() {
  const savedName = localStorage.getItem(PLAYER_NAME_KEY);
  
  // 自动恢复名字或显示输入框
  if (savedName) {
    currentPlayerName = savedName;
    nameModal.classList.add('hidden');
    initSocket();
    // 连接成功后自动加入
    setTimeout(() => {
      if (socket?.connected) {
        joinDefaultRoom();
      }
    }, 500);
  } else {
    nameModal.classList.remove('hidden');
    setTimeout(() => playerNameInput?.focus(), 100);
    initSocket();
  }
  
  // 监听游戏状态，自动切换到游戏界面
  socket?.on('game-state', (state) => {
    updateGameState(state);
    if (currentRoom && mainScreen?.classList.contains('hidden') === false) {
      switchToGame();
    }
  });
}

// 键盘控制
document.addEventListener('keydown', (e) => {
  // 如果不在游戏界面，不响应键盘
  if (!gameScreen || !gameScreen.classList.contains('hidden') === false) return;
  if (!currentPlayer || !gameState || !socket) return;
  
  const { width, height } = gameState;
  const x = currentPlayer.position.x;
  const y = currentPlayer.position.y;
  
  let newX = x;
  let newY = y;
  let handled = false;
  
  switch (e.key) {
    // WASD 或方向键移动
    case 'w':
    case 'W':
    case 'ArrowUp':
      newY = Math.max(0, y - 1);
      handled = true;
      break;
    case 's':
    case 'S':
    case 'ArrowDown':
      newY = Math.min(height - 1, y + 1);
      handled = true;
      break;
    case 'a':
    case 'A':
    case 'ArrowLeft':
      newX = Math.max(0, x - 1);
      handled = true;
      break;
    case 'd':
    case 'D':
    case 'ArrowRight':
      newX = Math.min(width - 1, x + 1);
      handled = true;
      break;
    // 空格键浇水
    case ' ':
      e.preventDefault();
      socket.emit('water');
      showNotification('💧 浇水', 'info');
      handled = true;
      break;
    // Enter键收获
    case 'Enter':
      socket.emit('harvest');
      showNotification('🌾 收获', 'info');
      handled = true;
      break;
    default:
      return; // 其他键不阻止默认行为
  }
  
  if (handled) {
    e.preventDefault();
    // 移动
    if (newX !== x || newY !== y) {
      socket.emit('move', { x: newX, y: newY });
      highlightPlot(newX, newY);
    }
  }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

console.log('[Farm] Client initialized');
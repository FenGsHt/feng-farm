// 多人种田游戏前端
const SERVER_URL = 'http://150.158.110.168:3007';
const DEFAULT_ROOM = '公共农场';
const PLAYER_NAME_KEY = 'fengfarm_player_name';

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
  updateOnlineCount();
}

// 渲染农场地图
function renderFarm() {
  if (!gameState || !farmGrid) return;

  const { width, height, plots } = gameState;
  const cellSize = Math.min(50, Math.min(400 / width, 400 / height));

  farmGrid.style.gridTemplateColumns = `repeat(${width}, ${cellSize}px)`;
  farmGrid.style.gridTemplateRows = `repeat(${height}, ${cellSize}px)`;
  farmGrid.innerHTML = '';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const plot = plots[y][x];
      const cell = document.createElement('div');
      cell.className = 'plot-cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      // 土壤颜色（湿度越高越深）
      const moistureColor = Math.floor(plot.soilMoisture * 2.55);
      cell.style.backgroundColor = `rgb(${139 + moistureColor}, ${119 + moistureColor}, 101)`;

      // 显示作物
      if (plot.crop) {
        cell.classList.add('has-crop');
        
        // 生长阶段显示
        const stages = ['🌱', '🌿', '🌾', plot.emoji];
        cell.textContent = stages[plot.growthStage] || plot.emoji;

        // 浇水状态
        if (plot.isWatered) {
          cell.classList.add('watered');
        }

        // 成熟状态
        if (plot.growthStage >= 3) {
          cell.classList.add('ready');
        }
      }

      // 点击移动
      cell.addEventListener('click', () => {
        if (currentPlayer) {
          socket.emit('move', { x, y });
        }
      });

      farmGrid.appendChild(cell);
    }
  }

  // 更新 farm size 显示
  if (farmSizeDisplay) {
    farmSizeDisplay.textContent = `${width}×${height}`;
  }
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

// 渲染在线玩家列表
function renderPlayers() {
  if (!gameState || !playersList) return;

  playersList.innerHTML = '';
  gameState.players.forEach(player => {
    const badge = document.createElement('div');
    badge.className = 'player-badge';
    if (currentPlayer && player.id === currentPlayer.id) {
      badge.classList.add('current');
    }

    const colorDot = document.createElement('span');
    colorDot.className = 'player-dot';
    colorDot.style.backgroundColor = player.color;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;

    const moneySpan = document.createElement('span');
    moneySpan.className = 'player-money';
    moneySpan.textContent = `💰${player.money}`;

    badge.appendChild(colorDot);
    badge.appendChild(nameSpan);
    badge.appendChild(moneySpan);
    playersList.appendChild(badge);
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

document.getElementById('refresh-rooms-btn')?.addEventListener('click', () => {
  socket?.emit('get-rooms');
});

document.getElementById('leave-btn')?.addEventListener('click', leaveRoom);

// 作物按钮
document.getElementById('plant-wheat')?.addEventListener('click', () => socket?.emit('plant', { cropType: 'wheat' }));
document.getElementById('plant-tomato')?.addEventListener('click', () => socket?.emit('plant', { cropType: 'tomato' }));
document.getElementById('plant-corn')?.addEventListener('click', () => socket?.emit('plant', { cropType: 'corn' }));

// 操作按钮
document.getElementById('water-btn')?.addEventListener('click', () => socket?.emit('water'));
document.getElementById('harvest-btn')?.addEventListener('click', () => socket?.emit('harvest'));
document.getElementById('reset-btn')?.addEventListener('click', () => socket?.emit('new-farm'));

// 初始化
function init() {
  const savedName = localStorage.getItem(PLAYER_NAME_KEY);
  if (savedName) {
    currentPlayerName = savedName;
    nameModal.classList.add('hidden');
  } else {
    nameModal.classList.remove('hidden');
    setTimeout(() => playerNameInput.focus(), 100);
  }
  
  initSocket();
  
  // 监听游戏状态变化，切换界面
  const originalEmit = socket?.emit;
  socket?.on('game-state', (state) => {
    updateGameState(state);
    if (currentRoom && gameScreen.classList.contains('hidden')) {
      switchToGame();
    }
  });
}

init();

console.log('[Farm] Client initialized');
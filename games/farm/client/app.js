// 多人种田游戏前端 - 简化版（单农场模式）
const SERVER_URL = window.location.origin;
const DEFAULT_ROOM = 'Feng Farm';
const PLAYER_NAME_KEY = 'fengfarm_player_name';

// 游戏配置
const CONFIG = {
  initialMoney: 50,
  cellSize: 60,
  maxGridWidth: 600,
  animationDuration: 300
};

let socket = null;
let currentRoom = null;
let currentPlayer = null;
let currentPlayerName = '';
let gameState = null;
let currentShopTab = 'seeds';

// 当前选中的操作工具 { btnId, type, label, emoji, sound, emit }
let selectedTool = null;

// 用 Canvas 把 emoji 渲染成光标 dataURL（比 SVG data URI 更可靠）
function makeEmojiCursor(emoji, size = 36) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = `${size - 4}px serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(emoji, 1, size - 1);
  // hotspot 在 emoji 中心底部
  return `url(${canvas.toDataURL()}) ${size / 2} ${size - 2}, auto`;
}

function selectTool(config) {
  if (selectedTool && selectedTool.btnId === config.btnId) {
    clearTool();
    return;
  }
  clearTool();
  selectedTool = config;

  const btn = document.getElementById(config.btnId);
  if (btn) btn.classList.add('tool-active');

  const farmGrid = document.getElementById('farm-grid');
  if (farmGrid) {
    farmGrid.dataset.toolCursor = config.type;
    farmGrid.style.cursor = makeEmojiCursor(config.emoji);
  }

  const indicator = document.getElementById('active-tool-indicator');
  if (indicator) {
    indicator.innerHTML = `${config.emoji} <strong>${config.label}</strong>&nbsp;&nbsp;<kbd>Esc</kbd> 取消`;
    indicator.classList.add('visible');
  }
}

function clearTool() {
  if (!selectedTool) return;
  const btn = document.getElementById(selectedTool.btnId);
  if (btn) btn.classList.remove('tool-active');

  const farmGrid = document.getElementById('farm-grid');
  if (farmGrid) {
    delete farmGrid.dataset.toolCursor;
    farmGrid.style.cursor = '';
  }

  const indicator = document.getElementById('active-tool-indicator');
  if (indicator) indicator.classList.remove('visible');

  selectedTool = null;
}

// 天气粒子系统
let weatherParticlesContainer = null;
let weatherInterval = null;

// 动物系统
let animalElements = new Map();
let animalMoveInterval = null;
let animalPositions = {}; // penIndex -> {x, y}

// ========== 音效系统 (Web Audio API) ==========
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  try {
    // 恢复 AudioContext (浏览器策略)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    switch(type) {
      case 'plant':
        // 种植 - 轻柔的上扬音
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.15);
        break;
        
      case 'water':
        // 浇水 - 水滴声
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.2);
        break;
        
      case 'harvest':
        // 收获 - 愉快的叮当声
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(523, audioCtx.currentTime); // C5
        oscillator.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(784, audioCtx.currentTime + 0.2); // G5
        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.35);
        break;
        
      case 'coin':
        // 金币 - 清脆的叮声
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1800, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
        break;
        
      case 'error':
        // 错误 - 低沉的提示音
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(100, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.15);
        break;
        
      case 'buy':
        // 购买 - 愉快的上升音
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.12);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.12);
        break;
        
      case 'sell':
        // 出售 - 下降音
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.15);
        break;
        
      case 'pesticide':
        // 使用杀虫剂 - 喷雾声
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(2000, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
        break;
        
      case 'build':
        // 建造/放置 - 敲击声
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.08);
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.08);
        break;
        
      case 'lightning':
        // 闪电 - 雷声
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(80, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
        break;
        
      case 'success':
        // 成功 - 胜利号角
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(392, audioCtx.currentTime); // G4
        oscillator.frequency.setValueAtTime(523, audioCtx.currentTime + 0.15); // C5
        oscillator.frequency.setValueAtTime(659, audioCtx.currentTime + 0.3); // E5
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.4);
        break;
    }
  } catch (e) {
    console.log('[Farm] Sound error:', e);
  }
}

// ========== 天气粒子系统 ==========
function createWeatherParticles() {
  if (!weatherParticlesContainer) {
    weatherParticlesContainer = document.createElement('div');
    weatherParticlesContainer.className = 'weather-particles';
    document.body.appendChild(weatherParticlesContainer);
  }
  return weatherParticlesContainer;
}

function clearWeatherParticles() {
  if (weatherParticlesContainer) {
    weatherParticlesContainer.innerHTML = '';
  }
  if (weatherInterval) {
    clearInterval(weatherInterval);
    weatherInterval = null;
  }
  
  // 移除雾天效果（清除 gridScroll 内所有雾元素）
  document.querySelector('.game-container')?.classList.remove('foggy');
  document.querySelectorAll('.fog-overlay').forEach(el => el.remove());
  // 同时清理附着在 gridScroll 上的飘动雾团
  const gridScroll = document.querySelector('.farm-grid-scroll');
  if (gridScroll) {
    gridScroll.querySelectorAll('[style*="fog-drift"]').forEach(el => el.remove());
  }
}

function startRain() {
  clearWeatherParticles();
  const container = createWeatherParticles();
  
  // 创建初始雨滴
  for (let i = 0; i < 50; i++) {
    createRainDrop(container);
  }
  
  // 持续生成雨滴
  weatherInterval = setInterval(() => {
    if (document.querySelectorAll('.rain-drop').length < 100) {
      createRainDrop(container);
    }
  }, 50);
}

function createRainDrop(container) {
  const drop = document.createElement('div');
  drop.className = 'rain-drop';
  drop.style.left = Math.random() * 100 + 'vw';
  drop.style.setProperty('--rain-duration', (0.5 + Math.random() * 0.5) + 's');
  drop.style.animationDelay = Math.random() * 0.5 + 's';
  container.appendChild(drop);
  
  // 动画结束后移除
  setTimeout(() => drop.remove(), 1000);
}

function startSnow() {
  clearWeatherParticles();
  const container = createWeatherParticles();
  
  // 创建初始雪花
  for (let i = 0; i < 30; i++) {
    createSnowFlake(container);
  }
  
  // 持续生成雪花
  weatherInterval = setInterval(() => {
    if (document.querySelectorAll('.snow-flake').length < 60) {
      createSnowFlake(container);
    }
  }, 100);
}

function createSnowFlake(container) {
  const flake = document.createElement('div');
  flake.className = 'snow-flake';
  flake.style.left = Math.random() * 100 + 'vw';
  flake.style.setProperty('--snow-duration', (3 + Math.random() * 4) + 's');
  flake.style.animationDelay = Math.random() * 3 + 's';
  flake.style.width = (4 + Math.random() * 6) + 'px';
  flake.style.height = flake.style.width;
  container.appendChild(flake);
  
  // 动画结束后移除
  setTimeout(() => flake.remove(), 7000);
}

function triggerLightning() {
  // 播放闪电音效
  playSound('lightning');
  
  // 创建闪电闪光效果
  const flash = document.createElement('div');
  flash.className = 'lightning-flash';
  document.body.appendChild(flash);
  
  // 多次闪烁
  let flashCount = 0;
  const flashInterval = setInterval(() => {
    flash.style.opacity = flashCount % 2 === 0 ? '0.8' : '0.2';
    flashCount++;
    if (flashCount >= 4) {
      clearInterval(flashInterval);
      flash.remove();
    }
  }, 100);
}

function startFog() {
  clearWeatherParticles();

  // 雾层附着在 farm-grid-scroll 内，不铺满全屏
  const gridScroll = document.querySelector('.farm-grid-scroll');
  if (gridScroll) {
    const fogOverlay = document.createElement('div');
    fogOverlay.className = 'fog-overlay';
    gridScroll.appendChild(fogOverlay);

    // 飘动的雾团（相对于 gridScroll 定位）
    for (let i = 0; i < 8; i++) {
      const fog = document.createElement('div');
      fog.style.cssText = `
        position: absolute;
        width: ${120 + Math.random() * 180}px;
        height: 50px;
        background: radial-gradient(ellipse, rgba(200, 218, 222, 0.45) 0%, transparent 70%);
        left: ${Math.random() * 90}%;
        top: ${Math.random() * 80}%;
        pointer-events: none;
        z-index: 5;
        animation: fog-drift ${7 + Math.random() * 5}s ease-in-out infinite;
      `;
      gridScroll.appendChild(fog);
    }
  }

  document.querySelector('.game-container')?.classList.add('foggy');
}

// 添加雾漂移动画到CSS
const fogStyle = document.createElement('style');
fogStyle.textContent = `
  @keyframes fog-drift {
    0%, 100% { transform: translateX(0) translateY(0); }
    50% { transform: translateX(30px) translateY(10px); }
  }
`;
document.head.appendChild(fogStyle);

function startStorm() {
  // 暴风雨 = 大雨 + 闪电
  startRain();
  
  // 随机闪电
  weatherInterval = setInterval(() => {
    if (Math.random() < 0.3) { // 30%概率闪电
      triggerLightning();
    }
  }, 3000);
}

// 根据天气类型启动相应的粒子效果
function renderWeatherParticles(weatherType) {
  clearWeatherParticles();
  
  switch(weatherType) {
    case 'rainy':
      startRain();
      break;
    case 'snowy':
      startSnow();
      break;
    case 'stormy':
      startStorm();
      break;
    case 'foggy':
      startFog();
      break;
    case 'sunny':
    default:
      clearWeatherParticles();
      break;
  }
}

// ========== 粒子效果系统 ==========
function createParticles(x, y, type) {
  const particleCount = type === 'harvest' ? 20 : 12;
  const colors = {
    plant: ['#4CAF50', '#8BC34A', '#CDDC39'],
    water: ['#2196F3', '#03A9F4', '#00BCD4'],
    harvest: ['#FFD700', '#FFC107', '#FF9800', '#FF5722'],
    coin: ['#FFD700', '#FFA000']
  };
  
  const particleColors = colors[type] || colors.plant;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // 随机颜色
    particle.style.backgroundColor = particleColors[Math.floor(Math.random() * particleColors.length)];
    
    // 初始位置
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    
    // 随机角度和距离
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const duration = 0.5 + Math.random() * 0.5;
    
    // 设置 CSS 变量
    particle.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
    particle.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
    particle.style.animationDuration = duration + 's';
    
    document.body.appendChild(particle);
    
    // 动画结束后移除
    setTimeout(() => {
      particle.remove();
    }, duration * 1000);
  }
}

// 在指定元素周围创建粒子
function createParticlesAtElement(element, type) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  createParticles(x, y, type);
}

// ========== 浇水水滴效果 ==========
function showWaterDropEffect(plotCell) {
  if (!plotCell) return;
  
  // 创建多个水滴
  for (let i = 0; i < 5; i++) {
    const drop = document.createElement('div');
    drop.className = 'water-drop';
    
    const rect = plotCell.getBoundingClientRect();
    drop.style.left = (rect.left + rect.width / 2 + (Math.random() - 0.5) * 20) + 'px';
    drop.style.top = (rect.top + 5) + 'px';
    
    document.body.appendChild(drop);
    
    setTimeout(() => drop.remove(), 600);
  }
}

// ========== 种子发芽动画 ==========
function showSeedSproutAnimation(plotCell) {
  if (!plotCell) return;
  
  const sprout = document.createElement('div');
  sprout.className = 'seed-sprout';
  sprout.textContent = '🌱';
  
  const rect = plotCell.getBoundingClientRect();
  sprout.style.left = (rect.left + rect.width / 2 - 6) + 'px';
  sprout.style.top = (rect.top + rect.height / 2 - 6) + 'px';
  
  document.body.appendChild(sprout);
  
  setTimeout(() => sprout.remove(), 800);
}

// ========== 商店飞入动画 ==========
function showShopFlyAnimation(shopItem, itemId) {
  if (!shopItem) return;
  
  // 创建飞入元素
  const flyingItem = shopItem.cloneNode(true);
  flyingItem.classList.add('flying');
  
  const rect = shopItem.getBoundingClientRect();
  flyingItem.style.left = rect.left + 'px';
  flyingItem.style.top = rect.top + 'px';
  
  document.body.appendChild(flyingItem);
  
  // 动画结束后移除
  setTimeout(() => {
    flyingItem.remove();
    // 播放金币音效
    playSound('coin');
  }, 600);
}

// ========== 操作成功动画 ==========
function showSuccessAnimation(action, position) {
  // 播放对应音效
  playSound(action);
  
  // 获取当前位置的格子元素
  if (currentPlayer && gameState) {
    const cellSize = Math.min(CONFIG.cellSize, Math.min(CONFIG.maxGridWidth / gameState.width, CONFIG.maxGridWidth / gameState.height));
    const x = position.x * cellSize + cellSize / 2;
    const y = position.y * cellSize + cellSize / 2 + farmGrid.getBoundingClientRect().top;
    
    // 获取 farmGrid 在页面中的偏移
    const gridRect = farmGrid.getBoundingClientRect();
    const particleX = gridRect.left + position.x * cellSize + cellSize / 2;
    const particleY = gridRect.top + position.y * cellSize + cellSize / 2;
    
    createParticles(particleX, particleY, action);
  }
}

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
const gameTimeDisplay = document.getElementById('game-time');
const notification = document.getElementById('notification');

// 地图拖拽和缩放状态
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let scrollStartX = 0;
let scrollStartY = 0;

// 缩放相关
let scale = 1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const SCALE_STEP = 0.1;

// 初始化 Socket
function initSocket() {
  socket = io(SERVER_URL, {
    path: "/socket.io/",
    transports: ['websocket'],  // 只用 websocket，不用 polling
    forceNew: true,
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
    // 确保重连时强制新连接
    socket.io.opts.forceNew = true;
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('room-list', (rooms) => {
    renderRoomList(rooms);
  });

  socket.on('game-state', (state) => {
    updateGameState(state);
  });

  socket.on('player-info', (player) => {
    currentPlayer = player;
    // 初始化等级数据
    if (!currentPlayer.level) currentPlayer.level = 1;
    if (!currentPlayer.totalXp) currentPlayer.totalXp = 0;
    if (!currentPlayer.currentXp) currentPlayer.currentXp = 0;
    if (!currentPlayer.xpToNextLevel) currentPlayer.xpToNextLevel = 100;
    if (!currentPlayer.coinBonus) currentPlayer.coinBonus = 1;
    updatePlayerInfo();
    updateLevelDisplay();
  });

  socket.on('action-result', (result) => {
    if (result.success) {
      showNotification(`✅ ${result.message}`, 'success');
      // 根据消息类型播放音效和粒子
      const msg = result.message.toLowerCase();
      const currentPlot = currentPlayer ? document.getElementById(`plot-${currentPlayer.position.x}-${currentPlayer.position.y}`) : null;
      
      if (msg.includes('种植') || msg.includes('plant')) {
        playSound('plant');
        if (currentPlot) {
          createParticlesAtElement(currentPlot, 'plant');
          // 种子发芽动画
          showSeedSproutAnimation(currentPlot);
        }
      } else if (msg.includes('浇水') || msg.includes('water')) {
        playSound('water');
        if (currentPlot) {
          createParticlesAtElement(currentPlot, 'water');
          // 浇水水滴效果
          showWaterDropEffect(currentPlot);
        }
      } else if (msg.includes('收获') || msg.includes('harvest')) {
        playSound('harvest');
        if (currentPlot) createParticlesAtElement(currentPlot, 'harvest');
        
        // 显示经验值获得
        if (result.xpGained) {
          showXpGain(result.xpGained);
        }
        
        // 检查是否升级
        if (result.leveledUp) {
          showLevelUpAnimation(result.level);
        }
      } else if (msg.includes('金币') || msg.includes('money') || msg.includes('coin')) {
        playSound('coin');
      } else if (msg.includes('杀虫剂') || msg.includes('pesticide')) {
        playSound('pesticide');
        if (currentPlot) createParticlesAtElement(currentPlot, 'water');
      }
    } else {
      showNotification(`❌ ${result.message}`, 'error');
      playSound('error');
    }
  });

  socket.on('notification', (data) => {
    showNotification(data.message);
  });

  socket.on('shop-result', (result) => {
    if (result.success) {
      showNotification(`✅ ${result.message}`, 'success');
      playSound('coin');
    } else {
      showNotification(`❌ ${result.message}`, 'error');
      playSound('error');
    }
  });

  socket.on('shop-items', (items) => {
    renderShopItems(items);
  });

  socket.on('error', (error) => {
    showNotification(error.message || '发生错误', 'error');
  });

  // ===== 好友系统 =====
  socket.on('friend-result', (result) => {
    if (result.success) {
      showNotification(result.message, 'success');
      // Clear input
      const input = document.getElementById('friend-name-input');
      if (input) input.value = '';
    } else {
      showNotification(result.message, 'error');
    }
  });

  socket.on('friends-list', (friends) => {
    renderFriendsList(friends);
  });

  socket.on('friends-list-detailed', (friends) => {
    renderFriendsDetailed(friends);
  });

  // ===== 排行榜系统 =====
  socket.on('leaderboard-data', ({ type, data }) => {
    renderLeaderboard(data, type);
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
  
  // 上帝视角：隐藏玩家角色显示（只显示农田）
  if (playersLayer) {
    playersLayer.style.display = 'none';
  }
  
  // 保留在线列表显示
  renderPlayerList();
  renderInventory();
  renderPestItems();
  renderAnimalPen();
  updateOnlineCount();
  updateMoneyDisplay();
  updateGameTimeDisplay();
  renderWeather();
  renderPests();
  renderAnimalsOnMap();
  renderFarmer();
  renderFarmLog();
  
  // 更新当前玩家等级信息
  if (currentPlayer && gameState.players) {
    const serverPlayer = gameState.players.find(p => p.id === currentPlayer.id);
    if (serverPlayer) {
      currentPlayer.level = serverPlayer.level;
      currentPlayer.totalXp = serverPlayer.totalXp;
      currentPlayer.currentXp = serverPlayer.currentXp;
      currentPlayer.xpToNextLevel = serverPlayer.xpToNextLevel;
      currentPlayer.coinBonus = serverPlayer.coinBonus;
      updateLevelDisplay();
    }
  }
  
  // 启动动物移动（如果还没启动）
  if (!animalMoveInterval) {
    startAnimalMovement();
  }
  
  // 刷新好友列表（如果已连接）
  if (socket && socket.connected) {
    socket.emit('get-friends');
  }
}

// 更新游戏时间显示
function updateGameTimeDisplay() {
  if (!gameState || !gameTimeDisplay) return;
  const day = gameState.gameDay || 1;
  gameTimeDisplay.textContent = `📅 第 ${day} 天`;
}

// ========== 天气系统渲染 ==========
function renderWeather() {
  const weatherDisplay = document.getElementById('weather-display');
  if (!weatherDisplay || !gameState || !gameState.weather) return;
  
  const weather = gameState.weather;
  weatherDisplay.textContent = `${weather.emoji} ${weather.name}`;
  weatherDisplay.title = weather.description || '';
  
  // 移除旧的天气样式类
  weatherDisplay.classList.remove('sunny', 'rainy', 'stormy', 'foggy', 'snowy');
  weatherDisplay.classList.add(weather.type || 'sunny');
  
  // 添加描述作为子元素
  let descEl = weatherDisplay.querySelector('.weather-desc');
  if (!descEl && weather.description) {
    descEl = document.createElement('span');
    descEl.className = 'weather-desc';
    weatherDisplay.appendChild(descEl);
  }
  if (descEl) {
    descEl.textContent = weather.description;
  }
  
  // 触发天气粒子效果
  renderWeatherParticles(weather.type);
}

// ========== 害虫系统渲染 ==========
function renderPests() {
  const pestCountEl = document.getElementById('pest-count');
  if (!gameState || !gameState.pests) return;

  const pests = gameState.pests;

  // 更新害虫数量显示
  if (pestCountEl) {
    pestCountEl.textContent = pests.length;
    pestCountEl.dataset.count = pests.length;
  }

  // 清除旧的害虫显示
  document.querySelectorAll('.plot-cell').forEach(cell => {
    cell.classList.remove('has-pest');
    const old = cell.querySelector('.pest-indicator');
    if (old) old.remove();
  });

  // 在格子上直接显示害虫 emoji
  pests.forEach(pest => {
    const cell = document.getElementById(`plot-${pest.x}-${pest.y}`);
    if (cell) {
      cell.classList.add('has-pest');
      const indicator = document.createElement('div');
      indicator.className = 'pest-indicator';
      indicator.textContent = pest.emoji || '🐛';
      indicator.title = pest.name || '害虫';
      cell.appendChild(indicator);
    }
  });
}

// ========== 害虫道具数量徽章 ==========
function renderPestItems() {
  if (!currentPlayer || !gameState) return;
  const player = gameState.players.find(p => p.id === currentPlayer.id);
  if (!player) return;
  const items = player.items || {};

  [
    { btnId: 'use-pesticide-btn', itemId: 'pesticide' },
    { btnId: 'use-bug-net-btn',  itemId: 'bug_net' },
    { btnId: 'use-scarecrow-btn',itemId: 'scarecrow' }
  ].forEach(({ btnId, itemId }) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const count = items[itemId] || 0;
    let badge = btn.querySelector('.item-count-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'item-count-badge';
      btn.appendChild(badge);
    }
    badge.textContent = count > 0 ? `×${count}` : '';
    btn.disabled = count <= 0;
    btn.classList.toggle('no-stock', count <= 0);
  });
}

// ========== 害虫防治事件 ==========
function initPestControlEvents() {
  // 购买按钮 —— 直接购买
  document.getElementById('buy-pesticide-btn')?.addEventListener('click', () => {
    playSound('buy');
    socket.emit('buy-item', { itemId: 'pesticide', quantity: 1 });
  });
  document.getElementById('buy-bug-net-btn')?.addEventListener('click', () => {
    playSound('buy');
    socket.emit('buy-item', { itemId: 'bug_net', quantity: 1 });
  });
  document.getElementById('buy-scarecrow-btn')?.addEventListener('click', () => {
    playSound('buy');
    socket.emit('buy-item', { itemId: 'scarecrow', quantity: 1 });
  });

  // 使用按钮 —— 选择工具后点格子执行
  document.getElementById('use-pesticide-btn')?.addEventListener('click', () => {
    selectTool({ btnId: 'use-pesticide-btn', type: 'pesticide', label: '使用杀虫剂', emoji: '🧴', sound: 'water',
      emit: () => socket?.emit('use-item', { itemId: 'pesticide' }) });
  });
  document.getElementById('use-bug-net-btn')?.addEventListener('click', () => {
    selectTool({ btnId: 'use-bug-net-btn', type: 'bugnet', label: '放置防虫网', emoji: '🕸️', sound: 'plant',
      emit: () => socket?.emit('use-item', { itemId: 'bug_net' }) });
  });
  document.getElementById('use-scarecrow-btn')?.addEventListener('click', () => {
    selectTool({ btnId: 'use-scarecrow-btn', type: 'scarecrow', label: '放置稻草人', emoji: '🎃', sound: 'plant',
      emit: () => socket?.emit('use-item', { itemId: 'scarecrow' }) });
  });
}

// 更新金币显示（带动画）—— 显示公共金库
function updateMoneyDisplay() {
  if (!gameState || !moneyDisplay) return;

  // 优先使用顶层 sharedMoney，兜底用当前玩家的 money 字段
  const newMoney = gameState.sharedMoney !== undefined
    ? gameState.sharedMoney
    : (gameState.players.find(p => p.id === currentPlayer?.id)?.money || 0);

  const currentMoney = parseInt(moneyDisplay.textContent.replace(/[^0-9]/g, '')) || 0;

  if (currentMoney !== newMoney) {
    moneyDisplay.classList.add('money-changed');
    setTimeout(() => moneyDisplay.classList.remove('money-changed'), 300);
    moneyDisplay.textContent = `💰 ${newMoney}`;
    if (currentPlayer) currentPlayer.money = newMoney;
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
        
        // 点击：移动 + 若有选中工具则执行操作
        cell.addEventListener('click', () => {
          if (currentPlayer && socket) {
            socket.emit('move', { x, y });
            highlightPlot(x, y);
            if (selectedTool) {
              selectedTool.emit();
              playSound(selectedTool.sound);
            }
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

// ========== 农夫 NPC 渲染 ==========
// 农夫帽子颜色（区分多农夫）
const FARMER_HAT_COLORS = ['#c8920a', '#e53935', '#1565c0', '#6a1b9a', '#00695c', '#37474f'];

function renderFarmer() {
  if (!gameState) return;

  // 支持多农夫：优先使用 farmers 数组，向后兼容单 farmer
  const farmers = gameState.farmers && gameState.farmers.length > 0
    ? gameState.farmers
    : (gameState.farmer ? [gameState.farmer] : []);

  // 清除旧元素和格子高亮
  document.querySelectorAll('.farmer-in-cell, .farmer-walk-target').forEach(el => el.remove());
  document.querySelectorAll('.plot-cell.farmer-here').forEach(el => el.classList.remove('farmer-here'));

  farmers.forEach((farmer, idx) => {
    if (!farmer || farmer.isDead) return;

    const cell = document.getElementById(`plot-${farmer.x}-${farmer.y}`);
    if (!cell) return;

    cell.classList.add('farmer-here');

    // 状态 class
    let stateClass = '';
    if (farmer.isSleeping)               stateClass = ' farmer-sleeping';
    else if (farmer.isWalking)           stateClass = ' farmer-walking';
    else if (farmer.state === 'working') stateClass = ' farmer-working';

    // 饥饿状态 class
    const hunger = farmer.hungerPct || farmer.hunger || 0;
    if (hunger >= 80) stateClass += ' farmer-starving';
    else if (hunger >= 50) stateClass += ' farmer-hungry';

    const hatColor = FARMER_HAT_COLORS[idx % FARMER_HAT_COLORS.length];

    // 饥饿条 HTML（饥饿度 >= 40 时显示）
    const hungerBarHtml = hunger >= 40
      ? `<div class="ff-hunger-bar"><div class="ff-hunger-fill" style="width:${hunger}%"></div></div>`
      : '';

    // 人型结构
    const el = document.createElement('div');
    el.className = 'farmer-in-cell' + stateClass;
    el.title = `${farmer.fullName} — ${farmer.currentAction}\n饥饿度: ${hunger}%`;
    el.innerHTML = `
      <div class="ff-hat" style="background:${hatColor}"></div>
      <div class="ff-head"></div>
      <div class="ff-body"></div>
      <div class="ff-legs">
        <div class="ff-leg ff-leg-l"></div>
        <div class="ff-leg ff-leg-r"></div>
      </div>
      ${hungerBarHtml}`;
    cell.appendChild(el);

    // 行走目标格：彩色点
    if (farmer.isWalking && farmer.walkTarget) {
      const tc = document.getElementById(`plot-${farmer.walkTarget.x}-${farmer.walkTarget.y}`);
      if (tc) {
        const dot = document.createElement('div');
        dot.className = 'farmer-walk-target';
        dot.textContent = idx === 0 ? '🟡' : '🟠';
        tc.appendChild(dot);
      }
    }
  });
}

// ========== 农场日志渲染 ==========
function renderFarmLog() {
  if (!gameState) return;

  // 更新农夫状态（支持多农夫）
  const farmers = gameState.farmers && gameState.farmers.length > 0
    ? gameState.farmers
    : (gameState.farmer ? [gameState.farmer] : []);
  const farmerStatusEl = document.getElementById('farmer-status');
  if (farmerStatusEl && farmers.length > 0) {
    farmerStatusEl.innerHTML = farmers.map((f, idx) => {
      if (f.isDead) return `<span class="farmer-chip farmer-dead-chip">💀${f.name}</span>`;
      const hunger = f.hungerPct || f.hunger || 0;
      const hungerEmoji = hunger >= 80 ? '😫' : hunger >= 50 ? '😋' : '😊';
      const hatColor = FARMER_HAT_COLORS[idx % FARMER_HAT_COLORS.length];
      return `<span class="farmer-chip" style="border-left:3px solid ${hatColor}" title="饥饿度:${hunger}%">${hungerEmoji}${f.name}：${f.currentAction}</span>`;
    }).join('');
  }

  const listEl = document.getElementById('farm-log-list');
  if (!listEl || !gameState.farmLog) return;

  // 只在日志有变化时更新
  const newHash = (gameState.farmLog[0] || {}).time + (gameState.farmLog[0] || {}).message;
  if (listEl.dataset.lastHash === newHash) return;
  listEl.dataset.lastHash = newHash;

  listEl.innerHTML = '';
  gameState.farmLog.forEach(entry => {
    const item = document.createElement('div');
    item.className = `farm-log-item log-type-${entry.type || 'info'}`;
    item.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-msg">${entry.message}</span>`;
    listEl.appendChild(item);
  });
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
    
    // 计算剩余成熟时间（更精确的倒计时）
    let remainingTimeText = '';
    if (plot.growthStage < 3 && plot.plantedAt) {
      const crop = cropConfig[plot.crop];
      const growthTime = crop.growthTime; // 总生长时间（秒）
      const stageProgress = plot.growthStage / 3; // 当前进度 0-1
      const elapsedTime = (Date.now() - new Date(plot.plantedAt).getTime()) / 1000;
      
      // 考虑浇水加速（通常浇水加速生长）
      const timeMultiplier = plot.wateringCount > 0 ? 1.5 : 1.0;
      const totalTimeNeeded = growthTime * timeMultiplier;
      const remainingSeconds = Math.max(0, totalTimeNeeded * (1 - stageProgress) - elapsedTime);
      
      if (remainingSeconds > 0) {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = Math.floor(remainingSeconds % 60);
        if (minutes > 0) {
          remainingTimeText = `⏱️ 约 ${minutes}分${seconds}秒后成熟`;
        } else {
          remainingTimeText = `⏱️ 约 ${seconds}秒后成熟`;
        }
      } else {
        remainingTimeText = '⏱️ 即将成熟';
      }
    } else if (plot.growthStage >= 3) {
      remainingTimeText = '✨ 已成熟，可收获！';
    }
    
    content = `
      <div class="tooltip-title">${crop.emoji} ${crop.name}</div>
      <div class="tooltip-row">阶段: ${stageNames[plot.growthStage]}</div>
      <div class="tooltip-row">湿度: ${plot.soilMoisture}%</div>
      <div class="tooltip-row">${plot.isWatered ? '💧 已浇水' : '💧 未浇水'}</div>
      ${remainingTimeText ? `<div class="tooltip-row ${plot.growthStage >= 3 ? 'ready-text' : ''}">${remainingTimeText}</div>` : ''}
      ${plot.growthStage >= 3 ? `<div class="tooltip-row ready-text">💰 售价: +${crop.sellPrice}</div>` : ''}
    `;
  } else {
    content = `
      <div class="tooltip-title">🟫 空地</div>
      <div class="tooltip-row">湿度: ${plot.soilMoisture}%</div>
      <div class="tooltip-row">点击选择此地块</div>
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
  
  // 更新等级显示
  updateLevelDisplay();
}

// 更新等级显示
function updateLevelDisplay() {
  if (!currentPlayer) return;
  
  const levelDisplay = document.getElementById('level-display');
  const xpBar = document.getElementById('xp-bar');
  const xpText = document.getElementById('xp-text');
  const bonusDisplay = document.getElementById('bonus-display');
  
  if (levelDisplay) {
    levelDisplay.textContent = `Lv.${currentPlayer.level || 1}`;
  }
  
  if (xpBar && currentPlayer.xpToNextLevel) {
    const progress = (currentPlayer.currentXp || 0) / currentPlayer.xpToNextLevel * 100;
    xpBar.style.width = `${Math.min(100, progress)}%`;
  }
  
  if (xpText) {
    xpText.textContent = `${currentPlayer.currentXp || 0}/${currentPlayer.xpToNextLevel || 100} XP`;
  }
  
  if (bonusDisplay) {
    const bonusPercent = Math.round(((currentPlayer.coinBonus || 1) - 1) * 100);
    bonusDisplay.textContent = `💰+${bonusPercent}%`;
  }
}

// 显示经验值获得动画
function showXpGain(xpAmount) {
  const levelPanel = document.getElementById('level-panel');
  if (!levelPanel) return;
  
  const xpPopup = document.createElement('div');
  xpPopup.className = 'xp-popup';
  xpPopup.textContent = `+${xpAmount} XP`;
  xpPopup.style.cssText = `
    position: absolute;
    top: -30px;
    right: 0;
    color: #4CAF50;
    font-weight: bold;
    font-size: 14px;
    animation: xpFloat 1s ease-out forwards;
    pointer-events: none;
  `;
  
  levelPanel.appendChild(xpPopup);
  
  setTimeout(() => xpPopup.remove(), 1000);
}

// 显示升级动画
function showLevelUpAnimation(newLevel) {
  // 播放升级音效
  playSound('success');
  
  // 创建升级弹窗
  const levelUpModal = document.createElement('div');
  levelUpModal.className = 'levelup-modal';
  levelUpModal.innerHTML = `
    <div class="levelup-content">
      <div class="levelup-stars">⭐⭐⭐</div>
      <div class="levelup-title">升级啦！</div>
      <div class="levelup-level">Lv.${newLevel}</div>
      <div class="levelup-bonus">💰 金币加成 +1%</div>
      <div class="levelup-reward">+100 金币奖励</div>
    </div>
  `;
  
  document.body.appendChild(levelUpModal);
  
  // 创建升级粒子效果
  createLevelUpParticles();
  
  // 3秒后移除弹窗
  setTimeout(() => {
    levelUpModal.classList.add('fade-out');
    setTimeout(() => levelUpModal.remove(), 500);
  }, 3000);
  
  // 显示通知
  showNotification(`🎉 恭喜升级到 Lv.${newLevel}！金币加成 +1%`, 'success');
}

// 创建升级粒子效果
function createLevelUpParticles() {
  const colors = ['#FFD700', '#FFA000', '#FF5722', '#4CAF50', '#2196F3'];
  const particleCount = 50;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'levelup-particle';
    particle.style.cssText = `
      position: fixed;
      width: ${8 + Math.random() * 8}px;
      height: ${8 + Math.random() * 8}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: 50%;
      left: 50%;
      top: 50%;
      pointer-events: none;
      z-index: 9999;
    `;
    
    document.body.appendChild(particle);
    
    // 随机角度和距离
    const angle = Math.random() * Math.PI * 2;
    const distance = 100 + Math.random() * 200;
    const duration = 1 + Math.random() * 0.5;
    
    particle.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0)`, opacity: 0 }
    ], {
      duration: duration * 1000,
      easing: 'ease-out',
      fill: 'forwards'
    });
    
    setTimeout(() => particle.remove(), duration * 1000);
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
  notification.classList.remove('hidden', 'slide-out');
  
  // 清除之前的定时器
  if (notification.hideTimer) {
    clearTimeout(notification.hideTimer);
  }
  
  notification.hideTimer = setTimeout(() => {
    notification.classList.add('slide-out');
    setTimeout(() => {
      notification.classList.add('hidden');
      notification.classList.remove('slide-out');
    }, 300);
  }, 2700);
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
  
  // 使用 waitForSocketConnection 确保无论连接状态如何都能加入房间
  waitForSocketConnection();
});

// 确保 socket 连接成功时自动加入房间
function waitForSocketConnection() {
  if (socket && socket.connected) {
    joinDefaultRoom();
  } else {
    // 监听一次连接事件
    socket?.once('connect', () => {
      console.log('[Farm] Socket connected, joining room...');
      joinDefaultRoom();
    });
  }
}

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

// 作物按钮 —— 统一用 selectTool 绑定
[
  { id: 'plant-wheat',      crop: 'wheat',      emoji: '🌾', label: '种小麦' },
  { id: 'plant-corn',       crop: 'corn',       emoji: '🌽', label: '种玉米' },
  { id: 'plant-rice',       crop: 'rice',       emoji: '🍚', label: '种水稻' },
  { id: 'plant-tomato',     crop: 'tomato',     emoji: '🍅', label: '种番茄' },
  { id: 'plant-carrot',     crop: 'carrot',     emoji: '🥕', label: '种胡萝卜' },
  { id: 'plant-eggplant',   crop: 'eggplant',   emoji: '🍆', label: '种茄子' },
  { id: 'plant-cucumber',   crop: 'cucumber',   emoji: '🥒', label: '种黄瓜' },
  { id: 'plant-pumpkin',    crop: 'pumpkin',    emoji: '🎃', label: '种南瓜' },
  { id: 'plant-strawberry', crop: 'strawberry', emoji: '🍓', label: '种草莓' },
  { id: 'plant-watermelon', crop: 'watermelon', emoji: '🍉', label: '种西瓜' },
  { id: 'plant-grape',      crop: 'grape',      emoji: '🍇', label: '种葡萄' },
  { id: 'plant-apple',      crop: 'apple',      emoji: '🍎', label: '种苹果' },
  { id: 'plant-cotton',     crop: 'cotton',     emoji: '☁️', label: '种棉花' },
  { id: 'plant-tea',        crop: 'tea',        emoji: '🍵', label: '种茶叶' },
].forEach(({ id, crop, emoji, label }) => {
  document.getElementById(id)?.addEventListener('click', () => {
    selectTool({ btnId: id, type: 'plant', label, emoji, sound: 'plant',
      emit: () => socket?.emit('plant', { cropType: crop }) });
  });
});

// 维护操作按钮
document.getElementById('water-btn')?.addEventListener('click', () => {
  selectTool({ btnId: 'water-btn', type: 'water', label: '浇水', emoji: '💧', sound: 'water',
    emit: () => socket?.emit('water') });
});
document.getElementById('harvest-btn')?.addEventListener('click', () => {
  selectTool({ btnId: 'harvest-btn', type: 'harvest', label: '收获', emoji: '🧺', sound: 'harvest',
    emit: () => socket?.emit('harvest') });
});
document.getElementById('remove-btn')?.addEventListener('click', () => {
  selectTool({ btnId: 'remove-btn', type: 'remove', label: '铲除', emoji: '🪓', sound: 'plant',
    emit: () => socket?.emit('remove-crop') });
});
document.getElementById('reset-btn')?.addEventListener('click', () => socket?.emit('new-farm'));

// ========== 背包和商店功能 ==========

// 渲染背包
function renderInventory() {
  if (!currentPlayer || !gameState) return;
  
  const inventoryList = document.getElementById('inventory-list');
  if (!inventoryList) return;
  
  const player = gameState.players.find(p => p.id === currentPlayer.id);
  if (!player) return;
  
  const inventory = player.inventory || {};
  const crops = gameState.crops || {};
  
  const items = Object.entries(inventory);
  
  if (items.length === 0) {
    inventoryList.innerHTML = '<div class="inventory-empty">背包是空的</div>';
    return;
  }
  
  inventoryList.innerHTML = '';
  items.forEach(([cropType, count]) => {
    const crop = crops[cropType];
    if (!crop) return;
    
    const itemEl = document.createElement('div');
    itemEl.className = 'inventory-item';
    itemEl.innerHTML = `
      <span class="item-emoji">${crop.emoji}</span>
      <span class="item-name">${crop.name}</span>
      <span class="item-count">x${count}</span>
      <button class="sell-btn" data-crop="${cropType}">出售</button>
    `;
    inventoryList.appendChild(itemEl);
  });
  
  // 绑定出售按钮事件
  inventoryList.querySelectorAll('.sell-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cropType = btn.dataset.crop;
      playSound('sell');
      socket.emit('sell-item', { cropType, quantity: 1 });
    });
  });
}

// 渲染商店物品
function renderShopItems(shopItems) {
  const shopItemsContainer = document.getElementById('shop-items');
  if (!shopItemsContainer) return;
  
  // 过滤当前标签页的物品
  let itemsToShow = [];
  
  if (currentShopTab === 'seeds') {
    itemsToShow = Object.entries(shopItems).filter(([id, item]) => item.type === 'seed');
  } else if (currentShopTab === 'items') {
    itemsToShow = Object.entries(shopItems).filter(([id, item]) => item.type === 'item');
  } else if (currentShopTab === 'farmers') {
    renderFarmerTab(shopItemsContainer);
    return;
  } else if (currentShopTab === 'sell') {
    renderSellTab(shopItemsContainer);
    return;
  }
  
  shopItemsContainer.innerHTML = '';
  itemsToShow.forEach(([itemId, item]) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'shop-item';
    itemEl.dataset.itemId = itemId;
    itemEl.innerHTML = `
      <span class="item-emoji">${item.emoji}</span>
      <span class="item-name">${item.name}</span>
      <span class="item-price">${item.price}</span>
    `;
    itemEl.addEventListener('click', () => {
      // 播放购买音效
      playSound('buy');
      // 飞入动画
      showShopFlyAnimation(itemEl, itemId);
      // 发送购买请求
      setTimeout(() => {
        socket.emit('buy-item', { itemId, quantity: 1 });
      }, 300);
    });
    shopItemsContainer.appendChild(itemEl);
  });
}

// ========== 农夫管理标签页 ==========
function renderFarmerTab(container) {
  if (!gameState) {
    container.innerHTML = '<div class="inventory-empty">请先加入游戏</div>';
    return;
  }

  const farmers     = gameState.farmers || (gameState.farmer ? [gameState.farmer] : []);
  const nextCost    = gameState.nextHireCost || 500;
  const sharedMoney = gameState.sharedMoney || 0;
  const foods       = gameState.farmerFoods || {};

  container.innerHTML = '';

  // ——— 当前农夫状态卡片 ———
  const farmerSection = document.createElement('div');
  farmerSection.className = 'farmer-mgmt-section';
  farmerSection.innerHTML = `<div class="farmer-mgmt-title">👨‍🌾 当前农夫（${farmers.length}/6）</div>`;

  farmers.forEach((f, idx) => {
    const hunger   = f.hungerPct || f.hunger || 0;
    const hatColor = FARMER_HAT_COLORS[idx % FARMER_HAT_COLORS.length];
    const statusIcon = f.isDead ? '💀' : hunger >= 80 ? '😫' : hunger >= 50 ? '😋' : '😊';
    const barColor = hunger >= 80 ? '#ef5350' : hunger >= 50 ? '#ff9800' : '#66bb6a';

    const card = document.createElement('div');
    card.className = 'farmer-card';
    card.innerHTML = `
      <div class="farmer-card-header" style="border-left: 4px solid ${hatColor}">
        <span class="farmer-card-name">${statusIcon} ${f.fullName || '农夫'+f.name}</span>
        <span class="farmer-card-action">${f.isDead ? '已去世' : f.currentAction}</span>
      </div>
      ${!f.isDead ? `
      <div class="farmer-hunger-row">
        <span>🍽️ 饥饿度</span>
        <div class="farmer-hunger-track">
          <div class="farmer-hunger-prog" style="width:${hunger}%;background:${barColor}"></div>
        </div>
        <span>${hunger}%</span>
      </div>
      <div class="farmer-feed-btns">
        ${Object.entries(foods).map(([foodId, food]) => `
          <button class="feed-btn" data-farmer="${f.name}" data-food="${foodId}"
            title="${food.desc || food.name}（-${food.price}💰，+${food.satiety}%饱腹）">
            ${food.emoji} ${food.name} <small>${food.price}💰</small>
          </button>
        `).join('')}
      </div>
      ${idx > 0 ? `<button class="fire-farmer-btn" data-farmer="${f.name}">👋 解雇</button>` : ''}
      ` : ''}
    `;
    farmerSection.appendChild(card);
  });

  container.appendChild(farmerSection);

  // ——— 雇佣新农夫 ———
  if (farmers.length < 6) {
    const hireSection = document.createElement('div');
    hireSection.className = 'farmer-mgmt-section';
    const canAfford = sharedMoney >= nextCost;
    hireSection.innerHTML = `
      <div class="farmer-mgmt-title">➕ 雇佣新农夫</div>
      <div class="hire-farmer-row">
        <div class="hire-farmer-desc">
          <span>下一名农夫费用：<strong>${nextCost} 💰</strong></span>
          <small>价格随人数增加（当前公库：${sharedMoney}💰）</small>
        </div>
        <button class="hire-farmer-btn ${canAfford ? '' : 'disabled'}" ${canAfford ? '' : 'disabled'}>
          👨‍🌾 雇佣
        </button>
      </div>
    `;
    container.appendChild(hireSection);
  }

  // ——— 绑定事件 ———
  container.querySelectorAll('.feed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const farmerName = btn.dataset.farmer;
      const foodId     = btn.dataset.food;
      socket.emit('feed-farmer', { farmerName, foodId });
      playSound('buy');
    });
  });

  container.querySelectorAll('.fire-farmer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const farmerName = btn.dataset.farmer;
      if (confirm(`确定要解雇 ${farmerName} 吗？`)) {
        socket.emit('fire-farmer', { farmerName });
      }
    });
  });

  container.querySelector('.hire-farmer-btn')?.addEventListener('click', () => {
    socket.emit('hire-farmer');
    playSound('buy');
  });
}

// 渲染出售标签页
function renderSellTab(container) {
  if (!currentPlayer || !gameState) {
    container.innerHTML = '<div class="inventory-empty">请先加入游戏</div>';
    return;
  }
  
  const player = gameState.players.find(p => p.id === currentPlayer.id);
  if (!player) return;
  
  const inventory = player.inventory || {};
  const crops = gameState.crops || {};
  
  const items = Object.entries(inventory).filter(([cropType]) => crops[cropType]);
  
  if (items.length === 0) {
    container.innerHTML = '<div class="inventory-empty">背包中没有可出售的物品</div>';
    return;
  }
  
  container.innerHTML = '';
  items.forEach(([cropType, count]) => {
    const crop = crops[cropType];
    const row = document.createElement('div');
    row.className = 'sell-item-row';
    row.innerHTML = `
      <span class="item-emoji">${crop.emoji}</span>
      <div class="item-info">
        <div class="item-name">${crop.name}</div>
        <div class="item-count">库存: ${count}</div>
      </div>
      <span class="sell-price">+${crop.sellPrice}💰</span>
      <button class="sell-btn" data-crop="${cropType}">出售</button>
    `;
    container.appendChild(row);
  });
  
  // 绑定出售按钮事件
  container.querySelectorAll('.sell-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cropType = btn.dataset.crop;
      playSound('sell');
      socket.emit('sell-item', { cropType, quantity: 1 });
    });
  });
}

// 打开商店
function openShop() {
  const shopModal = document.getElementById('shop-modal');
  if (shopModal) {
    shopModal.classList.remove('hidden');
    // 请求商店物品列表
    socket.emit('get-shop');
  }
}

// 关闭商店
function closeShop() {
  const shopModal = document.getElementById('shop-modal');
  if (shopModal) {
    shopModal.classList.add('hidden');
  }
}

// 折叠/展开分类
function toggleSection(id) {
  const section = document.getElementById(id);
  const header = section?.previousElementSibling;
  if (section && header) {
    section.classList.toggle('collapsed');
    header.querySelector('.toggle-icon').textContent = section.classList.contains('collapsed') ? '▶' : '▼';
  }
}

// 初始化商店事件
function initShopEvents() {
  const openShopBtn = document.getElementById('open-shop-btn');
  const closeShopBtn = document.getElementById('close-shop-btn');
  const shopModal = document.getElementById('shop-modal');
  
  openShopBtn?.addEventListener('click', openShop);
  closeShopBtn?.addEventListener('click', closeShop);
  
  shopModal?.addEventListener('click', (e) => {
    if (e.target === shopModal) closeShop();
  });
  
  // 商店标签切换
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentShopTab = tab.dataset.tab;
      socket.emit('get-shop');
    });
  });
  
  // 动物购买按钮
  document.getElementById('buy-chicken-btn')?.addEventListener('click', () => {
    playSound('buy');
    socket.emit('buy-animal', { animalType: 'chicken' });
  });
  
  document.getElementById('buy-sheep-btn')?.addEventListener('click', () => {
    playSound('buy');
    socket.emit('buy-animal', { animalType: 'sheep' });
  });
  
  document.getElementById('buy-cow-btn')?.addEventListener('click', () => {
    playSound('buy');
    socket.emit('buy-animal', { animalType: 'cow' });
  });
}

// ===== 好友系统 =====
let currentLeaderboardType = 'money';

function initFriendsEvents() {
  const openFriendsBtn = document.getElementById('open-friends-btn');
  const closeFriendsBtn = document.getElementById('close-friends-btn');
  const friendsModal = document.getElementById('friends-modal');
  const addFriendBtn = document.getElementById('add-friend-btn');
  const friendNameInput = document.getElementById('friend-name-input');
  
  // Open friends modal
  openFriendsBtn?.addEventListener('click', () => {
    friendsModal?.classList.remove('hidden');
    socket.emit('get-friends');
  });
  
  // Close friends modal
  closeFriendsBtn?.addEventListener('click', () => {
    friendsModal?.classList.add('hidden');
  });
  
  // Click outside to close
  friendsModal?.addEventListener('click', (e) => {
    if (e.target === friendsModal) friendsModal.classList.add('hidden');
  });
  
  // Add friend
  addFriendBtn?.addEventListener('click', () => {
    const name = friendNameInput?.value.trim();
    if (name) {
      socket.emit('add-friend', { friendName: name });
    }
  });
  
  // Enter key to add friend
  friendNameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addFriendBtn?.click();
  });
  
  // Open leaderboard
  const openLeaderboardBtn = document.getElementById('open-leaderboard-btn');
  const closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');
  const leaderboardModal = document.getElementById('leaderboard-modal');
  
  openLeaderboardBtn?.addEventListener('click', () => {
    leaderboardModal?.classList.remove('hidden');
    socket.emit('get-leaderboard', currentLeaderboardType);
  });
  
  closeLeaderboardBtn?.addEventListener('click', () => {
    leaderboardModal?.classList.add('hidden');
  });
  
  leaderboardModal?.addEventListener('click', (e) => {
    if (e.target === leaderboardModal) leaderboardModal.classList.add('hidden');
  });
  
  // Leaderboard tabs
  document.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.leaderboard-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentLeaderboardType = tab.dataset.type;
      socket.emit('get-leaderboard', currentLeaderboardType);
    });
  });
}

// Render friends list (sidebar compact view)
function renderFriendsList(friends) {
  const friendsListEl = document.getElementById('friends-list');
  if (!friendsListEl) return;
  
  if (!friends || friends.length === 0) {
    friendsListEl.innerHTML = '<div class="no-friends">暂无好友</div>';
    return;
  }
  
  friendsListEl.innerHTML = '';
  friends.forEach(friendName => {
    const badge = document.createElement('div');
    badge.className = 'friend-badge';
    badge.innerHTML = `
      <span class="friend-status online"></span>
      <span class="friend-name">${friendName}</span>
    `;
    friendsListEl.appendChild(badge);
  });
}

// Render detailed friends list (modal view with online status)
function renderFriendsDetailed(friends) {
  const friendsModalList = document.getElementById('friends-modal-list');
  if (!friendsModalList) return;
  
  if (!friends || friends.length === 0) {
    friendsModalList.innerHTML = '<div class="no-friends">暂无好友，添加一个吧！</div>';
    return;
  }
  
  friendsModalList.innerHTML = '';
  friends.forEach(friend => {
    const item = document.createElement('div');
    item.className = 'friends-modal-item';
    item.innerHTML = `
      <span class="friend-status ${friend.online ? 'online' : 'offline'}"></span>
      <div class="friend-info">
        <div class="friend-name">${friend.name}</div>
        ${friend.online ? `<div class="friend-money">💰 ${friend.money}</div>` : '<div class="friend-money">离线</div>'}
      </div>
      <div class="friend-actions">
        ${friend.online ? `<button class="visit-btn" data-friend="${friend.name}">访问</button>` : ''}
        <button class="remove-btn" data-friend="${friend.name}">删除</button>
      </div>
    `;
    
    // Visit button
    const visitBtn = item.querySelector('.visit-btn');
    if (visitBtn) {
      visitBtn.addEventListener('click', () => {
        socket.emit('visit-friend', { friendName: friend.name });
        document.getElementById('friends-modal')?.classList.add('hidden');
        showNotification(`正在访问 ${friend.name} 的农场...`);
      });
    }
    
    // Remove button
    const removeBtn = item.querySelector('.remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (confirm(`确定要删除好友 ${friend.name} 吗？`)) {
          socket.emit('remove-friend', { friendName: friend.name });
        }
      });
    }
    
    friendsModalList.appendChild(item);
  });
}

// Render leaderboard
function renderLeaderboard(data, type) {
  const leaderboardList = document.getElementById('leaderboard-list');
  if (!leaderboardList) return;
  
  if (!data || data.length === 0) {
    leaderboardList.innerHTML = '<div class="no-leaderboard">暂无数据</div>';
    return;
  }
  
  leaderboardList.innerHTML = '';
  data.forEach((player, index) => {
    const item = document.createElement('div');
    item.className = `leaderboard-item ${index < 3 ? 'top-' + (index + 1) : ''}`;
    
    const rank = index + 1;
    let valueDisplay = '';
    
    if (type === 'money') {
      valueDisplay = `<span class="leaderboard-value money">💰 ${player.money}</span>`;
    } else if (type === 'level') {
      valueDisplay = `<span class="leaderboard-value">⭐ Lv.${player.level}</span>`;
    } else if (type === 'harvests') {
      valueDisplay = `<span class="leaderboard-value harvests">🌾 ${player.harvests}</span>`;
    }
    
    item.innerHTML = `
      <div class="leaderboard-rank ${index < 3 ? 'top-' + (index + 1) : ''}">${rank}</div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${player.name}</div>
        <div class="leaderboard-stats">
          <span class="leaderboard-level">Lv.${player.level}</span> · 
          💰${player.money} · 🌾${player.harvests}
        </div>
      </div>
      ${valueDisplay}
    `;
    
    leaderboardList.appendChild(item);
  });
}

// 渲染动物栏（仅显示有动物的栏位，简洁模式）
function renderAnimalPen() {
  if (!gameState?.animalPens) return;
  const container = document.getElementById('animal-pen');
  if (!container) return;

  const occupied = gameState.animalPens
    .map((pen, i) => ({ ...pen, penIndex: i }))
    .filter(pen => pen.animal);

  if (occupied.length === 0) {
    container.innerHTML = '<div class="animal-pen-empty">🐾 购买动物后将显示于地图格子中</div>';
    return;
  }

  container.innerHTML = '';
  occupied.forEach(pen => {
    const card = document.createElement('div');
    card.className = `animal-pen-cell has-animal${pen.isReady ? ' ready' : ''}`;
    const progressPercent = Math.round((pen.progress || 0) * 100);
    card.innerHTML = `
      <span class="animal-pen-emoji">${pen.emoji}</span>
      <span class="animal-pen-name">${pen.animalName}</span>
      <span class="animal-pen-status ${pen.isReady ? 'ready' : ''}">
        ${pen.isReady ? '可收获!' : `${pen.remainingTime}s`}
      </span>
      <div class="animal-pen-progress">
        <div class="animal-pen-progress-bar" style="width:${progressPercent}%"></div>
      </div>
      <div class="animal-pen-actions">
        <button class="animal-harvest-btn" data-pen="${pen.penIndex}" ${!pen.isReady ? 'disabled' : ''}>收获</button>
        <button class="animal-sell-btn" data-pen="${pen.penIndex}">出售</button>
      </div>
    `;
    card.querySelector('.animal-harvest-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (pen.isReady) { playSound('harvest'); socket.emit('harvest-animal', { penIndex: pen.penIndex }); }
    });
    card.querySelector('.animal-sell-btn').addEventListener('click', e => {
      e.stopPropagation();
      playSound('coin');
      socket.emit('sell-animal', { penIndex: pen.penIndex });
    });
    container.appendChild(card);
  });
}

// 渲染动物到地图格子中
function renderAnimalsOnMap() {
  if (!gameState?.animalPens || !farmGrid) return;

  const { width, height } = gameState;

  // 移除旧的浮动层（如有）
  document.getElementById('animals-layer')?.remove();

  // 清除所有格子上的动物 overlay
  document.querySelectorAll('.animal-in-cell').forEach(el => el.remove());

  const usedPos = new Set();

  gameState.animalPens.forEach((pen, index) => {
    if (!pen.animal) {
      delete animalPositions[index];
      animalElements.delete(index);
      return;
    }

    // 分配格子位置（已有则复用）
    if (!animalPositions[index]) {
      let x, y, tries = 0;
      do {
        x = Math.floor(Math.random() * width);
        y = Math.floor(Math.random() * height);
        tries++;
      } while (usedPos.has(`${x},${y}`) && tries < 100);
      animalPositions[index] = { x, y };
    }
    const { x, y } = animalPositions[index];
    usedPos.add(`${x},${y}`);

    const cell = document.getElementById(`plot-${x}-${y}`);
    if (!cell) return;

    const overlay = document.createElement('div');
    overlay.className = `animal-in-cell${pen.isReady ? ' is-ready' : ''}`;
    overlay.dataset.penIndex = index;
    overlay.innerHTML = `<span class="animal-cell-emoji">${pen.emoji}</span>${pen.isReady ? '<span class="animal-ready-dot">!</span>' : ''}`;
    overlay.addEventListener('click', e => {
      e.stopPropagation();
      showAnimalCellPopup(index, pen, cell);
    });
    cell.appendChild(overlay);
  });
}

// 点击含动物的格子时弹出操作浮窗
function showAnimalCellPopup(penIndex, pen, anchorCell) {
  document.getElementById('animal-cell-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'animal-cell-popup';
  popup.className = 'animal-cell-popup';
  popup.innerHTML = `
    <div class="acp-header">
      <span>${pen.emoji} ${pen.animalName}</span>
      <button class="acp-close">✕</button>
    </div>
    <div class="acp-status${pen.isReady ? ' ready' : ''}">
      ${pen.isReady ? '✅ 可收获产品！' : `⏳ 还需 ${pen.remainingTime} 秒`}
    </div>
    <div class="acp-actions">
      <button class="acp-harvest" ${!pen.isReady ? 'disabled' : ''}>🧺 收获 ${pen.product || ''}</button>
      <button class="acp-sell">💰 出售动物</button>
    </div>
  `;

  // 定位到格子旁边
  const cellRect = anchorCell.getBoundingClientRect();
  const wrapper = document.querySelector('.farm-wrapper');
  const wRect = wrapper.getBoundingClientRect();
  let left = cellRect.right - wRect.left + 6;
  let top  = cellRect.top  - wRect.top;
  // 防止超出右侧
  if (left + 180 > wrapper.offsetWidth) left = cellRect.left - wRect.left - 186;
  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';
  wrapper.appendChild(popup);

  popup.querySelector('.acp-close').onclick = () => popup.remove();
  popup.querySelector('.acp-harvest').onclick = () => {
    if (!pen.isReady) return;
    playSound('harvest');
    socket.emit('harvest-animal', { penIndex });
    popup.remove();
  };
  popup.querySelector('.acp-sell').onclick = () => {
    playSound('coin');
    socket.emit('sell-animal', { penIndex });
    popup.remove();
  };

  // 点弹窗外关闭
  setTimeout(() => {
    const close = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}

// 动物随机移动
function startAnimalMovement() {
  // 清除之前的定时器
  if (animalMoveInterval) {
    clearInterval(animalMoveInterval);
  }
  
  // 每3-5秒随机移动动物
  animalMoveInterval = setInterval(() => {
    if (!gameState?.animalPens || !gameState.width || !gameState.height) return;
    
    const { width, height } = gameState;
    
    Object.keys(animalPositions).forEach(index => {
      const penIndex = parseInt(index);
      const pen = gameState.animalPens[penIndex];
      if (!pen || !pen.animal) return;
      
      const currentPos = animalPositions[penIndex];
      
      // 随机选择移动方向：上、下、左、右 或 不动
      const directions = [
        { dx: 0, dy: -1 },  // 上
        { dx: 0, dy: 1 },   // 下
        { dx: -1, dy: 0 },  // 左
        { dx: 1, dy: 0 },  // 右
        { dx: 0, dy: 0 }   // 不动
      ];
      
      const dir = directions[Math.floor(Math.random() * directions.length)];
      const newX = Math.max(0, Math.min(width - 1, currentPos.x + dir.dx));
      const newY = Math.max(0, Math.min(height - 1, currentPos.y + dir.dy));
      
      // 更新位置
      animalPositions[penIndex] = { x: newX, y: newY };
    });
    
    // 重新渲染动物位置
    renderAnimalsOnMap();
  }, 3000 + Math.random() * 2000); // 3-5秒随机间隔
}

// 初始化 - 简化版：自动进入农场
function init() {
  const savedName = localStorage.getItem(PLAYER_NAME_KEY);
  
  // 自动恢复名字或显示输入框
  if (savedName) {
    currentPlayerName = savedName;
    nameModal.classList.add('hidden');
    initSocket();
    // 连接成功后自动加入（使用 waitForSocketConnection 确保处理连接中状态）
    setTimeout(() => {
      waitForSocketConnection();
    }, 300);
  } else {
    nameModal.classList.remove('hidden');
    setTimeout(() => playerNameInput?.focus(), 100);
    initSocket();
  }
  
  // 初始化商店事件
  initShopEvents();
  
  // 初始化好友系统事件
  initFriendsEvents();
  
  // 初始化害虫防治事件
  initPestControlEvents();
  
  // 监听游戏状态，自动切换到游戏界面
  socket?.on('game-state', (state) => {
    updateGameState(state);
    if (currentRoom && mainScreen?.classList.contains('hidden') === false) {
      switchToGame();
    }
  });
  
  // 地图拖拽功能
  initDragScroll();
  
  // 重置缩放
  resetZoom();
}

// 重置缩放
function resetZoom() {
  scale = 1;
  if (farmGrid) {
    farmGrid.style.transform = 'scale(1)';
    farmGrid.style.transformOrigin = 'center center';
    farmGrid.style.width = '';
    farmGrid.style.height = '';
  }
}

// 地图拖拽滚动和缩放
function initDragScroll() {
  // 拖拽滚动作用在内层滚动容器上（farm-grid-scroll）
  const farmWrapper = document.querySelector('.farm-grid-scroll') || document.querySelector('.farm-wrapper');
  if (!farmWrapper) return;
  
  // 鼠标按下开始拖拽
  farmWrapper.addEventListener('mousedown', (e) => {
    // 只允许在非格子区域拖拽，或者按住中键
    if (e.target.classList.contains('plot-cell')) return;
    if (e.button === 0 || e.button === 1) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      scrollStartX = farmWrapper.scrollLeft;
      scrollStartY = farmWrapper.scrollTop;
      farmWrapper.style.cursor = 'grabbing';
    }
  });
  
  // 鼠标移动
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    
    // 边界检测
    const maxScrollX = farmWrapper.scrollWidth - farmWrapper.clientWidth;
    const maxScrollY = farmWrapper.scrollHeight - farmWrapper.clientHeight;
    
    let newScrollX = scrollStartX - dx;
    let newScrollY = scrollStartY - dy;
    
    // 限制在边界内
    newScrollX = Math.max(0, Math.min(newScrollX, maxScrollX));
    newScrollY = Math.max(0, Math.min(newScrollY, maxScrollY));
    
    farmWrapper.scrollLeft = newScrollX;
    farmWrapper.scrollTop = newScrollY;
  });
  
  // 鼠标释放/离开停止拖拽
  const stopDrag = () => {
    isDragging = false;
    if (farmWrapper) farmWrapper.style.cursor = 'grab';
  };
  
  farmWrapper.addEventListener('mouseup', stopDrag);
  farmWrapper.addEventListener('mouseleave', stopDrag);
  
  // 滚轮缩放功能
  farmWrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta));
      
      if (newScale !== scale) {
        scale = newScale;
        
        // 获取鼠标相对于 farmGrid 的位置
        const rect = farmGrid.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // 应用缩放
        farmGrid.style.transform = `scale(${scale})`;
        farmGrid.style.transformOrigin = `${mouseX}px ${mouseY}px`;
        
        // 调整容器大小以适应缩放
        if (gameState) {
          const cellSize = Math.min(CONFIG.cellSize, Math.min(CONFIG.maxGridWidth / gameState.width, CONFIG.maxGridWidth / gameState.height));
          const gridWidth = gameState.width * cellSize * scale;
          const gridHeight = gameState.height * cellSize * scale;
          farmGrid.style.width = `${gridWidth}px`;
          farmGrid.style.height = `${gridHeight}px`;
        }
      }
    }
  }, { passive: false });
  
  // 初始光标
  farmWrapper.style.cursor = 'grab';
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
    // Escape 取消当前工具
    case 'Escape':
      clearTool();
      handled = true;
      break;
    // 空格键浇水（快捷键，直接操作当前格）
    case ' ':
      e.preventDefault();
      socket.emit('water');
      playSound('water');
      showNotification('💧 浇水', 'info');
      handled = true;
      break;
    // Enter键收获（快捷键，直接操作当前格）
    case 'Enter':
      socket.emit('harvest');
      playSound('harvest');
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
// Farm Game - Main Game Logic
const CONFIG = {
    GRID_SIZE: 20,
    PLANT_COST: 10,
    HARVEST_REWARD: 25,
    GROWTH_TIME: 5000, // 5 seconds to grow
    WATER_BONUS: 1.5,
    API_BASE: '/api'
};

// Game State
let gameState = {
    coins: 100,
    playerName: '农民',
    plots: Array(CONFIG.GRID_SIZE).fill(null).map(() => ({
        planted: false,
        watered: false,
        growthTime: 0,
        cropType: null
    })),
    selectedTool: 'plant'
};

// Sound System using Web Audio API
class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.ctx) return;
        
        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        
        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
    }

    playPlant() {
        this.init();
        // Rising tone for planting
        this.playTone(400, 0.15, 'sine', 0.2);
        setTimeout(() => this.playTone(600, 0.15, 'sine', 0.2), 100);
    }

    playWater() {
        this.init();
        // Watery bubbling sound
        this.playTone(200, 0.3, 'sine', 0.15);
        setTimeout(() => this.playTone(250, 0.2, 'sine', 0.1), 150);
        setTimeout(() => this.playTone(300, 0.2, 'sine', 0.1), 300);
    }

    playHarvest() {
        this.init();
        // Happy success sound
        this.playTone(523, 0.15, 'sine', 0.2); // C5
        setTimeout(() => this.playTone(659, 0.15, 'sine', 0.2), 100); // E5
        setTimeout(() => this.playTone(784, 0.25, 'sine', 0.25), 200); // G5
    }

    playError() {
        this.init();
        this.playTone(200, 0.2, 'square', 0.1);
        setTimeout(() => this.playTone(150, 0.3, 'square', 0.1), 150);
    }

    playCoin() {
        this.init();
        this.playTone(800, 0.1, 'sine', 0.15);
        setTimeout(() => this.playTone(1000, 0.15, 'sine', 0.15), 80);
    }
}

const soundManager = new SoundManager();

// Particle System
class ParticleSystem {
    constructor() {
        this.container = document.getElementById('particles');
    }

    createParticle(x, y, color) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.backgroundColor = color;
        
        // Random offset
        const offsetX = (Math.random() - 0.5) * 60;
        particle.style.setProperty('--offset-x', offsetX + 'px');
        
        this.container.appendChild(particle);
        
        setTimeout(() => particle.remove(), 1000);
    }

    createSuccessParticles(x, y, count = 10) {
        const colors = ['#FFD700', '#4CAF50', '#FF9800', '#8BC34A'];
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createParticle(x + (Math.random() - 0.5) * 50, y, colors[Math.floor(Math.random() * colors.length)]);
            }, i * 50);
        }
    }

    createCoinParticles(x, y, count = 5) {
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createParticle(x, y, '#FFD700');
            }, i * 100);
        }
    }
}

const particleSystem = new ParticleSystem();

// API Communication
class GameAPI {
    constructor() {
        // Operation batching for deduplication
        this.pendingOperations = new Map();
        this.batchTimeout = null;
        this.batchDelay = 100; // ms - batch operations within this window
    }

    async request(endpoint, data) {
        try {
            const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, playerName: gameState.playerName })
            });
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            return { success: false, message: '网络错误' };
        }
    }

    async savePlayerData() {
        return await this.request('/save', {
            coins: gameState.coins,
            plots: gameState.plots
        });
    }

    // Incremental save - only sends changed data
    async savePlayerDataIncremental(coins, plotIndex, plotData) {
        return await this.request('/update', {
            coins: coins,
            plotIndex: plotIndex,
            plotData: plotData
        });
    }

    async logOperation(action, plotIndex, data = {}) {
        return await this.request('/log', {
            action,
            plotIndex,
            ...data,
            timestamp: Date.now()
        });
    }

    async validateAction(action, plotIndex) {
        return await this.request('/validate', {
            action,
            plotIndex,
            plotState: gameState.plots[plotIndex]
        });
    }

    async loadPlayerData() {
        return await this.request('/load', {});
    }
    
    // Debounced incremental save - batches multiple rapid changes
    scheduleIncrementalSave(coins, plotIndex, plotData) {
        const key = `${plotIndex}`;
        
        // Store latest operation for this plot
        this.pendingOperations.set(key, { coins, plotIndex, plotData });
        
        // Clear existing timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        
        // Schedule batched save
        this.batchTimeout = setTimeout(() => {
            this.flushPendingOperations();
        }, this.batchDelay);
    }
    
    async flushPendingOperations() {
        if (this.pendingOperations.size === 0) return;
        
        // Get latest coins from pending operations
        let latestCoins = null;
        let plotUpdates = [];
        
        for (const [key, op] of this.pendingOperations) {
            if (op.coins !== undefined) {
                latestCoins = op.coins;
            }
            if (op.plotIndex !== undefined && op.plotData !== undefined) {
                plotUpdates.push({ plotIndex: op.plotIndex, plotData: op.plotData });
            }
        }
        
        // Send incremental update with all changes
        if (latestCoins !== null || plotUpdates.length > 0) {
            // Send individual plot updates (most recent only)
            for (const update of plotUpdates) {
                await this.savePlayerDataIncremental(latestCoins, update.plotIndex, update.plotData);
            }
        }
        
        this.pendingOperations.clear();
    }
}

const gameAPI = new GameAPI();

// UI Functions
function showMessage(text, type = 'info') {
    const log = document.getElementById('message-log');
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    log.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}

function updateUI() {
    document.getElementById('coins').textContent = gameState.coins;
    document.getElementById('player-name').textContent = gameState.playerName;
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('farm-grid');
    grid.innerHTML = '';
    
    gameState.plots.forEach((plot, index) => {
        const plotEl = document.createElement('div');
        plotEl.className = 'plot';
        
        if (!plot.planted) {
            plotEl.classList.add('empty');
        } else {
            plotEl.classList.add('planted');
            
            const growthPercent = Math.min(100, (Date.now() - plot.growthTime) / CONFIG.GROWTH_TIME * 100);
            
            if (growthPercent >= 100) {
                plotEl.classList.add('ready');
                plotEl.innerHTML = '<span class="crop">🌾</span>';
            } else if (growthPercent >= 50) {
                plotEl.innerHTML = '<span class="crop">🌱</span>';
            } else {
                plotEl.innerHTML = '<span class="crop">🌿</span>';
            }
            
            if (plot.watered) {
                plotEl.classList.add('watered');
            }
        }
        
        plotEl.addEventListener('click', () => handlePlotClick(index));
        grid.appendChild(plotEl);
    });
}

// Game Actions
async function handlePlotClick(index) {
    const action = gameState.selectedTool;
    
    // Server-side validation first
    const validation = await gameAPI.validateAction(action, index);
    if (!validation.valid) {
        showMessage(validation.message || '操作无效', 'error');
        soundManager.playError();
        return;
    }
    
    // Log the action
    gameAPI.logOperation(action, index);
    
    const plot = gameState.plots[index];
    const plotEl = document.querySelectorAll('.plot')[index];
    const rect = plotEl.getBoundingClientRect();
    
    switch (action) {
        case 'plant':
            if (plot.planted) {
                showMessage('这里已经种了庄稼！', 'error');
                soundManager.playError();
                return;
            }
            if (gameState.coins < CONFIG.PLANT_COST) {
                showMessage('金币不足！', 'error');
                soundManager.playError();
                return;
            }
            
            gameState.coins -= CONFIG.PLANT_COST;
            plot.planted = true;
            plot.watered = false;
            plot.growthTime = Date.now();
            
            soundManager.playPlant();
            particleSystem.createSuccessParticles(rect.left + rect.width/2, rect.top + rect.height/2, 8);
            showMessage('种植成功！-10金币', 'success');
            break;
            
        case 'water':
            if (!plot.planted) {
                showMessage('没有可浇水的庄稼！', 'error');
                soundManager.playError();
                return;
            }
            if (plot.watered) {
                showMessage('已经浇过水了！', 'error');
                soundManager.playError();
                return;
            }
            
            plot.watered = true;
            plot.growthTime = Date.now() - (CONFIG.GROWTH_TIME * 0.5); // Speed up growth
            
            soundManager.playWater();
            particleSystem.createSuccessParticles(rect.left + rect.width/2, rect.top + rect.height/2, 5, '#00BFFF');
            showMessage('浇水成功！作物生长加速！', 'success');
            break;
            
        case 'harvest':
            if (!plot.planted) {
                showMessage('没有可收获的庄稼！', 'error');
                soundManager.playError();
                return;
            }
            
            const growthPercent = Math.min(100, (Date.now() - plot.growthTime) / CONFIG.GROWTH_TIME * 100);
            if (growthPercent < 100) {
                showMessage('庄稼还没熟呢！', 'error');
                soundManager.playError();
                return;
            }
            
            let reward = CONFIG.HARVEST_REWARD;
            if (plot.watered) {
                reward = Math.floor(reward * CONFIG.WATER_BONUS);
            }
            
            gameState.coins += reward;
            plot.planted = false;
            plot.watered = false;
            plot.growthTime = 0;
            
            soundManager.playHarvest();
            soundManager.playCoin();
            particleSystem.createCoinParticles(rect.left + rect.width/2, rect.top + rect.height/2, 8);
            showMessage(`收获成功！+${reward}金币`, 'success');
            break;
    }
    
    updateUI();
    
    // Save to server using incremental sync (batched)
    gameAPI.scheduleIncrementalSave(gameState.coins, index, {
        planted: plot.planted,
        watered: plot.watered,
        growthTime: plot.growthTime,
        cropType: plot.cropType
    });
}

// Tool Selection
function setupToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.selectedTool = btn.dataset.tool;
        });
    });
}

// Name Editing
function setupNameEditing() {
    const editBtn = document.getElementById('edit-name-btn');
    const nameInput = document.getElementById('name-input');
    const playerName = document.getElementById('player-name');
    
    editBtn.addEventListener('click', () => {
        nameInput.classList.remove('hidden');
        nameInput.value = gameState.playerName;
        nameInput.focus();
        playerName.classList.add('hidden');
    });
    
    nameInput.addEventListener('blur', async () => {
        const newName = nameInput.value.trim() || '农民';
        gameState.playerName = newName;
        nameInput.classList.add('hidden');
        playerName.classList.remove('hidden');
        playerName.textContent = newName;
        
        await gameAPI.savePlayerData();
    });
    
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            nameInput.blur();
        }
    });
}

// Growth Timer
function startGrowthTimer() {
    setInterval(() => {
        if (gameState.plots.some(p => p.planted)) {
            renderGrid();
        }
    }, 1000);
}

// Initialize Game
async function initGame() {
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Try to load player data from server
    try {
        const data = await gameAPI.loadPlayerData();
        if (data && data.coins !== undefined) {
            gameState.coins = data.coins;
            gameState.playerName = data.playerName || '农民';
            if (data.plots && data.plots.length === CONFIG.GRID_SIZE) {
                gameState.plots = data.plots;
            }
        }
    } catch (e) {
        console.log('Starting with default data');
    }
    
    // Hide loading, show game
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    setupToolButtons();
    setupNameEditing();
    startGrowthTimer();
    updateUI();
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', initGame);

// Auto-save every 30 seconds (incremental - sends all plots)
setInterval(async () => {
    if (document.getElementById('game-container').classList.contains('hidden')) return;
    
    // Send all plots incrementally
    for (let i = 0; i < gameState.plots.length; i++) {
        await gameAPI.savePlayerDataIncremental(gameState.coins, i, gameState.plots[i]);
    }
}, 30000);
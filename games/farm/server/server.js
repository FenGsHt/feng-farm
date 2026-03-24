const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager, CROPS } = require('./game');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
  },
  path: "/socket.io/",
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: false
});

app.use(express.json());

// Serve static files from client directory
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// Room manager
const roomManager = new RoomManager();

// Session management
const sessions = new Map();
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function createSession(socketId) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    socketId,
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  // Check if expired
  if (Date.now() - session.lastActivity > SESSION_EXPIRY_MS) {
    sessions.delete(sessionId);
    return null;
  }
  
  // Update last activity
  session.lastActivity = Date.now();
  return session;
}

function removeSession(sessionId) {
  sessions.delete(sessionId);
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_EXPIRY_MS) {
      sessions.delete(sessionId);
      console.log(`[Session] Expired session: ${sessionId}`);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  let currentRoomId = null;
  let currentSessionId = null;
  
  // Create new session on connect
  const session = createSession(socket.id);
  currentSessionId = session.id;
  socket.emit('session-created', { sessionId: currentSessionId });
  console.log(`[Session] Created: ${currentSessionId} for socket ${socket.id}`);
  
  // Send room list
  socket.emit('room-list', roomManager.getRoomList());
  
  // Join room
  socket.on('join-room', ({ roomId, playerName, width = 10, height = 10 }) => {
    // Leave current room if any
    if (currentRoomId) {
      roomManager.removePlayer(currentRoomId, socket.id);
      socket.leave(currentRoomId);
    }
    
    // Create or get room
    const room = roomManager.createRoom(roomId, width, height);
    currentRoomId = roomId;
    
    // Add player
    const player = roomManager.addPlayer(roomId, socket.id, playerName || '匿名农夫');
    
    socket.join(roomId);
    socket.emit('player-info', player);
    
    // Broadcast to room
    io.to(roomId).emit('game-state', room.game.getState());
    io.emit('room-list', roomManager.getRoomList());
    
    console.log(`[Socket] ${player.name} joined room: ${roomId}`);
  });
  
  // Move player
  socket.on('move', ({ x, y }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.movePlayer(socket.id, x, y);
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Plant crop
  socket.on('plant', ({ cropType }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.plant(socket.id, cropType);
    socket.emit('action-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Water crop
  socket.on('water', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.water(socket.id);
    socket.emit('action-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Harvest crop
  socket.on('harvest', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.harvest(socket.id);
    if (result.success) {
      result.message = `收获成功！+${result.reward}金币`;
    }
    socket.emit('action-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Remove crop (铲除)
  socket.on('remove-crop', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.removeCrop(socket.id);
    socket.emit('action-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Buy item from shop
  socket.on('buy-item', ({ itemId, quantity = 1 }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.buyItem(socket.id, itemId, quantity);
    socket.emit('shop-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Sell item from inventory
  socket.on('sell-item', ({ cropType, quantity = 1 }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.sellItem(socket.id, cropType, quantity);
    socket.emit('shop-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Use item
  socket.on('use-item', ({ itemId }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.useItem(socket.id, itemId);
    socket.emit('action-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Get shop items
  socket.on('get-shop', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const shopItems = room.game.getShopItems();
    socket.emit('shop-items', shopItems);
  });
  
  // Get leaderboard
  socket.on('get-leaderboard', (type = 'money') => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const leaderboard = room.game.getLeaderboard(type);
    socket.emit('leaderboard-data', { type, data: leaderboard });
  });
  
  // Add friend
  socket.on('add-friend', ({ friendName }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player) return;
    
    // Check if friend exists in the room
    const friend = Array.from(room.players.values()).find(p => p.name === friendName);
    if (!friend) {
      socket.emit('friend-result', { success: false, message: '玩家不存在或已离线' });
      return;
    }
    
    if (friend.id === socket.id) {
      socket.emit('friend-result', { success: false, message: '不能添加自己为好友' });
      return;
    }
    
    // Initialize friends list if not exists
    if (!player.friends) {
      player.friends = [];
    }
    
    // Check if already a friend
    if (player.friends.includes(friendName)) {
      socket.emit('friend-result', { success: false, message: '已经是好友了' });
      return;
    }
    
    player.friends.push(friendName);
    socket.emit('friend-result', { success: true, message: `已添加 ${friendName} 为好友` });
    socket.emit('friends-list', player.friends);
  });
  
  // Remove friend
  socket.on('remove-friend', ({ friendName }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.friends) {
      socket.emit('friend-result', { success: false, message: '好友列表为空' });
      return;
    }
    
    const index = player.friends.indexOf(friendName);
    if (index > -1) {
      player.friends.splice(index, 1);
      socket.emit('friend-result', { success: true, message: `已删除好友 ${friendName}` });
      socket.emit('friends-list', player.friends);
    } else {
      socket.emit('friend-result', { success: false, message: '该好友不存在' });
    }
  });
  
  // Get friends list with online status
  socket.on('get-friends', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.friends) {
      socket.emit('friends-list', []);
      return;
    }
    
    // Get online status for each friend
    const friendsWithStatus = player.friends.map(friendName => {
      const friend = Array.from(room.players.values()).find(p => p.name === friendName);
      return {
        name: friendName,
        online: !!friend,
        money: friend ? friend.money : null
      };
    });
    
    socket.emit('friends-list-detailed', friendsWithStatus);
  });
  
  // Visit friend's farm
  socket.on('visit-friend', ({ friendName }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const friend = Array.from(room.players.values()).find(p => p.name === friendName);
    if (!friend) {
      socket.emit('friend-result', { success: false, message: '好友不在线或不存在' });
      return;
    }
    
    // Send friend's farm data (simplified - just move to their position)
    socket.emit('friend-farm-data', {
      name: friend.name,
      position: friend.position,
      money: friend.money
    });
  });
  
  // Buy animal
  socket.on('buy-animal', ({ animalType }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.buyAnimal(socket.id, animalType);
    socket.emit('shop-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Harvest animal product
  socket.on('harvest-animal', ({ penIndex }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.harvestAnimalProduct(socket.id, penIndex);
    socket.emit('action-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Sell animal
  socket.on('sell-animal', ({ penIndex }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.sellAnimal(socket.id, penIndex);
    socket.emit('shop-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });
  
  // Sell animal product
  socket.on('sell-animal-product', ({ productKey, quantity = 1 }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.sellAnimalProduct(socket.id, productKey, quantity);
    socket.emit('shop-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
    }
  });

  // ====== 任务系统 ======
  // 获取任务列表
  socket.on('get-tasks', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const tasks = room.game.getPlayerTasks(socket.id);
    socket.emit('tasks-data', tasks);
  });
  
  // 领取任务奖励
  socket.on('claim-task', ({ taskId }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.claimTaskReward(socket.id, taskId);
    socket.emit('task-claim-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
      // 更新任务数据
      const tasks = room.game.getPlayerTasks(socket.id);
      socket.emit('tasks-data', tasks);
    }
  });
  
  // 领取成就奖励
  socket.on('claim-achievement', ({ achievementId }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    
    const result = room.game.claimAchievementReward(socket.id, achievementId);
    socket.emit('achievement-claim-result', result);
    
    if (result.success) {
      io.to(currentRoomId).emit('game-state', room.game.getState());
      // 更新任务数据
      const tasks = room.game.getPlayerTasks(socket.id);
      socket.emit('tasks-data', tasks);
    }
  });
  
  // New farm (reset)
  socket.on('new-farm', () => {
    if (!currentRoomId) return;
    // This would reset the farm - for now just notify
    socket.emit('notification', { message: '农场重置功能暂未实现' });
  });
  
  // Leave room
  socket.on('leave-room', () => {
    if (currentRoomId) {
      roomManager.removePlayer(currentRoomId, socket.id);
      socket.leave(currentRoomId);
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        io.to(currentRoomId).emit('game-state', room.game.getState());
      }
      io.emit('room-list', roomManager.getRoomList());
      currentRoomId = null;
    }
    // Note: session persists for reconnection
  });
  
  // Validate session (for reconnection or state recovery)
  socket.on('validate-session', ({ sessionId }, callback) => {
    const session = getSession(sessionId);
    if (session) {
      // Update socket association
      session.socketId = socket.id;
      currentSessionId = sessionId;
      callback({ valid: true, sessionId });
      console.log(`[Session] Validated: ${sessionId}`);
    } else {
      // Create new session
      const newSession = createSession(socket.id);
      currentSessionId = newSession.id;
      callback({ valid: false, newSessionId: newSession.id });
      console.log(`[Session] Invalid, created new: ${newSession.id}`);
    }
  });
  
  // Request new session
  socket.on('request-new-session', (callback) => {
    const newSession = createSession(socket.id);
    currentSessionId = newSession.id;
    if (typeof callback === 'function') {
      callback({ sessionId: newSession.id });
    } else {
      socket.emit('session-created', { sessionId: newSession.id });
    }
    console.log(`[Session] New session requested: ${newSession.id}`);
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    if (currentSessionId) {
      // Keep session for potential reconnection
      const session = sessions.get(currentSessionId);
      if (session) {
        session.lastActivity = Date.now(); // Mark for cleanup check
      }
    }
    if (currentRoomId) {
      roomManager.removePlayer(currentRoomId, socket.id);
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        io.to(currentRoomId).emit('game-state', room.game.getState());
      }
      io.emit('room-list', roomManager.getRoomList());
    }
  });
});

// API Routes for compatibility
app.get('/api/crops', (req, res) => {
  res.json(CROPS);
});

const PORT = process.env.PORT || 19000;
httpServer.listen(PORT, () => {
  console.log(`🌾 Farm Game Server running on http://localhost:${PORT}`);
  console.log(`📁 Socket.IO enabled for real-time multiplayer`);
});

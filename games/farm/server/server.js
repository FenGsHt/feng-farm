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
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

// Serve static files from client directory
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// Room manager
const roomManager = new RoomManager();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  let currentRoomId = null;
  
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
      io.to(currentRoomId).emit('game-state', roomManager.getRoom(currentRoomId).game.getState());
      io.emit('room-list', roomManager.getRoomList());
      currentRoomId = null;
    }
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    if (currentRoomId) {
      roomManager.removePlayer(currentRoomId, socket.id);
      io.to(currentRoomId).emit('game-state', roomManager.getRoom(currentRoomId).game.getState());
      io.emit('room-list', roomManager.getRoomList());
    }
  });
});

// API Routes for compatibility
app.get('/api/crops', (req, res) => {
  res.json(CROPS);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🌾 Farm Game Server running on http://localhost:${PORT}`);
  console.log(`📁 Socket.IO enabled for real-time multiplayer`);
});

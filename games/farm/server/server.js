// 多人种田游戏 WebSocket 服务
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { RoomManager, FarmGame } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager();
const DEFAULT_ROOM = '公共农场';

// 预创建默认房间
roomManager.createRoom(DEFAULT_ROOM, 12, 12);
roomManager.rooms.get(DEFAULT_ROOM).persist = true;

// 静态文件服务
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));

// 根路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// 广播房间列表
function broadcastRoomList() {
  io.emit('room-list', roomManager.getRoomList());
}

io.on('connection', (socket) => {
  console.log(`[Farm] Client connected: ${socket.id}`);

  // 连接时推送房间列表
  socket.emit('room-list', roomManager.getRoomList());

  let currentRoom = null;
  let currentPlayer = null;

  // 获取房间列表
  socket.on('get-rooms', () => {
    socket.emit('room-list', roomManager.getRoomList());
  });

  // 加入房间
  socket.on('join-room', ({ roomId, playerName, width, height }) => {
    if (!roomId) {
      socket.emit('error', { message: '房间号不能为空' });
      return;
    }

    // 离开之前的房间
    if (currentRoom) {
      socket.leave(currentRoom);
      roomManager.removePlayer(currentRoom, socket.id);
      const prevRoom = roomManager.getRoom(currentRoom);
      if (prevRoom) {
        io.to(currentRoom).emit('game-state', prevRoom.game.getState());
      }
    }

    // 创建或加入房间
    const w = Math.min(Math.max(parseInt(width) || 12, 5), 20);
    const h = Math.min(Math.max(parseInt(height) || 12, 5), 20);
    const room = roomManager.createRoom(roomId, w, h);
    currentRoom = roomId;
    currentPlayer = roomManager.addPlayer(roomId, socket.id, playerName || '匿名农夫');
    socket.join(roomId);

    console.log(`[Farm] Player ${currentPlayer.name} joined room ${roomId}`);

    io.to(roomId).emit('game-state', room.game.getState());
    socket.emit('player-info', currentPlayer);
    broadcastRoomList();
  });

  // 离开房间
  socket.on('leave-room', () => {
    if (currentRoom) {
      roomManager.removePlayer(currentRoom, socket.id);
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        io.to(currentRoom).emit('game-state', room.game.getState());
      }
      socket.leave(currentRoom);
      currentRoom = null;
      currentPlayer = null;
      broadcastRoomList();
    }
  });

  // 移动玩家
  socket.on('move', ({ x, y }) => {
    if (!currentRoom || !currentPlayer) return;

    const room = roomManager.getRoom(currentRoom);
    if (!room) return;

    const result = room.game.movePlayer(socket.id, x, y);
    if (result.success) {
      io.to(currentRoom).emit('game-state', room.game.getState());
    }
  });

  // 种植
  socket.on('plant', ({ cropType }) => {
    if (!currentRoom || !currentPlayer) return;

    const room = roomManager.getRoom(currentRoom);
    if (!room) return;

    const result = room.game.plant(socket.id, cropType);
    if (result.success) {
      io.to(currentRoom).emit('game-state', room.game.getState());
      socket.emit('action-result', { 
        success: true, 
        action: 'plant', 
        message: `种植了 ${room.game.players.get(socket.id).money} 金币剩余` 
      });
    } else {
      socket.emit('action-result', { success: false, action: 'plant', message: result.message });
    }
  });

  // 浇水
  socket.on('water', () => {
    if (!currentRoom || !currentPlayer) return;

    const room = roomManager.getRoom(currentRoom);
    if (!room) return;

    const result = room.game.water(socket.id);
    if (result.success) {
      io.to(currentRoom).emit('game-state', room.game.getState());
      socket.emit('action-result', { success: true, action: 'water', message: '浇水成功！' });
    } else {
      socket.emit('action-result', { success: false, action: 'water', message: result.message });
    }
  });

  // 收获
  socket.on('harvest', () => {
    if (!currentRoom || !currentPlayer) return;

    const room = roomManager.getRoom(currentRoom);
    if (!room) return;

    const result = room.game.harvest(socket.id);
    if (result.success) {
      io.to(currentRoom).emit('game-state', room.game.getState());
      socket.emit('action-result', { 
        success: true, 
        action: 'harvest', 
        message: `收获成功！获得 ${result.reward} 金币` 
      });
    } else {
      socket.emit('action-result', { success: false, action: 'harvest', message: result.message });
    }
  });

  // 新建农场（重置）
  socket.on('new-farm', (data) => {
    if (!currentRoom) return;

    const room = roomManager.getRoom(currentRoom);
    if (!room) return;

    const width = (data && data.width) ? Math.min(Math.max(parseInt(data.width), 5), 20) : room.game.width;
    const height = (data && data.height) ? Math.min(Math.max(parseInt(data.height), 5), 20) : room.game.height;

    // 保留玩家，重置游戏
    const players = Array.from(room.game.players.values());
    room.game = new FarmGame(width, height);
    
    // 重新添加玩家
    players.forEach(p => {
      room.game.addPlayer(p.id, p.name);
      room.game.players.get(p.id).money = 50; // 重置资金
    });

    io.to(currentRoom).emit('game-state', room.game.getState());
    io.to(currentRoom).emit('notification', { message: '农场已重置！' });
    
    if (currentRoom === DEFAULT_ROOM) {
      broadcastRoomList();
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`[Farm] Client disconnected: ${socket.id}`);
    if (currentRoom) {
      roomManager.removePlayer(currentRoom, socket.id);
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        io.to(currentRoom).emit('game-state', room.game.getState());
      }
      broadcastRoomList();
    }
  });
});

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`[Farm] Server running on port ${PORT}`);
});

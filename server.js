// server.js - Updated with matchmaking
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { /* cors config */ });

// Matchmaking state
const queue = [];
const rooms = new Map(); // roomID -> { players: [id1, id2], state: {...} }

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Matchmaking handler
  socket.on('findMatch', () => {
    if (queue.includes(socket.id)) return;
    
    queue.push(socket.id);
    console.log(`Player ${socket.id} entered queue (${queue.length} waiting)`);

    if (queue.length >= 2) {
      const [player1, player2] = queue.splice(0, 2);
      const roomId = `room_${player1}_${player2}`;
      
      rooms.set(roomId, {
        players: [player1, player2],
        states: {
          [player1]: createPlayerState(player1),
          [player2]: createPlayerState(player2)
        }
      });

      [player1, player2].forEach(playerId => {
        const socket = io.sockets.sockets.get(playerId);
        if (!socket) return;
        
        socket.join(roomId);
        const opponentId = playerId === player1 ? player2 : player1;
        
        // Send both players' initial states
        socket.emit('matchFound', {
          roomId,
          opponent: opponentId,
          opponentState: rooms.get(roomId).states[opponentId], // Get from 'states'
          yourState: rooms.get(roomId).states[playerId]
        });
      });
      console.log('Match started:', roomId);
    }
  });

  // Modify existing handlers to scope to rooms
  socket.on('playerUpdate', (state) => {
    const room = getPlayerRoom(socket);
    if (!room) return;
  
    // Update the correct state storage
    room.states[socket.id] = { ...room.states[socket.id], ...state };
    socket.to(room.id).emit('playerUpdated', socket.id, state);
  });

  socket.on('shoot', (gunSide) => {
    const room = getPlayerRoom(socket);
    if (room) socket.to(room.id).emit('playerShot', socket.id, gunSide);
  });

  socket.on('playerHit', ({ victimId, damage, shooterId }) => {
    const room = getPlayerRoom(socket);
    if (!room) return;

    const victim = room.states[victimId];
    if (!victim) return;

    victim.hp = Math.max(0, victim.hp - damage);
    io.to(room.id).emit('playerUpdated', victimId, { hp: victim.hp });

    if (victim.hp === 0) {
      io.to(room.id).emit('playerKilled', { shooterId, victimId });
      setTimeout(() => resetRoom(room.id), 5000);
    }
  });

  // Update disconnect handler
  socket.on('disconnect', () => {
    const room = getPlayerRoom(socket);
    if (room) {
      socket.to(room.id).emit('playerLeft');
      resetRoom(room.id);
    }
    const queueIndex = queue.indexOf(socket.id);
    if (queueIndex > -1) queue.splice(queueIndex, 1);
  });
});

// Helpers
function createPlayerState(id) {
  return {
    id,
    position: [0, 1.6, 0],
    rotation: [0, 0, 0],
    hp: 100,
    ammoLeft: 8,
    ammoRight: 8
  };
}

function getPlayerRoom(socket) {
  // Rename the local variable to avoid conflict with the Map
  const roomIds = Array.from(socket.rooms).filter(r => r.startsWith('room_'));
  return roomIds.length ? { 
    id: roomIds[0], 
    ...rooms.get(roomIds[0])  // Now using the Map's get() method
  } : null;
}

function resetRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    room.players.forEach(playerId => {
      const socket = io.sockets.sockets.get(playerId);
      if (socket) {
        socket.leave(roomId);
        socket.emit('matchEnded');
      }
    });
    rooms.delete(roomId);
    console.log(`Room ${roomId} cleaned up`);
  }
}

server.listen(3000);
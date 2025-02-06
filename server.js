// server.js - Updated with matchmaking and movement logging
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Matchmaking state
const queue = [];
const rooms = new Map(); // roomID -> { players: [id1, id2], states: {...} }

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
        const playerSocket = io.sockets.sockets.get(playerId);
        if (!playerSocket) return;
        
        playerSocket.join(roomId);
        const opponentId = playerId === player1 ? player2 : player1;
        
        // Send both players' initial states
        playerSocket.emit('matchFound', {
          roomId,
          opponent: opponentId,
          opponentState: rooms.get(roomId).states[opponentId],
          yourState: rooms.get(roomId).states[playerId]
        });
      });
      console.log('Match started:', roomId);
    }
  });

  // Handler for movement/other updates
  socket.on('playerUpdate', (state) => {
    const room = getPlayerRoom(socket);
    if (!room) return;
  
    // Update the stored state for the player
    room.states[socket.id] = { ...room.states[socket.id], ...state };

    // Broadcast update to the other player(s) in the room
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
    console.log(`Player ${victimId} was hit by ${shooterId} for ${damage} damage. New HP: ${victim.hp}`);

    if (victim.hp === 0) {
      io.to(room.id).emit('playerKilled', { shooterId, victimId });
      setTimeout(() => resetRoom(room.id), 5000);
    }
  });

  socket.on('disconnect', () => {
    const room = getPlayerRoom(socket);
    if (room) {
      socket.to(room.id).emit('playerLeft');
      resetRoom(room.id);
    }
    const queueIndex = queue.indexOf(socket.id);
    if (queueIndex > -1) queue.splice(queueIndex, 1);
    console.log('Player disconnected:', socket.id);
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
  // Look for room names that start with "room_"
  const roomIds = Array.from(socket.rooms).filter(r => r.startsWith('room_'));
  return roomIds.length ? { 
    id: roomIds[0], 
    ...rooms.get(roomIds[0])
  } : null;
}

function resetRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    room.players.forEach(playerId => {
      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.leave(roomId);
        playerSocket.emit('matchEnded');
      }
    });
    rooms.delete(roomId);
    console.log(`Room ${roomId} cleaned up`);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

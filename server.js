// server.js
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

  socket.on('findMatch', () => {
    if (queue.includes(socket.id)) return;
    queue.push(socket.id);
    console.log(`Player ${socket.id} entrou na fila (${queue.length} na fila)`);

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
        const opponentId = (playerId === player1) ? player2 : player1;

        // Mandar cada jogador para a partida
        playerSocket.emit('matchFound', {
          roomId,
          opponent: opponentId,
          opponentState: rooms.get(roomId).states[opponentId],
          yourState: rooms.get(roomId).states[playerId]
        });
      });
      console.log('Match iniciado:', roomId);
    }
  });

  socket.on('playerUpdate', (state) => {
    const room = getPlayerRoom(socket);
    if (!room) return;

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

    console.log(`Player ${victimId} foi atingido por ${shooterId}, dano ${damage}, HP: ${victim.hp}`);

    if (victim.hp === 0) {
      // Notifica kill
      io.to(room.id).emit('playerKilled', { shooterId, victimId });

      // Adiciona kill pro atirador
      room.states[shooterId].score++;

      // Atualiza score para todos
      io.to(room.id).emit('scoreUpdate', {
        [shooterId]: room.states[shooterId].score,
        [victimId]: room.states[victimId].score
      });

      // Verifica se chegou a 3 kills (vitória)
      if (room.states[shooterId].score >= 3) {
        io.to(room.id).emit('matchWin', {
          winnerId: shooterId,
          scores: {
            [shooterId]: room.states[shooterId].score,
            [victimId]: room.states[victimId].score
          }
        });
        setTimeout(() => resetRoom(room.id), 5000);
      } else {
        // Apenas reset de round
        roundReset(room, room.id);
      }
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

// Função para criar estado inicial de um player
function createPlayerState(id) {
  return {
    id,
    position: [0, 1.6, 0],
    rotation: [0, 0, 0],
    hp: 100,
    ammoLeft: 8,
    ammoRight: 8,
    score: 0 // <-- Campo de pontuação
  };
}

function getPlayerRoom(socket) {
  const roomIds = Array.from(socket.rooms).filter(r => r.startsWith('room_'));
  return roomIds.length ? {
    id: roomIds[0],
    ...rooms.get(roomIds[0])
  } : null;
}

// Reseta a partida completamente
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
    console.log(`Room ${roomId} encerrado`);
  }
}

// Reseta apenas o ROUND (HP, ammo, posição)
function roundReset(room, roomId) {
  for (const pid of room.players) {
    const st = room.states[pid];
    st.hp = 100;
    st.ammoLeft = 8;
    st.ammoRight = 8;
    st.position = [0, 1.6, 0]; // Pode trocar pra spawn aleatório, etc.

    // Notifica cada cliente desse reset
    io.to(roomId).emit('roundReset', {
      playerId: pid,
      state: st
    });
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escutando na porta ${PORT}`);
});

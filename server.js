// server.js (Node server)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// Keep track of connected players
const players = {};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Initialize a new player with default values
  players[socket.id] = {
    id: socket.id,
    position: [0, 1.6, 0],
    rotation: [0, 0, 0],
    hp: 100,
    ammoLeft: 4,
    ammoRight: 4
  };

  // Send the existing players to the newly joined client
  socket.emit('currentPlayers', players);

  // Tell all other clients that a new player has joined
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // When a player sends an update (position, rotation, HP, ammo, etc.)
  socket.on('playerUpdate', (state) => {
    if (players[socket.id]) {
      // Merge the new state into the player's existing state
      players[socket.id] = { ...players[socket.id], ...state };
      // Broadcast that update to everyone else (but not the sender)
      socket.broadcast.emit('playerUpdated', socket.id, state);
    }
  });

  // When a player fires a gun
  socket.on('shoot', (gunSide) => {
    // Broadcast to everyone else that this player has fired
    socket.broadcast.emit('playerShot', socket.id, gunSide);
  });

  // When a projectile hits a player
  socket.on('playerHit', ({ victimId, damage, shooterId }) => {
    const victim = players[victimId];
    if (!victim) return; // Could be invalid or already disconnected

    // Subtract HP (clamp to at least 0)
    victim.hp = Math.max(0, victim.hp - damage);

    // Broadcast the updated HP so all clients see it
    io.emit('playerUpdated', victimId, { hp: victim.hp });

    if (victim.hp === 0) {
        io.emit('playerKilled', { shooterId, victimId });
      }
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
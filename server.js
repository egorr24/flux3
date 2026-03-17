const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Статические файлы - ПЕРВЫМ ДЕЛОМ
app.use(express.static('public'));

// Только один маршрут для звонков
app.get('/call/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'call.html'));
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO для видеозвонков
const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(socket.id);
    
    socket.to(roomId).emit('user-connected', socket.id);
  });

  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', data);
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', data);
  });

  socket.on('disconnect', () => {
    for (let roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-disconnected', socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
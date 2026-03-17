const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Статические файлы
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница звонка
app.get('/call/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'call.html'));
});

// Хранилище активных комнат
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);

  // Присоединение к комнате
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    
    rooms.get(roomId).add(socket.id);
    
    // Уведомляем других участников о новом пользователе
    socket.to(roomId).emit('user-connected', socket.id);
    
    console.log(`Пользователь ${socket.id} присоединился к комнате ${roomId}`);
  });

  // Обработка WebRTC сигналов
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
    
    // Удаляем из всех комнат
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        socket.to(roomId).emit('user-disconnected', socket.id);
        
        if (users.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
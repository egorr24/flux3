const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Настройка PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/videocalls',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Инициализация базы данных
async function initDatabase() {
  try {
    // Создаем таблицу пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Создаем таблицу сессий
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
      WITH (OIDS=FALSE);
      
      ALTER TABLE session DROP CONSTRAINT IF EXISTS session_pkey;
      ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
      
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
    `);

    // Создаем таблицу комнат (для истории)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) UNIQUE NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL
      )
    `);

    console.log('База данных инициализирована успешно');
  } catch (error) {
    console.error('Ошибка инициализации базы данных:', error);
    process.exit(1);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка сессий с PostgreSQL
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'video-call-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Хранилище активных комнат (в памяти для WebRTC)
const activeRooms = {};

// Статические файлы
app.use(express.static('public'));

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Функции для работы с пользователями
async function createUser(username, email, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const result = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
    [username, email, hashedPassword]
  );
  
  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  
  return result.rows[0];
}

async function findUserById(id) {
  const result = await pool.query(
    'SELECT id, username, email, created_at FROM users WHERE id = $1',
    [id]
  );
  
  return result.rows[0];
}

async function checkUserExists(username, email) {
  const result = await pool.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  
  return result.rows.length > 0;
}

async function createRoom(roomId, userId) {
  try {
    await pool.query(
      'INSERT INTO rooms (room_id, created_by) VALUES ($1, $2)',
      [roomId, userId]
    );
  } catch (error) {
    console.error('Ошибка создания комнаты в БД:', error);
  }
}

// API маршруты
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Имя пользователя должно быть от 3 до 50 символов' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }
    
    // Проверяем существование пользователя
    const userExists = await checkUserExists(username, email);
    if (userExists) {
      return res.status(400).json({ error: 'Пользователь с таким email или именем уже существует' });
    }
    
    // Создаем пользователя
    const user = await createUser(username, email, password);
    
    // Авторизуем пользователя
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({ success: true, username: user.username });
    
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    
    // Ищем пользователя
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }
    
    // Проверяем пароль
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }
    
    // Авторизуем пользователя
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({ success: true, username: user.username });
    
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Ошибка выхода:', err);
      return res.status(500).json({ error: 'Ошибка выхода' });
    }
    res.json({ success: true });
  });
});

app.get('/api/user', async (req, res) => {
  try {
    if (req.session.userId) {
      const user = await findUserById(req.session.userId);
      if (user) {
        res.json({ 
          id: user.id,
          username: user.username, 
          email: user.email,
          isAuthenticated: true 
        });
      } else {
        req.session.destroy();
        res.json({ isAuthenticated: false });
      }
    } else {
      res.json({ isAuthenticated: false });
    }
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// API для создания комнаты
app.post('/api/create-room', requireAuth, async (req, res) => {
  try {
    const roomId = Math.random().toString(36).substring(2, 15);
    await createRoom(roomId, req.session.userId);
    
    res.json({ 
      success: true, 
      roomId,
      roomLink: `${req.protocol}://${req.get('host')}/call/${roomId}`
    });
  } catch (error) {
    console.error('Ошибка создания комнаты:', error);
    res.status(500).json({ error: 'Ошибка создания комнаты' });
  }
});

// HTML маршруты
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/call/:roomId', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'call.html'));
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO для видеозвонков
io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!activeRooms[roomId]) {
      activeRooms[roomId] = [];
    }
    activeRooms[roomId].push(socket.id);
    
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
    for (let roomId in activeRooms) {
      activeRooms[roomId] = activeRooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-disconnected', socket.id);
      
      // Удаляем пустые комнаты
      if (activeRooms[roomId].length === 0) {
        delete activeRooms[roomId];
      }
    }
  });
});

// Запуск сервера
async function startServer() {
  try {
    await initDatabase();
    
    server.listen(PORT, () => {
      console.log(`Сервер запущен на порту ${PORT}`);
      console.log(`База данных: ${process.env.DATABASE_URL ? 'PostgreSQL (Railway)' : 'PostgreSQL (локальная)'}`);
    });
  } catch (error) {
    console.error('Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

startServer();
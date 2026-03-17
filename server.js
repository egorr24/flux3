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

// Простая настройка PostgreSQL - работает без базы по умолчанию
let pool = null;
let isDatabaseConnected = false;

// Пытаемся подключиться к базе данных если есть URL
async function initPostgreSQL() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!dbUrl) {
    console.log('📝 База данных не настроена - работаем в демо режиме');
    console.log('💡 Для подключения PostgreSQL добавьте переменную DATABASE_URL');
    return false;
  }

  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Тестируем подключение
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    // Создаем таблицы
    await createTables();
    
    console.log('✅ PostgreSQL подключен успешно');
    return true;
  } catch (error) {
    console.log('❌ Ошибка PostgreSQL:', error.message);
    console.log('📝 Продолжаем работу в демо режиме');
    pool = null;
    return false;
  }
}

// Создание таблиц
async function createTables() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(50) UNIQUE NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Простые сессии в памяти (работает всегда)
const memoryStore = new Map();

app.use(session({
  secret: process.env.SESSION_SECRET || 'demo-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Railway автоматически обрабатывает HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  },
  // Используем память если нет PostgreSQL
  store: isDatabaseConnected && pool ? new (require('connect-pg-simple')(session))({
    pool: pool,
    tableName: 'session'
  }) : undefined
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
  if (!isDatabaseConnected) {
    throw new Error('База данных недоступна');
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const result = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
    [username, email, hashedPassword]
  );
  
  return result.rows[0];
}

async function findUserByEmail(email) {
  if (!isDatabaseConnected) {
    throw new Error('База данных недоступна');
  }
  
  const result = await pool.query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  
  return result.rows[0];
}

async function findUserById(id) {
  if (!isDatabaseConnected) {
    throw new Error('База данных недоступна');
  }
  
  const result = await pool.query(
    'SELECT id, username, email, created_at FROM users WHERE id = $1',
    [id]
  );
  
  return result.rows[0];
}

async function checkUserExists(username, email) {
  if (!isDatabaseConnected) {
    throw new Error('База данных недоступна');
  }
  
  const result = await pool.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  
  return result.rows.length > 0;
}

async function createRoom(roomId, userId) {
  if (!isDatabaseConnected) {
    console.log('База данных недоступна, пропускаем сохранение комнаты');
    return;
  }
  
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
    if (!isDatabaseConnected) {
      return res.status(503).json({ error: 'Сервис временно недоступен. База данных не подключена.' });
    }
    
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
    if (!isDatabaseConnected) {
      return res.status(503).json({ error: 'Сервис временно недоступен. База данных не подключена.' });
    }
    
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
    if (!isDatabaseConnected) {
      return res.json({ isAuthenticated: false, error: 'База данных недоступна' });
    }
    
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
    res.json({ isAuthenticated: false, error: 'Ошибка сервера' });
  }
});

// API для создания комнаты (работает и без БД)
app.post('/api/create-room', (req, res) => {
  try {
    const roomId = Math.random().toString(36).substring(2, 15);
    
    // Сохраняем в БД если доступна
    if (isDatabaseConnected && req.session.userId) {
      createRoom(roomId, req.session.userId).catch(err => 
        console.error('Ошибка сохранения комнаты:', err)
      );
    }
    
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

// Healthcheck endpoint для Railway с диагностикой
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      connected: isDatabaseConnected,
      url_configured: !!getDatabaseUrl(),
      available_vars: Object.keys(process.env)
        .filter(key => key.includes('PG') || key.includes('POSTGRES') || key.includes('DATABASE'))
        .reduce((obj, key) => {
          obj[key] = process.env[key] ? 'SET' : 'NOT_SET';
          return obj;
        }, {})
    },
    environment: process.env.NODE_ENV || 'development'
  };

  // Если база данных подключена, добавляем дополнительную информацию
  if (isDatabaseConnected) {
    try {
      const result = await pool.query('SELECT COUNT(*) as user_count FROM users');
      health.database.user_count = parseInt(result.rows[0].user_count);
      health.database.last_check = new Date().toISOString();
    } catch (error) {
      health.database.error = error.message;
    }
  }

  res.status(200).json(health);
});

// Диагностический endpoint
app.get('/debug', (req, res) => {
  const debug = {
    environment_variables: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || 'not set',
      DATABASE_URL: process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET',
      SESSION_SECRET: process.env.SESSION_SECRET ? 'SET (hidden)' : 'NOT SET'
    },
    database: {
      connected: isDatabaseConnected,
      detected_url: getDatabaseUrl().replace(/:[^:@]*@/, ':***@')
    },
    postgres_variables: Object.keys(process.env)
      .filter(key => key.includes('PG') || key.includes('POSTGRES') || key.includes('DATABASE'))
      .reduce((obj, key) => {
        obj[key] = process.env[key] ? 'SET' : 'NOT_SET';
        return obj;
      }, {}),
    timestamp: new Date().toISOString()
  };

  res.json(debug);
});

// HTML маршруты (работают и без БД для демо)
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Временный маршрут для демо без авторизации
app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/call/:roomId', (req, res) => {
  // Если БД недоступна, разрешаем доступ для демо
  if (!isDatabaseConnected) {
    return res.sendFile(path.join(__dirname, 'public', 'call.html'));
  }
  
  // Если БД доступна, требуем авторизацию
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'public', 'call.html'));
  } else {
    res.redirect('/login');
  }
});

app.get('/', (req, res) => {
  // Если БД недоступна, показываем демо
  if (!isDatabaseConnected) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // Если БД доступна, требуем авторизацию
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/login');
  }
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
    console.log('🚀 Запуск сервера...');
    
    // Пытаемся подключиться к базе данных
    isDatabaseConnected = await initDatabase();
    
    // Настраиваем сессии только если БД доступна
    if (isDatabaseConnected) {
      console.log('🔐 Настройка сессий с PostgreSQL...');
      sessionMiddleware = session({
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
      });
    } else {
      console.log('🔐 Настройка сессий в памяти (демо режим)...');
      sessionMiddleware = session({
        secret: process.env.SESSION_SECRET || 'demo-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: { 
          secure: false,
          maxAge: 24 * 60 * 60 * 1000
        }
      });
    }
    
    // Применяем middleware для сессий
    app.use(sessionMiddleware);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Сервер запущен на порту ${PORT}`);
      console.log(`🌐 Режим: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 База данных: ${isDatabaseConnected ? 'PostgreSQL подключена' : 'Работа без БД (демо режим)'}`);
      console.log(`🔗 Healthcheck: http://localhost:${PORT}/health`);
      console.log(`🐛 Debug info: http://localhost:${PORT}/debug`);
      
      if (!isDatabaseConnected) {
        console.log('');
        console.log('⚠️  Для полной функциональности настройте PostgreSQL:');
        console.log('   📖 Инструкция: см. файл RAILWAY_SETUP.md');
        console.log('   🌐 Демо режим доступен на /demo');
        console.log('');
      } else {
        console.log('');
        console.log('🎉 Все системы готовы к работе!');
        console.log('');
      }
    });
  } catch (error) {
    console.error('❌ Критическая ошибка запуска сервера:', error);
    
    // Пытаемся запустить хотя бы базовый сервер
    console.log('🔄 Попытка запуска в аварийном режиме...');
    
    app.use(session({
      secret: 'emergency-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 60 * 60 * 1000 }
    }));
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🆘 Сервер запущен в аварийном режиме на порту ${PORT}`);
    });
  }
}

startServer();
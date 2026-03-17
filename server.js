const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Настройки
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-this';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// HEALTHCHECK ДЛЯ RAILWAY - МАКСИМАЛЬНО ПРОСТОЙ!
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/healthcheck', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: pool ? 'connected' : 'not_connected'
    });
});

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Глобальные переменные для базы данных
let pool = null;

// Настройка сессий БЕЗ базы данных (сначала)
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: false,
        httpOnly: true
    }
}));

// Функция подключения к PostgreSQL
async function connectToPostgreSQL() {
    try {
        console.log('🔄 Подключение к PostgreSQL Railway...');
        
        let dbConfig;
        
        // Railway автоматически создает DATABASE_URL для PostgreSQL
        if (process.env.DATABASE_URL) {
            dbConfig = {
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            };
            console.log('📋 Используем DATABASE_URL для подключения');
        } else {
            // Fallback на отдельные переменные
            dbConfig = {
                host: process.env.PGHOST || 'localhost',
                port: process.env.PGPORT || 5432,
                user: process.env.PGUSER || 'postgres',
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE || 'postgres',
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            };
            console.log('📋 Используем отдельные переменные PostgreSQL');
        }
        
        // Создаем пул соединений
        pool = new Pool(dbConfig);
        
        // Тестируем подключение
        console.log('🔄 Тестирование подключения...');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as server_time, version() as version');
        client.release();
        
        console.log('✅ PostgreSQL подключен успешно!');
        console.log('📅 Время сервера:', result.rows[0].server_time);
        console.log('🐘 Версия PostgreSQL:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
        
        // Создаем таблицы
        await createTables();
        
        // Настраиваем PostgreSQL Store для сессий
        try {
            const sessionStore = new pgSession({
                pool: pool,
                tableName: 'session'
            });
            
            console.log('✅ PostgreSQL Store для сессий настроен');
            
            // Обновляем middleware сессий с PostgreSQL Store
            app.use(session({
                store: sessionStore,
                secret: SESSION_SECRET,
                resave: false,
                saveUninitialized: false,
                cookie: {
                    maxAge: 24 * 60 * 60 * 1000,
                    secure: process.env.NODE_ENV === 'production',
                    httpOnly: true
                }
            }));
            
            console.log('✅ Сессии переключены на PostgreSQL Store');
            
        } catch (storeError) {
            console.log('⚠️  Ошибка настройки PostgreSQL Store:', storeError.message);
            console.log('💡 Используем MemoryStore (только для разработки)');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка подключения к PostgreSQL:', error.message);
        console.log('💡 Проверьте:');
        console.log('   - Переменную DATABASE_URL в Railway');
        console.log('   - Доступность PostgreSQL сервиса');
        console.log('💡 Сервер продолжает работу без базы данных');
        pool = null;
        return false;
    }
}

async function createTables() {
    try {
        console.log('🏗️  Создание таблиц PostgreSQL...');
        
        // Таблица пользователей (сначала)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Создаем индексы для users
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        
        console.log('✅ Таблица users создана/проверена');
        
        // Таблица комнат (после users, БЕЗ внешнего ключа для простоты)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                room_id VARCHAR(50) UNIQUE NOT NULL,
                creator_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);
        
        // Создаем индексы для rooms
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooms_room_id ON rooms(room_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooms_creator ON rooms(creator_id)`);
        
        console.log('✅ Таблица rooms создана/проверена');
        
        // Таблица сессий создается автоматически connect-pg-simple
        console.log('✅ Таблица session будет создана автоматически');
        
        // Проверяем количество пользователей
        const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
        console.log('👥 Пользователей в базе:', userCount.rows[0].count);
        
        console.log('✅ База данных PostgreSQL инициализирована успешно');
        
    } catch (error) {
        console.error('❌ Ошибка создания таблиц:', error.message);
        console.log('💡 Продолжаем работу без некоторых таблиц');
    }
}

// API Routes

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;
        
        // Валидация
        if (!username || !email || !password || !confirmPassword) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Пароли не совпадают' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
        }
        
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Имя пользователя должно быть от 3 до 20 символов' });
        }
        
        // Проверяем email формат
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Неверный формат email' });
        }
        
        if (!pool) {
            return res.status(500).json({ error: 'База данных недоступна. Попробуйте позже.' });
        }
        
        // Проверяем существование пользователя
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email или именем уже существует' });
        }
        
        // Хешируем пароль
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Создаем пользователя
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [username, email, passwordHash]
        );
        
        const userId = result.rows[0].id;
        
        // Автоматический вход после регистрации
        req.session.userId = userId;
        req.session.username = username;
        req.session.email = email;
        
        console.log(`✅ Новый пользователь зарегистрирован: ${username} (${email})`);
        
        res.json({ 
            success: true, 
            message: 'Регистрация успешна',
            user: { id: userId, username, email }
        });
        
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Валидация
        if (!email || !password) {
            return res.status(400).json({ error: 'Email и пароль обязательны' });
        }
        
        if (!pool) {
            return res.status(500).json({ error: 'База данных недоступна. Попробуйте позже.' });
        }
        
        // Ищем пользователя
        const result = await pool.query(
            'SELECT id, username, email, password_hash FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        const user = result.rows[0];
        
        // Проверяем пароль
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        // Создаем сессию
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.email = user.email;
        
        console.log(`✅ Пользователь вошел: ${user.username} (${user.email})`);
        
        res.json({ 
            success: true, 
            message: 'Вход выполнен успешно',
            user: { id: user.id, username: user.username, email: user.email }
        });
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Выход
app.post('/api/logout', (req, res) => {
    const username = req.session.username;
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Ошибка выхода:', err);
            return res.status(500).json({ error: 'Ошибка выхода' });
        }
        
        if (username) {
            console.log(`👋 Пользователь вышел: ${username}`);
        }
        
        res.json({ success: true, message: 'Выход выполнен успешно' });
    });
});

// Получение информации о пользователе
app.get('/api/user', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.json({ 
                isAuthenticated: false, 
                error: 'Пользователь не авторизован' 
            });
        }
        
        if (!pool) {
            return res.json({ 
                isAuthenticated: false, 
                error: 'База данных недоступна' 
            });
        }
        
        // Получаем актуальную информацию о пользователе
        const result = await pool.query(
            'SELECT id, username, email, created_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        
        if (result.rows.length === 0) {
            // Пользователь удален из базы, очищаем сессию
            req.session.destroy();
            return res.json({ 
                isAuthenticated: false, 
                error: 'Пользователь не найден' 
            });
        }
        
        const user = result.rows[0];
        
        res.json({
            isAuthenticated: true,
            id: user.id,
            username: user.username,
            email: user.email,
            memberSince: user.created_at
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения пользователя:', error);
        res.json({ 
            isAuthenticated: false, 
            error: 'Ошибка сервера' 
        });
    }
});

// Создание комнаты
app.post('/api/create-room', async (req, res) => {
    try {
        const roomId = uuidv4().substring(0, 8); // Короткий ID
        const roomLink = `${req.protocol}://${req.get('host')}/call/${roomId}`;
        
        // Если пользователь авторизован и база доступна, сохраняем в базу
        if (req.session.userId && pool) {
            try {
                await pool.query(
                    'INSERT INTO rooms (room_id, creator_id) VALUES ($1, $2)',
                    [roomId, req.session.userId]
                );
                console.log(`🏠 Комната создана: ${roomId} пользователем ${req.session.username}`);
            } catch (dbError) {
                console.error('⚠️  Ошибка сохранения комнаты в БД:', dbError.message);
                // Продолжаем работу без сохранения в БД
            }
        }
        
        res.json({
            success: true,
            roomId: roomId,
            roomLink: roomLink
        });
        
    } catch (error) {
        console.error('❌ Ошибка создания комнаты:', error);
        res.status(500).json({ error: 'Ошибка создания комнаты' });
    }
});

// Статические маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/call/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'call.html'));
});

app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-app.html'));
});

// Socket.IO для видеозвонков
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`🔌 Пользователь подключился: ${socket.id}`);
    
    socket.on('join-room', (roomId, userId) => {
        console.log(`👤 Пользователь ${userId} присоединился к комнате ${roomId}`);
        
        socket.join(roomId);
        
        // Добавляем пользователя в комнату
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);
        
        // Уведомляем других пользователей в комнате
        socket.to(roomId).emit('user-connected', userId);
        
        // Отправляем список уже подключенных пользователей
        const roomUsers = Array.from(rooms.get(roomId)).filter(id => id !== socket.id);
        socket.emit('room-users', roomUsers);
    });
    
    socket.on('signal', (data) => {
        socket.to(data.roomId).emit('signal', {
            signal: data.signal,
            from: socket.id,
            to: data.to
        });
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Пользователь отключился: ${socket.id}`);
        
        // Удаляем пользователя из всех комнат
        for (const [roomId, users] of rooms.entries()) {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                socket.to(roomId).emit('user-disconnected', socket.id);
                
                // Удаляем пустые комнаты
                if (users.size === 0) {
                    rooms.delete(roomId);
                    console.log(`🏠 Комната ${roomId} удалена (пустая)`);
                }
            }
        }
    });
});

// ЗАПУСК СЕРВЕРА (БЕЗ ОЖИДАНИЯ БАЗЫ ДАННЫХ!)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Локальный адрес: http://localhost:${PORT}`);
    console.log(`🏥 Healthcheck: http://localhost:${PORT}/health`);
    
    if (process.env.RAILWAY_STATIC_URL) {
        console.log(`🚂 Railway URL: ${process.env.RAILWAY_STATIC_URL}`);
    }
    
    console.log('📋 Доступные маршруты:');
    console.log('   GET  /health - Healthcheck для Railway');
    console.log('   GET  /ping - Простой ping');
    console.log('   GET  / - Главная страница');
    console.log('   GET  /login - Страница входа');
    console.log('   GET  /register - Страница регистрации');
    console.log('   GET  /call/:roomId - Страница видеозвонка');
    console.log('   POST /api/register - API регистрации');
    console.log('   POST /api/login - API входа');
    console.log('   POST /api/logout - API выхода');
    console.log('   GET  /api/user - Информация о пользователе');
    console.log('   POST /api/create-room - Создание комнаты');
    
    // Подключаемся к PostgreSQL ПОСЛЕ запуска сервера
    setTimeout(() => {
        connectToPostgreSQL();
    }, 2000); // Ждем 2 секунды после запуска
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('💥 Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Необработанное отклонение промиса:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен сигнал SIGTERM, завершение работы...');
    server.close(() => {
        console.log('✅ Сервер остановлен');
        if (pool) {
            pool.end();
            console.log('✅ Соединение с БД закрыто');
        }
        process.exit(0);
    });
});
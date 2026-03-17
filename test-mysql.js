// Тест подключения к MySQL Railway
const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        console.log('🔄 Тестирование подключения к MySQL...');
        
        const dbConfig = {
            host: 'mysql.railway.internal',
            port: 3306,
            user: 'root',
            password: 'WppmJGnSRhmHmbSLjYzoEUrsqAnImRzS',
            database: 'railway',
            ssl: { rejectUnauthorized: false }
        };
        
        console.log(`📍 Подключение к: ${dbConfig.host}:${dbConfig.port}`);
        console.log(`👤 Пользователь: ${dbConfig.user}`);
        console.log(`🗄️  База данных: ${dbConfig.database}`);
        
        const connection = await mysql.createConnection(dbConfig);
        
        // Тестируем подключение
        const [result] = await connection.execute('SELECT 1 as test, NOW() as time');
        console.log('✅ Подключение успешно!');
        console.log('📅 Время сервера:', result[0].time);
        
        // Показываем существующие таблицы
        const [tables] = await connection.execute('SHOW TABLES');
        console.log('📋 Таблицы в базе:', tables.map(t => Object.values(t)[0]));
        
        await connection.end();
        console.log('✅ Тест завершен успешно');
        
    } catch (error) {
        console.error('❌ Ошибка подключения:', error.message);
        console.log('💡 Проверьте:');
        console.log('   - Доступность mysql.railway.internal:3306');
        console.log('   - Правильность пароля: WppmJGnSRhmHmbSLjYzoEUrsqAnImRzS');
        console.log('   - Существование базы данных railway');
    }
}

testConnection();
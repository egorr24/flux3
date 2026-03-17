const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Простейший healthcheck
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.send(`
        <h1>🎥 Видеозвонки</h1>
        <p>Сервер работает на порту ${PORT}</p>
        <p>Время: ${new Date().toISOString()}</p>
        <p>Uptime: ${process.uptime()} секунд</p>
        <a href="/health">Healthcheck</a>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Простой сервер запущен на порту ${PORT}`);
    console.log(`🏥 Healthcheck: /health`);
    console.log(`🌐 Главная: /`);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('💥 Ошибка:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('💥 Отклонение:', reason);
});
// Простой тест сервера для Railway
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Healthcheck для Railway
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.send('Server is running! ✅');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Test server running on port ${PORT}`);
    console.log(`🏥 Healthcheck: http://localhost:${PORT}/health`);
});
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Логирование всех запросов
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Статические файлы с явными MIME типами
app.use('/public', express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    console.log('Serving file:', filePath);
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// Тестовый маршрут для проверки JS файла
app.get('/test-js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send('console.log("JavaScript файл загружен успешно!");');
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Тест</title>
    </head>
    <body>
        <h1>Тест загрузки JavaScript</h1>
        <p>Откройте консоль браузера</p>
        <script src="/test-js"></script>
        <script src="/public/call.js"></script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Тестовый сервер запущен на http://localhost:${PORT}`);
});
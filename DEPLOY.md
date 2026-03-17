# 🚀 Развертывание на Railway с PostgreSQL

## Пошаговая инструкция

### 1. Настройка PostgreSQL на Railway

1. Войдите в [railway.app](https://railway.app)
2. Создайте новый проект
3. Добавьте PostgreSQL сервис:
   - Нажмите "Add Service" → "Database" → "PostgreSQL"
   - Railway автоматически создаст базу данных
   - Скопируйте `DATABASE_URL` из переменных окружения

### 2. Подготовка базы данных

1. Подключитесь к PostgreSQL через Railway Dashboard или pgAdmin
2. Выполните SQL скрипт из файла `database.sql`
3. Убедитесь что таблицы созданы успешно

### 3. Развертывание приложения

1. Подключите GitHub репозиторий к Railway
2. Railway автоматически:
   - Определит Node.js проект
   - Установит зависимости из `package.json`
   - Запустит сервер командой `npm start`

### 4. Настройка переменных окружения

В Railway Dashboard добавьте переменные:

```
DATABASE_URL=postgresql://... (автоматически создается PostgreSQL сервисом)
SESSION_SECRET=your-super-secret-key-change-this-in-production
NODE_ENV=production
```

### 5. Проверка развертывания

1. Откройте URL вашего приложения
2. Зарегистрируйте тестового пользователя
3. Создайте комнату и протестируйте видеозвонок

## 🔧 Локальное тестирование с PostgreSQL

### Установка PostgreSQL локально

**Windows:**
```bash
# Через Chocolatey
choco install postgresql

# Или скачайте с официального сайта
# https://www.postgresql.org/download/windows/
```

**macOS:**
```bash
# Через Homebrew
brew install postgresql
brew services start postgresql
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Настройка локальной базы

1. Создайте базу данных:
```sql
CREATE DATABASE videocalls;
```

2. Создайте пользователя:
```sql
CREATE USER videocalls_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE videocalls TO videocalls_user;
```

3. Выполните скрипт `database.sql`

4. Создайте `.env` файл:
```
DATABASE_URL=postgresql://videocalls_user:your_password@localhost:5432/videocalls
SESSION_SECRET=local-development-secret
NODE_ENV=development
```

5. Запустите приложение:
```bash
npm install
npm start
```

## 🌐 После развертывания

### Проверка функциональности

1. **Регистрация**: создайте аккаунт
2. **Авторизация**: войдите в систему
3. **Создание комнаты**: протестируйте генерацию ссылок
4. **Видеозвонок**: откройте ссылку в другой вкладке
5. **WebRTC**: проверьте видео/аудио связь

### Мониторинг

- **Логи Railway**: проверяйте логи приложения
- **PostgreSQL метрики**: следите за использованием базы
- **Сессии**: проверяйте таблицу `session` на корректность

## 🔒 Безопасность в продакшене

### Обязательные настройки

1. **SESSION_SECRET**: используйте криптографически стойкий ключ
```bash
# Генерация безопасного ключа
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

2. **DATABASE_URL**: убедитесь что используется SSL
3. **HTTPS**: Railway предоставляет автоматически
4. **Переменные окружения**: никогда не коммитьте в Git

### Рекомендации

- Регулярно обновляйте зависимости
- Мониторьте логи на подозрительную активность
- Настройте резервное копирование базы данных
- Используйте TURN серверы для лучшей совместимости WebRTC

## 🐛 Устранение проблем

### База данных не подключается
```bash
# Проверьте переменную окружения
echo $DATABASE_URL

# Проверьте подключение
psql $DATABASE_URL -c "SELECT version();"
```

### Ошибки миграции
```sql
-- Проверьте существование таблиц
\dt

-- Пересоздайте таблицы если нужно
DROP TABLE IF EXISTS session, rooms, users CASCADE;
-- Затем выполните database.sql заново
```

### Проблемы с сессиями
```sql
-- Очистите старые сессии
DELETE FROM session WHERE expire < NOW();

-- Проверьте структуру таблицы
\d session
```
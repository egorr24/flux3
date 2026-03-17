# 🐘 Настройка PostgreSQL на Railway

## 🚀 Быстрая настройка (2 минуты)

### 1. Добавить PostgreSQL
1. Откройте ваш проект на [railway.app](https://railway.app)
2. Нажмите **"Add Service"** → **"Database"** → **"PostgreSQL"**
3. Railway автоматически создаст переменную `DATABASE_URL`

### 2. Добавить секретный ключ
1. Перейдите в настройки основного сервиса → **"Variables"**
2. Добавьте переменную:
   - **Имя**: `SESSION_SECRET`
   - **Значение**: `super-secret-key-for-video-calls-2024` (или свой)

### 3. Готово!
Railway автоматически перезапустит сервис с PostgreSQL.

## 📋 Переменные (создаются автоматически)

Railway создает эти переменные автоматически:
- `DATABASE_URL` - полная строка подключения к PostgreSQL
- `PGHOST` - хост PostgreSQL
- `PGPORT` - порт (обычно 5432)
- `PGUSER` - пользователь
- `PGPASSWORD` - пароль
- `PGDATABASE` - название базы данных

**Вам нужно добавить только:**
```bash
SESSION_SECRET=super-secret-key-for-video-calls-2024
NODE_ENV=production
```

## ✅ Что произойдет

В логах Railway вы увидите:
```
✅ Сервер запущен на порту 3000
🏥 Healthcheck: http://localhost:3000/health
🔄 Подключение к PostgreSQL Railway...
📋 Используем DATABASE_URL для подключения
✅ PostgreSQL подключен успешно!
📅 Время сервера: 2024-03-17...
🐘 Версия PostgreSQL: PostgreSQL 15.x
🏗️  Создание таблиц PostgreSQL...
✅ Таблица users создана/проверена
✅ Таблица rooms создана/проверена
✅ Таблица session будет создана автоматически
👥 Пользователей в базе: 0
✅ База данных PostgreSQL инициализирована успешно
```

## 🎯 Преимущества PostgreSQL

- ✅ **Автоматическая настройка** - Railway создает все переменные
- ✅ **Надежность** - PostgreSQL стабильнее на Railway
- ✅ **Производительность** - быстрее MySQL на Railway
- ✅ **Простота** - одна переменная `DATABASE_URL`
- ✅ **Масштабируемость** - лучше для больших нагрузок

## 🔧 Структура таблиц

Автоматически создаются:

**users** (пользователи):
- `id` - SERIAL PRIMARY KEY
- `username` - VARCHAR(50) UNIQUE
- `email` - VARCHAR(100) UNIQUE  
- `password_hash` - VARCHAR(255)
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

**rooms** (комнаты):
- `id` - SERIAL PRIMARY KEY
- `room_id` - VARCHAR(50) UNIQUE
- `creator_id` - INTEGER (ссылка на users)
- `created_at` - TIMESTAMP
- `is_active` - BOOLEAN

**session** (сессии):
- Создается автоматически connect-pg-simple

## ❌ Если не работает

1. **Убедитесь что PostgreSQL сервис запущен** (зеленый статус)
2. **Проверьте переменную `DATABASE_URL`** в основном сервисе
3. **Добавьте `SESSION_SECRET`** если не добавили
4. **Перезапустите сервис** после изменений

## 🎉 Готово!

После настройки ваше приложение будет работать с:
- Регистрацией и входом через PostgreSQL
- Видеозвонками WebRTC
- Сессиями в базе данных
- Автоматическим созданием таблиц

Намного проще чем MySQL! 🚀
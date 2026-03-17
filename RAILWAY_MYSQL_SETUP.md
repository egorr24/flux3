# 🚂 Настройка MySQL на Railway

## Ваши данные MySQL (из Railway Dashboard):
- **Хост**: `mysql.railway.internal`
- **Порт**: `3306`
- **Пользователь**: `root`
- **Пароль**: `WppmJGnSRhmHmbSLjYzoEUrsqAnImRzS`
- **База данных**: `railway`

## Настройка переменных в Railway:

1. **Откройте ваш проект на Railway**
2. **Перейдите в Variables (переменные)**
3. **Добавьте эти переменные:**

```bash
MYSQLHOST=mysql.railway.internal
MYSQLPORT=3306
MYSQLUSER=root
MYSQLPASSWORD=WppmJGnSRhmHmbSLjYzoEUrsqAnImRzS
MYSQLDATABASE=railway
SESSION_SECRET=super-secret-key-for-video-calls-app-2024
NODE_ENV=production
```

## 🎯 Или используйте MYSQL_URL (проще):

Вместо отдельных переменных можно добавить одну:
```bash
MYSQL_URL=mysql://root:WppmJGnSRhmHmbSLjYzoEUrsqAnImRzS@mysql.railway.internal:3306/railway
SESSION_SECRET=super-secret-key-for-video-calls-app-2024
NODE_ENV=production
```

## Что произойдет после настройки:

В логах Railway вы увидите:
```
✅ Сервер запущен на порту 3000
🏥 Healthcheck: http://localhost:3000/health
🔄 Подключение к MySQL Railway...
📍 Подключение к: trolley.proxy.rlwy.net:39223
👤 Пользователь: root
🗄️  База данных: railway
✅ MySQL подключен успешно!
🏗️  Создание таблиц...
✅ Таблица users создана/проверена
✅ Таблица rooms создана/проверена
👥 Пользователей в базе: 0
✅ База данных инициализирована успешно
```

## Если не работает:

1. **Проверьте пароль MySQL** - самая частая ошибка
2. **Убедитесь что MySQL сервис запущен** на Railway
3. **Проверьте что все переменные добавлены** правильно
4. **Перезапустите сервис** после добавления переменных

## Тестирование:

После успешного подключения:
1. Откройте ваш сайт на Railway
2. Перейдите на `/register` 
3. Зарегистрируйте тестового пользователя
4. Войдите через `/login`
5. Создайте комнату для видеозвонка

## Структура таблиц:

Автоматически создаются таблицы:
- `users` - пользователи (id, username, email, password_hash, created_at, updated_at)
- `rooms` - комнаты (id, room_id, creator_id, created_at, is_active)
- `session` - сессии (создается автоматически express-mysql-session)

Все готово для работы! 🎉
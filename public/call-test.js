console.log('call-test.js загружен успешно!');

// Простая проверка
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, call-test.js работает');
    
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = 'Тестовый скрипт загружен';
        notification.className = 'notification';
        notification.classList.remove('hidden');
    }
});
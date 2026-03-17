// Генерация уникального ID для комнаты
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Элементы DOM
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const roomInput = document.getElementById('roomInput');
const roomInfo = document.getElementById('roomInfo');
const roomIdSpan = document.getElementById('roomId');
const roomLinkInput = document.getElementById('roomLink');
const copyLinkBtn = document.getElementById('copyLink');
const startCallBtn = document.getElementById('startCall');

// Создание новой комнаты
createRoomBtn.addEventListener('click', () => {
    const roomId = generateRoomId();
    const roomLink = `${window.location.origin}/call/${roomId}`;
    
    roomIdSpan.textContent = roomId;
    roomLinkInput.value = roomLink;
    roomInfo.classList.remove('hidden');
    
    // Сохраняем ID комнаты в localStorage
    localStorage.setItem('currentRoomId', roomId);
});

// Присоединение к существующей комнате
joinRoomBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (roomId) {
        window.location.href = `/call/${roomId}`;
    } else {
        alert('Пожалуйста, введите ID комнаты');
    }
});

// Обработка Enter в поле ввода
roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

// Копирование ссылки
copyLinkBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(roomLinkInput.value);
        copyLinkBtn.textContent = '✅ Скопировано';
        setTimeout(() => {
            copyLinkBtn.textContent = '📋 Копировать';
        }, 2000);
    } catch (err) {
        // Fallback для старых браузеров
        roomLinkInput.select();
        document.execCommand('copy');
        copyLinkBtn.textContent = '✅ Скопировано';
        setTimeout(() => {
            copyLinkBtn.textContent = '📋 Копировать';
        }, 2000);
    }
});

// Начало звонка
startCallBtn.addEventListener('click', () => {
    const roomId = localStorage.getItem('currentRoomId');
    if (roomId) {
        window.location.href = `/call/${roomId}`;
    }
});
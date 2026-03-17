// WebRTC конфигурация
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Глобальные переменные
let socket;
let localStream;
let peers = {};
let roomId;
let isVideoEnabled = true;
let isAudioEnabled = true;

// DOM элементы - будут инициализированы после загрузки DOM
let localVideo;
let remoteVideos;
let currentRoomIdSpan;
let toggleVideoBtn;
let toggleAudioBtn;
let shareScreenBtn;
let copyRoomLinkBtn;
let endCallBtn;
let participantCount;
let participantList;

// Инициализация DOM элементов
function initDOMElements() {
    localVideo = document.getElementById('localVideo');
    remoteVideos = document.getElementById('remoteVideos');
    currentRoomIdSpan = document.getElementById('currentRoomId');
    toggleVideoBtn = document.getElementById('toggleVideo');
    toggleAudioBtn = document.getElementById('toggleAudio');
    shareScreenBtn = document.getElementById('shareScreen');
    copyRoomLinkBtn = document.getElementById('copyRoomLink');
    endCallBtn = document.getElementById('endCall');
    participantCount = document.getElementById('participantCount');
    participantList = document.getElementById('participantList');
}

// Инициализация
async function init() {
    try {
        // Проверяем поддержку WebRTC
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('WebRTC не поддерживается в этом браузере');
        }

        // Запрашиваем разрешения на камеру и микрофон
        showNotification('Запрашиваем доступ к камере и микрофону...', 'info');
        
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        localVideo.srcObject = localStream;
        
        // Подключение к серверу
        socket = io({
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true
        });
        
        // Обработка ошибок подключения
        socket.on('connect_error', (error) => {
            console.error('Ошибка подключения к серверу:', error);
            showNotification('Ошибка подключения к серверу. Проверьте интернет-соединение.', 'error');
        });
        
        socket.on('disconnect', (reason) => {
            console.log('Отключение от сервера:', reason);
            if (reason === 'io server disconnect') {
                showNotification('Соединение разорвано сервером', 'error');
            }
        });
        
        socket.on('connect', () => {
            console.log('Подключено к серверу');
            showNotification('Подключено к серверу', 'success');
        });
        
        // Присоединение к комнате
        socket.emit('join-room', roomId);
        
        setupSocketListeners();
        setupControlListeners();
        
        showNotification('Подключено к комнате', 'success');
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        
        if (error.name === 'NotAllowedError') {
            showNotification('Доступ к камере/микрофону запрещен. Разрешите доступ и обновите страницу.', 'error');
        } else if (error.name === 'NotFoundError') {
            showNotification('Камера или микрофон не найдены', 'error');
        } else if (error.name === 'NotReadableError') {
            showNotification('Камера или микрофон уже используются другим приложением', 'error');
        } else {
            showNotification('Ошибка доступа к камере/микрофону: ' + error.message, 'error');
        }
        
        // Показываем кнопку для повторной попытки
        showRetryButton();
    }
}

// Настройка слушателей Socket.IO
function setupSocketListeners() {
    socket.on('user-connected', (userId) => {
        console.log('Пользователь подключился:', userId);
        createPeerConnection(userId, true);
        updateParticipantList();
    });
    
    socket.on('user-disconnected', (userId) => {
        console.log('Пользователь отключился:', userId);
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }
        
        updateParticipantList();
    });
    
    socket.on('offer', async (data) => {
        console.log('Получен offer от:', data.sender);
        await handleOffer(data.offer, data.sender);
    });
    
    socket.on('answer', async (data) => {
        console.log('Получен answer от:', data.sender);
        await handleAnswer(data.answer, data.sender);
    });
    
    socket.on('ice-candidate', async (data) => {
        console.log('Получен ICE candidate от:', data.sender);
        await handleIceCandidate(data.candidate, data.sender);
    });
}

// Создание WebRTC соединения
function createPeerConnection(userId, isInitiator) {
    const peerConnection = new RTCPeerConnection(configuration);
    peers[userId] = peerConnection;
    
    // Добавление локального потока
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Обработка удаленного потока
    peerConnection.ontrack = (event) => {
        console.log('Получен удаленный поток от:', userId);
        const remoteStream = event.streams[0];
        addRemoteVideo(userId, remoteStream);
    };
    
    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: userId,
                candidate: event.candidate
            });
        }
    };
    
    // Если мы инициаторы, создаем offer
    if (isInitiator) {
        createOffer(userId);
    }
    
    return peerConnection;
}

// Создание offer
async function createOffer(userId) {
    try {
        const peerConnection = peers[userId];
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            target: userId,
            offer: offer
        });
    } catch (error) {
        console.error('Ошибка создания offer:', error);
    }
}

// Обработка offer
async function handleOffer(offer, senderId) {
    try {
        if (!peers[senderId]) {
            createPeerConnection(senderId, false);
        }
        
        const peerConnection = peers[senderId];
        await peerConnection.setRemoteDescription(offer);
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            target: senderId,
            answer: answer
        });
    } catch (error) {
        console.error('Ошибка обработки offer:', error);
    }
}

// Обработка answer
async function handleAnswer(answer, senderId) {
    try {
        const peerConnection = peers[senderId];
        await peerConnection.setRemoteDescription(answer);
    } catch (error) {
        console.error('Ошибка обработки answer:', error);
    }
}

// Обработка ICE кандидата
async function handleIceCandidate(candidate, senderId) {
    try {
        const peerConnection = peers[senderId];
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error('Ошибка добавления ICE candidate:', error);
    }
}

// Добавление удаленного видео
function addRemoteVideo(userId, stream) {
    let videoElement = document.getElementById(`video-${userId}`);
    
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.id = `video-${userId}`;
        videoElement.className = 'remote-video';
        videoElement.autoplay = true;
        videoElement.playsinline = true;
        remoteVideos.appendChild(videoElement);
    }
    
    videoElement.srcObject = stream;
}

// Настройка контролов
function setupControlListeners() {
    toggleVideoBtn.addEventListener('click', toggleVideo);
    toggleAudioBtn.addEventListener('click', toggleAudio);
    shareScreenBtn.addEventListener('click', shareScreen);
    copyRoomLinkBtn.addEventListener('click', copyRoomLink);
    endCallBtn.addEventListener('click', endCall);
}

// Переключение видео
function toggleVideo() {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    toggleVideoBtn.classList.toggle('video-off', !isVideoEnabled);
    toggleVideoBtn.textContent = isVideoEnabled ? '📹' : '📹';
}

// Переключение аудио
function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    toggleAudioBtn.classList.toggle('audio-off', !isAudioEnabled);
    toggleAudioBtn.textContent = isAudioEnabled ? '🎤' : '🎤';
}

// Демонстрация экрана
async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
        
        const videoTrack = screenStream.getVideoTracks()[0];
        
        // Заменяем видео трек во всех соединениях
        Object.values(peers).forEach(peerConnection => {
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        });
        
        // Заменяем в локальном видео
        localVideo.srcObject = screenStream;
        
        // Возврат к камере при завершении демонстрации
        videoTrack.onended = async () => {
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            const cameraVideoTrack = cameraStream.getVideoTracks()[0];
            
            Object.values(peers).forEach(peerConnection => {
                const sender = peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender) {
                    sender.replaceTrack(cameraVideoTrack);
                }
            });
            
            localVideo.srcObject = cameraStream;
            localStream = cameraStream;
        };
        
    } catch (error) {
        console.error('Ошибка демонстрации экрана:', error);
        showNotification('Ошибка демонстрации экрана', 'error');
    }
}

// Копирование ссылки на комнату
async function copyRoomLink() {
    const roomLink = `${window.location.origin}/call/${roomId}`;
    
    try {
        await navigator.clipboard.writeText(roomLink);
        showNotification('Ссылка скопирована', 'success');
    } catch (error) {
        console.error('Ошибка копирования:', error);
        showNotification('Ошибка копирования ссылки', 'error');
    }
}

// Завершение звонка
function endCall() {
    // Закрываем все соединения
    Object.values(peers).forEach(peerConnection => {
        peerConnection.close();
    });
    
    // Останавливаем локальный поток
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
    }
    
    // Отключаемся от сокета
    if (socket) {
        socket.disconnect();
    }
    
    // Возвращаемся на главную страницу
    window.location.href = '/';
}

// Обновление списка участников
function updateParticipantList() {
    const count = Object.keys(peers).length + 1; // +1 для текущего пользователя
    if (participantCount) {
        participantCount.textContent = count;
    }
}

// Показ уведомлений
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
        
        // Автоматически скрываем уведомление через 5 секунд для ошибок, 3 для остальных
        const timeout = type === 'error' ? 8000 : 3000;
        setTimeout(() => {
            notification.classList.add('hidden');
        }, timeout);
    }
}

// Показ кнопки повторной попытки
function showRetryButton() {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = '🔄 Повторить запрос доступа';
    retryBtn.className = 'control-btn retry-btn';
    retryBtn.style.position = 'fixed';
    retryBtn.style.top = '50%';
    retryBtn.style.left = '50%';
    retryBtn.style.transform = 'translate(-50%, -50%)';
    retryBtn.style.zIndex = '1001';
    retryBtn.style.padding = '15px 30px';
    retryBtn.style.fontSize = '16px';
    retryBtn.style.borderRadius = '8px';
    retryBtn.style.background = '#667eea';
    retryBtn.style.color = 'white';
    retryBtn.style.border = 'none';
    retryBtn.style.cursor = 'pointer';
    
    retryBtn.addEventListener('click', () => {
        retryBtn.remove();
        init();
    });
    
    document.body.appendChild(retryBtn);
}

// Запуск приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем DOM элементы
    initDOMElements();
    
    // Получение ID комнаты из URL
    roomId = window.location.pathname.split('/call/')[1];
    if (currentRoomIdSpan) {
        currentRoomIdSpan.textContent = roomId;
    }

    // Проверяем наличие всех необходимых элементов
    if (!localVideo || !remoteVideos || !toggleVideoBtn || !toggleAudioBtn || !endCallBtn) {
        console.error('Не найдены необходимые элементы DOM');
        showNotification('Ошибка загрузки страницы. Обновите страницу.', 'error');
        return;
    }

    // Запускаем инициализацию
    init();
});
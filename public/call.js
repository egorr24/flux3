// WebRTC конфигурация
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Глобальные перемены
let socket;
let localStream;
let peers = {};
let roomId;
let isVideoEnabled = true;
let isAudioEnabled = true;

// DOM элементы
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const currentRoomIdSpan = document.getElementById('currentRoomId');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const shareScreenBtn = document.getElementById('shareScreen');
const copyRoomLinkBtn = document.getElementById('copyRoomLink');
const endCallBtn = document.getElementById('endCall');
const participantCount = document.getElementById('participantCount');
const participantList = document.getElementById('participantList');

// Получение ID комнаты из URL
roomId = window.location.pathname.split('/call/')[1];
currentRoomIdSpan.textContent = roomId;

// Инициализация
async function init() {
    try {
        // Получение медиа потока
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        
        // Подключение к серверу
        socket = io();
        
        // Присоединение к комнате
        socket.emit('join-room', roomId);
        
        setupSocketListeners();
        setupControlListeners();
        
        showNotification('Подключено к комнате', 'success');
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showNotification('Ошибка доступа к камере/микрофону', 'error');
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
    participantCount.textContent = count;
}

// Показ уведомлений
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

// Запуск приложения
init();
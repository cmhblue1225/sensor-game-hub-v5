/**
 * 🚀 Sensor Game Hub v5.0 - 완전 재설계된 메인 서버
 * 
 * 듀얼 센서 및 멀티플레이어 완벽 지원
 * 최고의 사용자 경험을 위한 완전 재설계
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// 재설계된 클래스와 핸들러 가져오기
const { 
    Session, 
    Room, 
    Client, 
    SESSION_STATES, 
    ROOM_STATES, 
    CLIENT_TYPES, 
    MESSAGE_TYPES,
    generateSessionCode,
    generateRoomId
} = require('./server-redesign');

const {
    initializeHandlers,
    handleCreateSession,
    handleJoinSession,
    handleCreateRoom,
    handleJoinRoom,
    handleLeaveRoom,
    handleStartGame,
    handleReturnToRoom,
    handleSensorData,
    handleDisconnect
} = require('./server-handlers');

// 환경 설정
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`🚀 Sensor Game Hub v5.0 (완전 재설계) 시작 중...`);
console.log(`📍 환경: ${NODE_ENV}`);
console.log(`🌐 서버: ${HOST}:${PORT}`);

// Express 앱 및 HTTP 서버 설정
const app = express();
const server = http.createServer(app);

// WebSocket 서버 설정
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false,
    clientTracking: true
});

// 미들웨어 설정
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));
app.use('/games', express.static(path.join(__dirname, 'games')));
app.use('/sdk', express.static(path.join(__dirname, 'sdk')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ========== 데이터 저장소 ==========
const clients = new Map();      // clientId -> Client
const sessions = new Map();     // sessionCode -> Session  
const rooms = new Map();        // roomId -> Room
const adminClients = new Set(); // 관리자 클라이언트 목록

// 핸들러 초기화
initializeHandlers(clients, sessions, rooms);

// 서버 통계
const serverStats = {
    startTime: Date.now(),
    totalConnections: 0,
    totalSessions: 0,
    totalRooms: 0
};

// ========== 게임 목록 API ==========
const availableGames = [
    {
        gameId: 'solo-sensor-test',
        name: '솔로 센서 테스트',
        description: '센서 기능을 테스트하는 싱글플레이어 게임',
        modes: ['solo']
    },
    {
        gameId: 'dual-sensor-test',
        name: '듀얼 센서 테스트',
        description: '두 개의 센서로 두 개의 공을 조종하는 게임',
        modes: ['dual']
    },
    {
        gameId: 'multiplayer-sensor-test',
        name: '멀티플레이어 센서 테스트',
        description: '여러 명이 함께 플레이하는 센서 게임',
        modes: ['multiplayer']
    }
];

app.get('/api/games', (req, res) => {
    res.json({
        success: true,
        games: availableGames
    });
});

// ========== 라우팅 ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

app.get('/hub', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'hub.html'));
});

app.get('/sensor', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'sensor.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'admin.html'));
});

// 룸 대기실 페이지 (새로 추가)
app.get('/room/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'room-waiting.html'));
});

// ========== WebSocket 연결 처리 ==========
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const client = new Client(clientId, ws);
    clients.set(clientId, client);
    
    serverStats.totalConnections++;
    
    console.log(`🔗 새 클라이언트 연결: ${clientId} (총 ${clients.size}개)`);
    
    // 연결 확인 메시지
    client.send({
        type: MESSAGE_TYPES.CONNECTED,
        clientId: clientId,
        timestamp: Date.now()
    });
    
    // 메시지 처리
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(clientId, message);
        } catch (error) {
            console.error(`❌ 메시지 파싱 오류 (${clientId}):`, error);
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '잘못된 메시지 형식'
            });
        }
    });
    
    // 연결 종료 처리
    ws.on('close', () => {
        handleDisconnect(clientId);
    });
    
    ws.on('error', (error) => {
        console.error(`❌ WebSocket 오류 (${clientId}):`, error);
        handleDisconnect(clientId);
    });
    
    // Ping/Pong for keep-alive
    ws.on('pong', () => {
        client.lastPing = Date.now();
    });
});

// ========== 메시지 라우팅 ==========
function handleMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    console.log(`📨 메시지 수신 (${clientId}): ${message.type}`);
    
    try {
        switch (message.type) {
            // 세션 관리
            case MESSAGE_TYPES.CREATE_SESSION:
                handleCreateSession(clientId, message);
                break;
            
            case MESSAGE_TYPES.JOIN_SESSION:
                handleJoinSession(clientId, message);
                break;
            
            // 멀티플레이어 룸 관리
            case MESSAGE_TYPES.CREATE_ROOM:
                handleCreateRoom(clientId, message);
                break;
            
            case MESSAGE_TYPES.JOIN_ROOM:
                handleJoinRoom(clientId, message);
                break;
            
            case MESSAGE_TYPES.LEAVE_ROOM:
                handleLeaveRoom(clientId, message);
                break;
            
            // 게임 컨트롤
            case MESSAGE_TYPES.START_GAME:
                handleStartGame(clientId, message);
                break;
            
            case MESSAGE_TYPES.RETURN_TO_ROOM:
                handleReturnToRoom(clientId, message);
                break;
            
            // 센서 데이터
            case MESSAGE_TYPES.SENSOR_DATA:
                handleSensorData(clientId, message);
                break;
            
            // 관리자
            case MESSAGE_TYPES.ADMIN_STATUS:
                handleAdminStatus(clientId, message);
                break;
            
            // Ping
            case 'ping':
                client.send({ type: 'pong', timestamp: Date.now() });
                break;
            
            default:
                console.warn(`⚠️ 알 수 없는 메시지 타입: ${message.type}`);
                client.send({
                    type: MESSAGE_TYPES.ERROR,
                    error: '지원하지 않는 메시지 타입'
                });
        }
    } catch (error) {
        console.error(`❌ 메시지 처리 오류 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '메시지 처리 중 오류 발생'
        });
    }
}

// ========== 관리자 핸들러 ==========
function handleAdminStatus(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    client.type = CLIENT_TYPES.ADMIN;
    adminClients.add(clientId);
    
    // 서버 상태 정보 전송
    const statusData = {
        type: MESSAGE_TYPES.ADMIN_STATUS,
        stats: {
            uptime: Date.now() - serverStats.startTime,
            totalConnections: serverStats.totalConnections,
            activeSessions: sessions.size,
            activeRooms: rooms.size,
            connectedClients: clients.size
        },
        sessions: Array.from(sessions.values()).map(s => ({
            sessionCode: s.sessionCode,
            sessionId: s.sessionId,
            gameType: s.gameType,
            state: s.state,
            pcConnected: s.pcClientId !== null,
            sensorCount: s.sensorClients.size,
            roomId: s.roomId
        })),
        rooms: Array.from(rooms.values()).map(r => ({
            roomId: r.roomId,
            gameId: r.gameId,
            state: r.state,
            playerCount: r.players.size,
            maxPlayers: r.maxPlayers,
            hostSessionId: r.hostSessionId
        }))
    };
    
    client.send(statusData);
    console.log(`👑 관리자 연결: ${clientId}`);
}

// ========== 정리 작업 및 헬스체크 ==========

// 주기적 정리 작업
setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5분
    
    // 비활성 세션 정리
    for (const [sessionCode, session] of sessions) {
        if (now - session.lastActivity > TIMEOUT) {
            console.log(`🗑️ 비활성 세션 정리: ${sessionCode}`);
            session.cleanup();
            sessions.delete(sessionCode);
        }
    }
    
    // 빈 룸 정리
    for (const [roomId, room] of rooms) {
        if (room.isEmpty() || now - room.lastActivity > TIMEOUT) {
            console.log(`🗑️ 빈 룸 정리: ${roomId}`);
            room.cleanup();
            rooms.delete(roomId);
        }
    }
    
    // 연결 끊어진 클라이언트 정리
    for (const [clientId, client] of clients) {
        if (!client.isConnected()) {
            console.log(`🗑️ 연결 끊어진 클라이언트 정리: ${clientId}`);
            handleDisconnect(clientId);
        }
    }
    
}, 60000); // 1분마다 실행

// Keep-alive ping
setInterval(() => {
    clients.forEach((client, clientId) => {
        if (client.isConnected()) {
            try {
                client.ws.ping();
            } catch (error) {
                console.log(`🏓 Ping 실패: ${clientId}`);
                handleDisconnect(clientId);
            }
        }
    });
}, 30000); // 30초마다 ping

// ========== 서버 시작 ==========
server.listen(PORT, HOST, () => {
    console.log(`✅ 서버 시작 완료: http://${HOST}:${PORT}`);
    console.log(`🎮 게임 목록: ${availableGames.length}개`);
    console.log(`📱 WebSocket 연결 대기 중...`);
    
    // 개발 환경에서 추가 정보 출력
    if (NODE_ENV === 'development') {
        console.log('\n🔗 접속 URL:');
        console.log(`   메인: http://localhost:${PORT}`);
        console.log(`   허브: http://localhost:${PORT}/hub`);
        console.log(`   센서: http://localhost:${PORT}/sensor`);
        console.log(`   관리자: http://localhost:${PORT}/admin`);
    }
});

// 프로세스 종료 처리
process.on('SIGTERM', () => {
    console.log('🛑 서버 종료 중...');
    
    // 모든 클라이언트에 종료 알림
    clients.forEach((client) => {
        if (client.isConnected()) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '서버가 종료됩니다'
            });
        }
    });
    
    server.close(() => {
        console.log('✅ 서버 종료 완료');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('❌ 예상치 못한 오류:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 처리되지 않은 Promise 거부:', reason);
});
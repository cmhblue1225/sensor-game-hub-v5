/**
 * 🚀 Sensor Game Hub v5.0 - 메인 서버
 * 완전히 재설계된 안정적인 센서 게임 플랫폼
 * 
 * 핵심 설계 원칙:
 * 1. 단순성 우선 (KISS)
 * 2. 명확한 상태 관리
 * 3. 강력한 에러 처리
 * 4. 자가 치유 시스템
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// 환경 설정
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`🚀 Sensor Game Hub v5.0 시작 중...`);
console.log(`📍 환경: ${NODE_ENV}`);
console.log(`🌐 서버: ${HOST}:${PORT}`);

// Express 앱 및 HTTP 서버 설정
const app = express();
const server = http.createServer(app);

// WebSocket 서버 설정 (render.com 호환)
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

// ========== 핵심 데이터 구조 ==========

/**
 * 세션 상태 정의
 */
const SESSION_STATES = {
    CREATED: 'created',       // 세션 생성됨
    MATCHED: 'matched',       // PC-센서 매칭 완료
    PLAYING: 'playing',       // 게임 진행 중
    ENDED: 'ended'           // 세션 종료
};

/**
 * 룸 상태 정의
 */
const ROOM_STATES = {
    WAITING: 'waiting',       // 플레이어 대기 중
    STARTING: 'starting',     // 게임 시작 중
    PLAYING: 'playing',       // 게임 진행 중
    FINISHED: 'finished'      // 게임 종료
};

/**
 * 클라이언트 타입 정의
 */
const CLIENT_TYPES = {
    PC: 'pc',
    SENSOR: 'sensor',
    ADMIN: 'admin'
};

/**
 * 메시지 타입 정의 (표준화된 통신 프로토콜)
 */
const MESSAGE_TYPES = {
    // 기본 연결
    PING: 'ping',
    PONG: 'pong',
    ERROR: 'error',
    
    // 세션 관리
    CREATE_SESSION: 'create_session',
    SESSION_CREATED: 'session_created',
    JOIN_SESSION: 'join_session',
    SESSION_JOINED: 'session_joined',
    SESSION_MATCHED: 'session_matched',
    JOIN_AS_GAME_CLIENT: 'join_as_game_client',
    
    // 센서 데이터
    SENSOR_DATA: 'sensor_data',
    
    // 멀티플레이어
    CREATE_ROOM: 'create_room',
    ROOM_CREATED: 'room_created',
    JOIN_ROOM: 'join_room',
    ROOM_JOINED: 'room_joined',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    START_GAME: 'start_game',
    GAME_STARTED: 'game_started',
    GAME_EVENT: 'game_event',
    
    // 관리자
    ADMIN_STATUS: 'admin_status'
};

// ========== 전역 데이터 저장소 ==========

// 핵심 데이터 맵들
const sessions = new Map();     // sessionCode -> Session
const rooms = new Map();        // roomId -> Room  
const clients = new Map();      // clientId -> Client
const games = new Map();        // gameId -> GameMetadata

// TTL 기반 세션 코드 관리 (중복 방지 및 메모리 누수 방지)
const recentlyUsedCodes = new Map(); // code -> expiry timestamp
const adminClients = new Set();

// 서버 통계
const serverStats = {
    startTime: Date.now(),
    totalConnections: 0,
    totalSessions: 0,
    totalRooms: 0
};

// ========== 핵심 클래스 정의 ==========

/**
 * Session 클래스 - 세션 상태 관리
 */
class Session {
    constructor(sessionCode) {
        this.sessionCode = sessionCode;
        this.sessionId = uuidv4();
        this.state = SESSION_STATES.CREATED;
        this.pcClientId = null;
        this.sensorClients = new Map(); // sensorId -> clientId (듀얼 센서 지원)
        this.gameMode = null; // 'solo', 'multiplayer', 'dual'
        this.roomId = null;
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
        
        console.log(`📝 세션 생성: ${this.sessionCode} (${this.sessionId})`);
    }
    
    // PC 클라이언트 연결
    connectPC(clientId, gameMode) {
        this.pcClientId = clientId;
        this.gameMode = gameMode;
        this.state = SESSION_STATES.MATCHED;
        this.updateActivity();
        console.log(`💻 PC 연결: ${this.sessionCode} <- ${clientId} (${gameMode})`);
    }
    
    // 센서 클라이언트 연결 (듀얼 센서 지원)
    connectSensor(clientId, sensorId = 'primary') {
        // 듀얼 센서 지원을 위해 중복된 sensorId 처리
        let finalSensorId = sensorId;
        
        // 이미 같은 sensorId가 있다면 고유한 ID 생성
        if (this.sensorClients.has(sensorId)) {
            finalSensorId = `${sensorId}_${this.sensorClients.size}`;
        }
        
        this.sensorClients.set(finalSensorId, clientId);
        if (this.state === SESSION_STATES.CREATED) {
            this.state = SESSION_STATES.MATCHED;
        }
        this.updateActivity();
        console.log(`📱 센서 연결: ${this.sessionCode} <- ${clientId} (${finalSensorId})`);
        return finalSensorId;
    }
    
    // 센서 클라이언트 연결 해제
    disconnectSensor(sensorId) {
        const clientId = this.sensorClients.get(sensorId);
        this.sensorClients.delete(sensorId);
        console.log(`📱 센서 해제: ${this.sessionCode} -> ${clientId} (${sensorId})`);
        return clientId;
    }
    
    // 활동 시간 업데이트
    updateActivity() {
        this.lastActivity = Date.now();
    }
    
    // 세션이 완전히 연결되었는지 확인
    isFullyConnected() {
        const hasPc = this.pcClientId !== null;
        const hasSensor = this.sensorClients.size > 0;
        return hasPc && hasSensor;
    }
    
    // 세션 정리
    cleanup() {
        this.state = SESSION_STATES.ENDED;
        console.log(`🗑️ 세션 정리: ${this.sessionCode}`);
    }
}

/**
 * Room 클래스 - 멀티플레이어 룸 관리
 */
class Room {
    constructor(roomId, hostSessionId, gameId, maxPlayers = 4) {
        this.roomId = roomId;
        this.hostSessionId = hostSessionId;
        this.gameId = gameId;
        this.maxPlayers = maxPlayers;
        this.players = new Map(); // sessionId -> playerData
        this.state = ROOM_STATES.WAITING;
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
        
        console.log(`🏠 룸 생성: ${this.roomId} (호스트: ${hostSessionId})`);
    }
    
    // 플레이어 추가
    addPlayer(sessionId, playerData) {
        if (this.players.size >= this.maxPlayers) {
            return { success: false, error: '룸이 가득참' };
        }
        
        this.players.set(sessionId, {
            sessionId,
            nickname: playerData.nickname || `Player${this.players.size + 1}`,
            isHost: sessionId === this.hostSessionId,
            joinedAt: Date.now()
        });
        
        this.updateActivity();
        console.log(`👥 플레이어 참가: ${this.roomId} <- ${sessionId}`);
        return { success: true };
    }
    
    // 플레이어 제거
    removePlayer(sessionId) {
        const player = this.players.get(sessionId);
        this.players.delete(sessionId);
        this.updateActivity();
        console.log(`👤 플레이어 퇴장: ${this.roomId} -> ${sessionId}`);
        return player;
    }
    
    // 게임 시작
    startGame() {
        if (this.players.size < 2) {
            return { success: false, error: '최소 2명 필요' };
        }
        
        this.state = ROOM_STATES.PLAYING;
        this.updateActivity();
        console.log(`🎮 게임 시작: ${this.roomId}`);
        return { success: true };
    }
    
    // 활동 시간 업데이트
    updateActivity() {
        this.lastActivity = Date.now();
    }
    
    // 룸이 비어있는지 확인
    isEmpty() {
        return this.players.size === 0;
    }
    
    // 룸 정리
    cleanup() {
        this.state = ROOM_STATES.FINISHED;
        console.log(`🗑️ 룸 정리: ${this.roomId}`);
    }
}

/**
 * Client 클래스 - 클라이언트 연결 관리
 */
class Client {
    constructor(clientId, ws, type = null) {
        this.clientId = clientId;
        this.ws = ws;
        this.type = type;
        this.sessionId = null;
        this.isActive = true;
        this.connectedAt = Date.now();
        this.lastPing = Date.now();
        
        console.log(`🔗 클라이언트 연결: ${this.clientId}`);
    }
    
    // 메시지 전송 (안전한 전송)
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error(`❌ 메시지 전송 실패 (${this.clientId}):`, error);
                return false;
            }
        }
        return false;
    }
    
    // 핑 업데이트
    updatePing() {
        this.lastPing = Date.now();
    }
    
    // 연결 상태 확인
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    // 클라이언트 정리
    cleanup() {
        this.isActive = false;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        console.log(`🗑️ 클라이언트 정리: ${this.clientId}`);
    }
}

// ========== 유틸리티 함수들 ==========

/**
 * 4자리 세션 코드 생성 (TTL 기반 중복 방지)
 */
function generateSessionCode() {
    let attempts = 0;
    while (attempts < 10000) {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        
        // 활성 세션과 최근 사용 코드 모두 확인
        if (!sessions.has(code) && !isRecentlyUsed(code)) {
            addToRecentlyUsed(code);
            return code;
        }
        attempts++;
    }
    throw new Error('사용 가능한 세션 코드 부족');
}

/**
 * 최근 사용된 코드인지 확인 (TTL 기반)
 */
function isRecentlyUsed(code) {
    const expiry = recentlyUsedCodes.get(code);
    if (expiry && Date.now() < expiry) {
        return true;
    }
    // 만료된 코드는 자동으로 제거
    if (expiry) {
        recentlyUsedCodes.delete(code);
    }
    return false;
}

/**
 * 최근 사용 코드에 추가 (30분 TTL)
 */
function addToRecentlyUsed(code) {
    const expiry = Date.now() + (30 * 60 * 1000); // 30분
    recentlyUsedCodes.set(code, expiry);
    
    // 주기적으로 만료된 코드 정리 (성능 최적화)
    if (recentlyUsedCodes.size % 100 === 0) {
        cleanupExpiredCodes();
    }
}

/**
 * 만료된 세션 코드 정리
 */
function cleanupExpiredCodes() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [code, expiry] of recentlyUsedCodes.entries()) {
        if (now >= expiry) {
            recentlyUsedCodes.delete(code);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 만료된 세션 코드 ${cleanedCount}개 정리됨`);
    }
}

/**
 * 게임 메타데이터 로드
 */
function loadGameMetadata() {
    const gamesDir = path.join(__dirname, 'games');
    
    console.log(`📁 게임 디렉터리 확인: ${gamesDir}`);
    
    if (!fs.existsSync(gamesDir)) {
        console.log('📁 games 디렉터리 생성 중...');
        fs.mkdirSync(gamesDir, { recursive: true });
        return;
    }
    
    try {
        const gameDirectories = fs.readdirSync(gamesDir);
        let loadedCount = 0;
        
        console.log(`📂 발견된 디렉터리: ${gameDirectories.join(', ')}`);
        
        gameDirectories.forEach(gameDir => {
            const gameDirPath = path.join(gamesDir, gameDir);
            const gameJsonPath = path.join(gameDirPath, 'game.json');
            
            console.log(`🔍 확인 중: ${gameJsonPath}`);
            
            if (fs.existsSync(gameJsonPath)) {
                try {
                    const gameMetadata = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));
                    games.set(gameDir, gameMetadata);
                    loadedCount++;
                    console.log(`✅ 게임 로드: ${gameDir} (${gameMetadata.name})`);
                } catch (error) {
                    console.error(`❌ 게임 JSON 파싱 실패: ${gameDir}`, error);
                }
            } else {
                console.log(`⚠️ game.json 없음: ${gameDir}`);
            }
        });
        
        console.log(`📚 총 ${loadedCount}개 게임 로드 완료`);
        
        // 로드된 게임 목록 출력
        if (games.size > 0) {
            console.log('🎮 로드된 게임들:');
            games.forEach((metadata, gameId) => {
                console.log(`  - ${gameId}: ${metadata.name}`);
            });
        }
        
    } catch (error) {
        console.error('❌ 게임 메타데이터 로딩 중 오류:', error);
    }
}

// ========== WebSocket 연결 처리 ==========

/**
 * WebSocket 연결 핸들러
 */
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const client = new Client(clientId, ws);
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    clients.set(clientId, client);
    serverStats.totalConnections++;
    
    console.log(`🔗 새 WebSocket 연결: ${clientId} from ${clientIP}`);
    
    // 연결 확인 메시지
    client.send({
        type: 'connected',
        clientId: clientId,
        serverTime: Date.now()
    });
    
    // 메시지 핸들러
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(clientId, message);
        } catch (error) {
            console.error(`❌ 메시지 파싱 실패 (${clientId}):`, error);
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '잘못된 메시지 형식'
            });
        }
    });
    
    // 연결 해제 핸들러
    ws.on('close', () => {
        handleDisconnect(clientId);
    });
    
    // 에러 핸들러
    ws.on('error', (error) => {
        console.error(`❌ WebSocket 오류 (${clientId}):`, error);
        handleDisconnect(clientId);
    });
});

// ========== 메시지 처리 ==========

/**
 * 메시지 라우터
 */
function handleMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client || !client.isActive) {
        console.warn(`⚠️ 비활성 클라이언트에서 메시지: ${clientId}`);
        return;
    }
    
    client.updatePing();
    
    try {
        switch (message.type) {
            case MESSAGE_TYPES.PING:
                handlePing(clientId, message);
                break;
            case MESSAGE_TYPES.CREATE_SESSION:
                handleCreateSession(clientId, message);
                break;
            case MESSAGE_TYPES.JOIN_SESSION:
                handleJoinSession(clientId, message);
                break;
            case MESSAGE_TYPES.JOIN_AS_GAME_CLIENT:
                handleJoinAsGameClient(clientId, message);
                break;
            case MESSAGE_TYPES.SENSOR_DATA:
                handleSensorData(clientId, message);
                break;
            case MESSAGE_TYPES.CREATE_ROOM:
                handleCreateRoom(clientId, message);
                break;
            case MESSAGE_TYPES.JOIN_ROOM:
                handleJoinRoom(clientId, message);
                break;
            case MESSAGE_TYPES.START_GAME:
                handleStartGame(clientId, message);
                break;
            case MESSAGE_TYPES.GAME_EVENT:
                handleGameEvent(clientId, message);
                break;
            case MESSAGE_TYPES.ADMIN_STATUS:
                handleAdminStatus(clientId, message);
                break;
            default:
                console.warn(`⚠️ 알 수 없는 메시지 타입: ${message.type}`);
                client.send({
                    type: MESSAGE_TYPES.ERROR,
                    error: `알 수 없는 메시지 타입: ${message.type}`
                });
        }
    } catch (error) {
        console.error(`❌ 메시지 처리 중 오류 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '메시지 처리 중 오류 발생'
        });
    }
}

/**
 * Ping 처리
 */
function handlePing(clientId, message) {
    const client = clients.get(clientId);
    if (client) {
        client.send({
            type: MESSAGE_TYPES.PONG,
            timestamp: Date.now()
        });
    }
}

/**
 * 세션 생성 처리 (PC 클라이언트)
 */
function handleCreateSession(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    try {
        const { gameMode = 'solo' } = message;
        
        // 클라이언트 타입 설정
        client.type = CLIENT_TYPES.PC;
        
        // 새 세션 생성
        const sessionCode = generateSessionCode();
        const session = new Session(sessionCode);
        session.connectPC(clientId, gameMode);
        
        sessions.set(sessionCode, session);
        client.sessionId = session.sessionId;
        serverStats.totalSessions++;
        
        // 응답 전송
        client.send({
            type: MESSAGE_TYPES.SESSION_CREATED,
            sessionCode: sessionCode,
            sessionId: session.sessionId,
            gameMode: gameMode
        });
        
        console.log(`✅ 세션 생성 완료: ${sessionCode} (PC: ${clientId})`);
        
    } catch (error) {
        console.error(`❌ 세션 생성 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '세션 생성 실패'
        });
    }
}

/**
 * 세션 참가 처리 (센서 클라이언트)
 */
function handleJoinSession(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    try {
        const { sessionCode, sensorId = 'primary' } = message;
        
        // 세션 확인
        const session = sessions.get(sessionCode);
        if (!session) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '유효하지 않은 세션 코드'
            });
            return;
        }
        
        // 클라이언트 타입 설정
        client.type = CLIENT_TYPES.SENSOR;
        client.sessionId = session.sessionId;
        
        // 센서 연결
        const assignedSensorId = session.connectSensor(clientId, sensorId);
        
        // 센서 클라이언트에 응답
        client.send({
            type: MESSAGE_TYPES.SESSION_JOINED,
            sessionCode: sessionCode,
            sessionId: session.sessionId,
            sensorId: assignedSensorId
        });
        
        // PC 클라이언트에 센서 연결 알림
        if (session.pcClientId) {
            const pcClient = clients.get(session.pcClientId);
            if (pcClient) {
                pcClient.send({
                    type: MESSAGE_TYPES.SESSION_MATCHED,
                    sessionCode: sessionCode,
                    sensorId: assignedSensorId,
                    sensorCount: session.sensorClients.size
                });
            }
        }
        
        console.log(`✅ 센서 연결 완료: ${sessionCode} (센서: ${clientId}/${assignedSensorId})`);
        
    } catch (error) {
        console.error(`❌ 세션 참가 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '세션 참가 실패'
        });
    }
}

/**
 * 게임 클라이언트로 기존 세션 참가
 */
function handleJoinAsGameClient(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    try {
        const { sessionCode, gameId, gameType } = message;
        
        // 세션 확인
        const session = sessions.get(sessionCode);
        if (!session) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '유효하지 않은 세션 코드'
            });
            return;
        }
        
        // 클라이언트를 게임 클라이언트로 설정
        client.type = CLIENT_TYPES.PC;
        client.sessionId = session.sessionId;
        client.gameId = gameId;
        client.gameType = gameType;
        
        // 세션에 게임 클라이언트 추가 (기존 PC 클라이언트 교체)
        session.pcClientId = clientId;
        
        console.log(`🎮 게임 클라이언트 연결: ${sessionCode} (게임: ${gameId})`);
        
        // 기존 센서가 연결되어 있다면 즉시 매칭 알림
        if (session.sensorClients.size > 0) {
            client.send({
                type: MESSAGE_TYPES.SESSION_MATCHED,
                sessionCode: sessionCode,
                sensorId: Array.from(session.sensorClients.keys())[0],
                sensorCount: session.sensorClients.size
            });
            
            console.log(`✅ 기존 센서와 즉시 매칭: ${sessionCode}`);
        }
        
    } catch (error) {
        console.error(`❌ 게임 클라이언트 연결 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '게임 클라이언트 연결 실패'
        });
    }
}

/**
 * 센서 데이터 처리
 */
function handleSensorData(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.SENSOR) return;
    
    try {
        // 세션 찾기 (더 안전한 방법으로 개선)
        let session = null;
        let sensorId = null;
        
        // 각 세션을 순회하면서 해당 clientId를 가진 센서 찾기
        for (const [sessionCode, sessionObj] of sessions) {
            for (const [sid, cid] of sessionObj.sensorClients) {
                if (cid === clientId) {
                    session = sessionObj;
                    sensorId = sid;
                    break;
                }
            }
            if (session) break;
        }
        
        if (!session) {
            console.warn(`⚠️ 센서 데이터: 세션을 찾을 수 없음 (${clientId})`);
            // 디버깅을 위한 추가 정보 출력
            console.log(`🔍 현재 활성 세션 수: ${sessions.size}`);
            sessions.forEach((s, code) => {
                console.log(`   세션 ${code}: PC=${s.pcClientId}, 센서=${Array.from(s.sensorClients.entries())}`);
            });
            return;
        }
        
        session.updateActivity();
        
        // PC 클라이언트에 센서 데이터 전달
        if (session.pcClientId) {
            const pcClient = clients.get(session.pcClientId);
            if (pcClient && pcClient.isConnected()) {
                pcClient.send({
                    type: MESSAGE_TYPES.SENSOR_DATA,
                    data: message.data,
                    sensorId: message.sensorId || 'primary',
                    timestamp: Date.now()
                });
            }
        }
        
        // 멀티플레이어 룸에 있는 경우 다른 플레이어들에게도 전달
        if (session.roomId) {
            const room = rooms.get(session.roomId);
            if (room && room.state === ROOM_STATES.PLAYING) {
                room.players.forEach((player, sessionId) => {
                    if (sessionId !== session.sessionId) {
                        const playerSession = Array.from(sessions.values())
                            .find(s => s.sessionId === sessionId);
                        if (playerSession && playerSession.pcClientId) {
                            const playerClient = clients.get(playerSession.pcClientId);
                            if (playerClient && playerClient.isConnected()) {
                                playerClient.send({
                                    type: MESSAGE_TYPES.GAME_EVENT,
                                    eventType: 'player_sensor_data',
                                    fromSessionId: session.sessionId,
                                    data: message.data
                                });
                            }
                        }
                    }
                });
            }
        }
        
    } catch (error) {
        console.error(`❌ 센서 데이터 처리 실패 (${clientId}):`, error);
    }
}

/**
 * 룸 생성 처리
 */
function handleCreateRoom(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        const { gameId, maxPlayers = 4 } = message;
        
        // 게임 확인
        if (!games.has(gameId)) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '존재하지 않는 게임'
            });
            return;
        }
        
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '세션을 찾을 수 없음'
            });
            return;
        }
        
        // 룸 생성
        const roomId = uuidv4();
        const room = new Room(roomId, session.sessionId, gameId, maxPlayers);
        
        // 호스트를 룸에 추가
        room.addPlayer(session.sessionId, { nickname: '호스트' });
        
        rooms.set(roomId, room);
        session.roomId = roomId;
        serverStats.totalRooms++;
        
        // 응답 전송
        client.send({
            type: MESSAGE_TYPES.ROOM_CREATED,
            roomId: roomId,
            gameId: gameId,
            isHost: true
        });
        
        console.log(`✅ 룸 생성 완료: ${roomId} (호스트: ${session.sessionId})`);
        
    } catch (error) {
        console.error(`❌ 룸 생성 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '룸 생성 실패'
        });
    }
}

/**
 * 룸 참가 처리
 */
function handleJoinRoom(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        const { roomId, nickname = 'Player' } = message;
        
        // 룸 확인
        const room = rooms.get(roomId);
        if (!room) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '존재하지 않는 룸'
            });
            return;
        }
        
        if (room.state !== ROOM_STATES.WAITING) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '참가할 수 없는 룸 상태'
            });
            return;
        }
        
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '세션을 찾을 수 없음'
            });
            return;
        }
        
        // 룸에 참가
        const result = room.addPlayer(session.sessionId, { nickname });
        if (!result.success) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: result.error
            });
            return;
        }
        
        session.roomId = roomId;
        
        // 참가자에게 응답
        client.send({
            type: MESSAGE_TYPES.ROOM_JOINED,
            roomId: roomId,
            gameId: room.gameId,
            isHost: false
        });
        
        // 룸의 모든 플레이어에게 새 플레이어 알림
        room.players.forEach((player, sessionId) => {
            const playerSession = Array.from(sessions.values())
                .find(s => s.sessionId === sessionId);
            if (playerSession && playerSession.pcClientId) {
                const playerClient = clients.get(playerSession.pcClientId);
                if (playerClient && playerClient.isConnected()) {
                    playerClient.send({
                        type: MESSAGE_TYPES.PLAYER_JOINED,
                        player: {
                            sessionId: session.sessionId,
                            nickname: nickname
                        },
                        totalPlayers: room.players.size
                    });
                }
            }
        });
        
        console.log(`✅ 룸 참가 완료: ${roomId} <- ${session.sessionId}`);
        
    } catch (error) {
        console.error(`❌ 룸 참가 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '룸 참가 실패'
        });
    }
}

/**
 * 게임 시작 처리
 */
function handleStartGame(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session || !session.roomId) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '룸을 찾을 수 없음'
            });
            return;
        }
        
        const room = rooms.get(session.roomId);
        if (!room) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '룸이 존재하지 않음'
            });
            return;
        }
        
        // 호스트 권한 확인
        if (room.hostSessionId !== session.sessionId) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '호스트만 게임을 시작할 수 있음'
            });
            return;
        }
        
        // 게임 시작
        const result = room.startGame();
        if (!result.success) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: result.error
            });
            return;
        }
        
        // 모든 플레이어에게 게임 시작 알림
        room.players.forEach((player, sessionId) => {
            const playerSession = Array.from(sessions.values())
                .find(s => s.sessionId === sessionId);
            if (playerSession) {
                playerSession.state = SESSION_STATES.PLAYING;
                if (playerSession.pcClientId) {
                    const playerClient = clients.get(playerSession.pcClientId);
                    if (playerClient && playerClient.isConnected()) {
                        playerClient.send({
                            type: MESSAGE_TYPES.GAME_STARTED,
                            roomId: room.roomId,
                            gameId: room.gameId,
                            players: Array.from(room.players.values())
                        });
                    }
                }
            }
        });
        
        console.log(`✅ 게임 시작: ${room.roomId}`);
        
    } catch (error) {
        console.error(`❌ 게임 시작 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '게임 시작 실패'
        });
    }
}

/**
 * 게임 이벤트 처리
 */
function handleGameEvent(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session) return;
        
        session.updateActivity();
        
        // 룸의 다른 플레이어들에게 이벤트 전달
        if (session.roomId) {
            const room = rooms.get(session.roomId);
            if (room && room.state === ROOM_STATES.PLAYING) {
                room.players.forEach((player, sessionId) => {
                    if (sessionId !== session.sessionId) {
                        const playerSession = Array.from(sessions.values())
                            .find(s => s.sessionId === sessionId);
                        if (playerSession && playerSession.pcClientId) {
                            const playerClient = clients.get(playerSession.pcClientId);
                            if (playerClient && playerClient.isConnected()) {
                                playerClient.send({
                                    type: MESSAGE_TYPES.GAME_EVENT,
                                    fromSessionId: session.sessionId,
                                    eventType: message.eventType,
                                    data: message.data
                                });
                            }
                        }
                    }
                });
            }
        }
        
    } catch (error) {
        console.error(`❌ 게임 이벤트 처리 실패 (${clientId}):`, error);
    }
}

/**
 * 관리자 상태 처리
 */
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
            connectedClients: clients.size,
            gamesLoaded: games.size
        },
        sessions: Array.from(sessions.values()).map(s => ({
            sessionCode: s.sessionCode,
            sessionId: s.sessionId,
            state: s.state,
            gameMode: s.gameMode,
            pcConnected: s.pcClientId !== null,
            sensorCount: s.sensorClients.size,
            roomId: s.roomId
        })),
        rooms: Array.from(rooms.values()).map(r => ({
            roomId: r.roomId,
            gameId: r.gameId,
            state: r.state,
            playerCount: r.players.size,
            maxPlayers: r.maxPlayers
        }))
    };
    
    client.send(statusData);
    console.log(`👑 관리자 연결: ${clientId}`);
}

/**
 * 클라이언트 연결 해제 처리
 */
function handleDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;
    
    console.log(`🔌 클라이언트 연결 해제: ${clientId} (타입: ${client.type || 'unknown'})`);
    
    try {
        // 세션에서 클라이언트 제거
        if (client.type === CLIENT_TYPES.PC) {
            // PC 클라이언트 연결 해제 처리
            const session = Array.from(sessions.values())
                .find(s => s.pcClientId === clientId);
            
            if (session) {
                session.pcClientId = null;
                
                // 센서 클라이언트에 PC 연결 해제 알림
                session.sensorClients.forEach((sensorClientId, sensorId) => {
                    const sensorClient = clients.get(sensorClientId);
                    if (sensorClient && sensorClient.isConnected()) {
                        sensorClient.send({
                            type: MESSAGE_TYPES.ERROR,
                            error: 'PC 연결이 해제되었습니다'
                        });
                    }
                });
                
                // 룸에서 플레이어 제거
                if (session.roomId) {
                    const room = rooms.get(session.roomId);
                    if (room) {
                        room.removePlayer(session.sessionId);
                        
                        // 다른 플레이어들에게 알림
                        room.players.forEach((player, sessionId) => {
                            const playerSession = Array.from(sessions.values())
                                .find(s => s.sessionId === sessionId);
                            if (playerSession && playerSession.pcClientId) {
                                const playerClient = clients.get(playerSession.pcClientId);
                                if (playerClient && playerClient.isConnected()) {
                                    playerClient.send({
                                        type: MESSAGE_TYPES.PLAYER_LEFT,
                                        sessionId: session.sessionId,
                                        totalPlayers: room.players.size
                                    });
                                }
                            }
                        });
                        
                        // 빈 룸 정리
                        if (room.isEmpty()) {
                            room.cleanup();
                            rooms.delete(session.roomId);
                            console.log(`🗑️ 빈 룸 정리: ${session.roomId}`);
                        }
                    }
                }
                
                // 세션에 연결된 클라이언트가 없다면 즉시 정리
                if (session.sensorClients.size === 0) {
                    console.log(`🧹 빈 세션 즉시 정리: ${session.sessionCode}`);
                    cleanupSession(session.sessionCode);
                }
            }
            
        } else if (client.type === CLIENT_TYPES.SENSOR) {
            // 센서 클라이언트 연결 해제 처리
            const session = Array.from(sessions.values())
                .find(s => Array.from(s.sensorClients.values()).includes(clientId));
            
            if (session) {
                // 센서 클라이언트 제거
                for (const [sensorId, sensorClientId] of session.sensorClients) {
                    if (sensorClientId === clientId) {
                        session.disconnectSensor(sensorId);
                        break;
                    }
                }
                
                // PC 클라이언트에 센서 연결 해제 알림
                if (session.pcClientId) {
                    const pcClient = clients.get(session.pcClientId);
                    if (pcClient && pcClient.isConnected()) {
                        pcClient.send({
                            type: MESSAGE_TYPES.ERROR,
                            error: '센서 연결이 해제되었습니다'
                        });
                    }
                }
                
                // 세션에 연결된 센서가 없고 PC 클라이언트도 없다면 즉시 정리
                if (session && session.sensorClients.size === 0 && !session.pcClientId) {
                    console.log(`🧹 빈 세션 즉시 정리: ${session.sessionCode}`);
                    cleanupSession(session.sessionCode);
                }
            }
            
        } else if (client.type === CLIENT_TYPES.ADMIN) {
            // 관리자 클라이언트 제거
            adminClients.delete(clientId);
        }
        
        // 클라이언트 정리
        client.cleanup();
        clients.delete(clientId);
        
    } catch (error) {
        console.error(`❌ 연결 해제 처리 중 오류 (${clientId}):`, error);
    }
}

// ========== 정리 작업 ==========

/**
 * 비활성 세션 정리
 */
function cleanupInactiveSessions() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10분
    const sessionsToClean = [];
    
    // 1단계: 정리할 세션들 수집
    for (const [sessionCode, session] of sessions.entries()) {
        if (now - session.lastActivity > timeout) {
            sessionsToClean.push(sessionCode);
        }
    }
    
    // 2단계: 배치로 정리 (안전하게)
    sessionsToClean.forEach(sessionCode => {
        cleanupSession(sessionCode);
    });
    
    if (sessionsToClean.length > 0) {
        console.log(`🧹 총 ${sessionsToClean.length}개 비활성 세션 정리 완료`);
    }
    
    // 3단계: 만료된 세션 코드도 정리
    cleanupExpiredCodes();
}

/**
 * 안전한 세션 정리 (연관된 모든 리소스 정리)
 */
function cleanupSession(sessionCode) {
    const session = sessions.get(sessionCode);
    if (!session) return;
    
    console.log(`🧹 세션 정리 시작: ${sessionCode}`);
    
    try {
        // 1. 연결된 모든 클라이언트에 세션 종료 알림
        const allClientIds = [
            session.pcClientId,
            ...session.sensorClients.values()
        ].filter(Boolean);
        
        allClientIds.forEach(clientId => {
            const client = clients.get(clientId);
            if (client && client.isConnected()) {
                try {
                    client.send({
                        type: 'session_ended',
                        reason: 'Session cleanup due to inactivity',
                        sessionCode: sessionCode
                    });
                } catch (error) {
                    console.warn(`⚠️ 클라이언트 알림 실패 (${clientId}):`, error);
                }
            }
        });
        
        // 2. 연관된 룸에서 제거
        if (session.roomId) {
            const room = rooms.get(session.roomId);
            if (room) {
                try {
                    room.removePlayer(session.sessionId);
                    if (room.isEmpty()) {
                        console.log(`🧹 빈 룸 정리: ${session.roomId}`);
                        room.cleanup();
                        rooms.delete(session.roomId);
                    }
                } catch (error) {
                    console.warn(`⚠️ 룸 정리 실패 (${session.roomId}):`, error);
                }
            }
        }
        
        // 3. 세션 정리
        session.cleanup();
        sessions.delete(sessionCode);
        
        // 4. 최근 사용 코드에서도 제거 (30분 후 재사용 허용)
        recentlyUsedCodes.delete(sessionCode);
        
        console.log(`✅ 세션 정리 완료: ${sessionCode}`);
        
    } catch (error) {
        console.error(`❌ 세션 정리 중 오류 (${sessionCode}):`, error);
    }
}

/**
 * 비활성 룸 정리
 */
function cleanupInactiveRooms() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30분
    
    for (const [roomId, room] of rooms.entries()) {
        if (room.isEmpty() || now - room.lastActivity > timeout) {
            console.log(`🧹 비활성 룸 정리: ${roomId}`);
            room.cleanup();
            rooms.delete(roomId);
        }
    }
}

/**
 * 연결이 끊어진 클라이언트 정리
 */
function cleanupDisconnectedClients() {
    for (const [clientId, client] of clients.entries()) {
        if (!client.isConnected()) {
            console.log(`🧹 연결 끊어진 클라이언트 정리: ${clientId}`);
            handleDisconnect(clientId);
        }
    }
}

// ========== HTTP 라우트 ==========

// 메인 랜딩 페이지 (기기 선택)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// PC 허브
app.get('/hub', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'hub.html'));
});

// 센서 클라이언트
app.get('/sensor', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'sensor.html'));
});

// 관리자 대시보드
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'admin.html'));
});

// 게임 API
app.get('/api/games', (req, res) => {
    try {
        const gameList = Array.from(games.entries()).map(([gameId, metadata]) => ({
            gameId,
            ...metadata
        }));
        
        console.log(`📚 게임 목록 요청: ${gameList.length}개 게임 반환`);
        
        res.json({
            success: true,
            games: gameList,
            count: gameList.length
        });
    } catch (error) {
        console.error('❌ 게임 목록 API 오류:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load games',
            games: []
        });
    }
});

// 서버 상태 API
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        stats: {
            uptime: Date.now() - serverStats.startTime,
            totalConnections: serverStats.totalConnections,
            activeSessions: sessions.size,
            activeRooms: rooms.size,
            connectedClients: clients.size,
            gamesLoaded: games.size
        }
    });
});

// 디버그 API 
app.get('/api/debug', (req, res) => {
    res.json({
        success: true,
        debug: {
            gamesDir: path.join(__dirname, 'games'),
            gamesExist: fs.existsSync(path.join(__dirname, 'games')),
            loadedGames: Array.from(games.keys()),
            totalGames: games.size,
            environment: NODE_ENV,
            port: PORT,
            host: HOST
        }
    });
});

// ========== 서버 시작 ==========

// 게임 메타데이터 로드
loadGameMetadata();

// 정리 작업 스케줄링
setInterval(cleanupInactiveSessions, 5 * 60 * 1000);   // 5분마다
setInterval(cleanupInactiveRooms, 10 * 60 * 1000);     // 10분마다
setInterval(cleanupDisconnectedClients, 2 * 60 * 1000); // 2분마다

// 서버 시작
server.listen(PORT, HOST, () => {
    console.log(`
🚀 Sensor Game Hub v5.0 서버 시작!
===========================================
🌐 메인 허브: http://${HOST}:${PORT}
📱 센서: http://${HOST}:${PORT}/sensor  
👑 관리자: http://${HOST}:${PORT}/admin
🎮 게임 수: ${games.size}개
===========================================
`);
});

console.log(`✅ 서버 구성 완료`);
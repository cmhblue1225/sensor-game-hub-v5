/**
 * 🚀 Sensor Game Hub v5.0 - 완전 재설계된 서버
 * 
 * 듀얼 센서 및 멀티플레이어 완벽 지원
 * 사용자 경험 최우선 설계
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// 환경 설정
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`🚀 Sensor Game Hub v5.0 (재설계) 시작 중...`);

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

// ========== 상태 정의 ==========

const SESSION_STATES = {
    CREATED: 'created',
    DUAL_SENSOR_READY: 'dual_sensor_ready',
    MULTIPLAYER_ROOM_CREATED: 'multiplayer_room_created',
    PLAYING: 'playing',
    ENDED: 'ended'
};

const ROOM_STATES = {
    WAITING: 'waiting',           // 참가자 대기 중
    READY: 'ready',              // 모든 참가자 센서 연결 완료
    STARTING: 'starting',         // 게임 시작 중
    PLAYING: 'playing',          // 게임 진행 중
    FINISHED: 'finished'         // 게임 종료
};

const CLIENT_TYPES = {
    PC: 'pc',
    SENSOR: 'sensor',
    ADMIN: 'admin'
};

const MESSAGE_TYPES = {
    // 기본 연결
    CONNECTED: 'connected',
    ERROR: 'error',
    
    // 세션 관리
    CREATE_SESSION: 'create_session',
    SESSION_CREATED: 'session_created',
    JOIN_SESSION: 'join_session',
    SESSION_JOINED: 'session_joined',
    SESSION_MATCHED: 'session_matched',
    DUAL_SENSOR_READY: 'dual_sensor_ready',
    
    // 센서 데이터
    SENSOR_DATA: 'sensor_data',
    
    // 멀티플레이어 룸
    CREATE_ROOM: 'create_room',
    ROOM_CREATED: 'room_created',
    JOIN_ROOM: 'join_room',
    ROOM_JOINED: 'room_joined',
    LEAVE_ROOM: 'leave_room',
    ROOM_LEFT: 'room_left',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_SENSOR_CONNECTED: 'player_sensor_connected',
    
    // 게임 컨트롤
    START_GAME: 'start_game',
    GAME_STARTED: 'game_started',
    END_GAME: 'end_game',
    GAME_ENDED: 'game_ended',
    RETURN_TO_ROOM: 'return_to_room',
    
    // 룸 대기실
    ROOM_STATUS_UPDATE: 'room_status_update',
    NAVIGATE_TO_ROOM: 'navigate_to_room',
    NAVIGATE_TO_GAME: 'navigate_to_game',
    
    // 관리자
    ADMIN_STATUS: 'admin_status'
};

// ========== 데이터 저장소 ==========
const clients = new Map();      // clientId -> Client
const sessions = new Map();     // sessionCode -> Session  
const rooms = new Map();        // roomId -> Room
const recentlyUsedCodes = new Map(); // 중복 방지

// ========== 핵심 클래스 정의 ==========

/**
 * 완전 재설계된 Session 클래스
 */
class Session {
    constructor(sessionCode, gameType) {
        this.sessionCode = sessionCode;
        this.sessionId = uuidv4();
        this.gameType = gameType; // 'solo', 'dual', 'multiplayer'
        this.state = SESSION_STATES.CREATED;
        this.pcClientId = null;
        this.sensorClients = new Map(); // sensorId -> clientId
        this.roomId = null;
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
        
        console.log(`📝 세션 생성: ${this.sessionCode} (타입: ${gameType})`);
    }
    
    // PC 클라이언트 연결
    connectPC(clientId) {
        this.pcClientId = clientId;
        this.updateActivity();
        console.log(`💻 PC 연결: ${this.sessionCode} <- ${clientId}`);
    }
    
    // 센서 클라이언트 연결
    connectSensor(clientId, requestedSensorId = 'sensor1') {
        let finalSensorId = requestedSensorId;
        
        // 듀얼 센서의 경우 고유한 ID 보장
        if (this.gameType === 'dual') {
            if (this.sensorClients.size === 0) {
                finalSensorId = 'sensor1';
            } else if (this.sensorClients.size === 1) {
                finalSensorId = 'sensor2';
            } else {
                throw new Error('듀얼 센서는 최대 2개까지만 연결 가능');
            }
        } else {
            // 멀티플레이어의 경우 참가자 ID 기반으로 센서 ID 생성
            finalSensorId = `player_${this.sensorClients.size + 1}`;
        }
        
        this.sensorClients.set(finalSensorId, clientId);
        this.updateActivity();
        
        console.log(`📱 센서 연결: ${this.sessionCode} <- ${clientId} (${finalSensorId})`);
        
        // 듀얼 센서 완료 체크
        if (this.gameType === 'dual' && this.sensorClients.size === 2) {
            this.state = SESSION_STATES.DUAL_SENSOR_READY;
        }
        
        return finalSensorId;
    }
    
    // 센서 연결 해제
    disconnectSensor(sensorId) {
        const clientId = this.sensorClients.get(sensorId);
        this.sensorClients.delete(sensorId);
        
        console.log(`📱 센서 해제: ${this.sessionCode} -> ${clientId} (${sensorId})`);
        
        // 듀얼 센서 상태 업데이트
        if (this.gameType === 'dual' && this.state === SESSION_STATES.DUAL_SENSOR_READY) {
            this.state = SESSION_STATES.CREATED;
        }
        
        return clientId;
    }
    
    // 센서 클라이언트 ID로 센서 ID 찾기
    findSensorIdByClientId(clientId) {
        for (const [sensorId, cId] of this.sensorClients) {
            if (cId === clientId) {
                return sensorId;
            }
        }
        return null;
    }
    
    // 듀얼 센서 준비 상태 확인
    isDualSensorReady() {
        return this.gameType === 'dual' && this.sensorClients.size === 2;
    }
    
    // 활동 시간 업데이트
    updateActivity() {
        this.lastActivity = Date.now();
    }
    
    // 세션 정리
    cleanup() {
        this.state = SESSION_STATES.ENDED;
        console.log(`🗑️ 세션 정리: ${this.sessionCode}`);
    }
}

/**
 * 완전 재설계된 Room 클래스
 */
class Room {
    constructor(roomId, hostSessionId, gameId, maxPlayers = 10) {
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
        
        const player = {
            sessionId,
            nickname: playerData.nickname || `Player${this.players.size + 1}`,
            isHost: sessionId === this.hostSessionId,
            sensorConnected: false,
            joinedAt: Date.now()
        };
        
        this.players.set(sessionId, player);
        this.updateActivity();
        
        console.log(`👥 플레이어 참가: ${this.roomId} <- ${sessionId} (${player.nickname})`);
        return { success: true, player };
    }
    
    // 플레이어 제거
    removePlayer(sessionId) {
        const player = this.players.get(sessionId);
        this.players.delete(sessionId);
        this.updateActivity();
        
        console.log(`👤 플레이어 퇴장: ${this.roomId} -> ${sessionId}`);
        
        // 호스트가 나간 경우 룸 해체
        if (sessionId === this.hostSessionId && this.players.size > 0) {
            // 새로운 호스트 지정 (첫 번째 플레이어)
            const newHost = Array.from(this.players.values())[0];
            this.hostSessionId = newHost.sessionId;
            newHost.isHost = true;
            console.log(`👑 새 호스트 지정: ${newHost.sessionId}`);
        }
        
        return player;
    }
    
    // 플레이어 센서 연결 상태 업데이트
    updatePlayerSensorStatus(sessionId, connected) {
        const player = this.players.get(sessionId);
        if (player) {
            player.sensorConnected = connected;
            this.updateActivity();
        }
        
        // 모든 플레이어 센서 연결 확인
        this.checkReadyState();
    }
    
    // 모든 플레이어 준비 상태 확인
    checkReadyState() {
        const allReady = Array.from(this.players.values())
            .every(player => player.sensorConnected);
        
        if (allReady && this.players.size >= 2 && this.state === ROOM_STATES.WAITING) {
            this.state = ROOM_STATES.READY;
            console.log(`✅ 룸 준비 완료: ${this.roomId}`);
        } else if (!allReady && this.state === ROOM_STATES.READY) {
            this.state = ROOM_STATES.WAITING;
            console.log(`⏳ 룸 대기 상태로 복귀: ${this.roomId}`);
        }
    }
    
    // 게임 시작
    startGame() {
        if (this.state !== ROOM_STATES.READY) {
            return { success: false, error: '모든 플레이어가 준비되지 않음' };
        }
        
        if (this.players.size < 2) {
            return { success: false, error: '최소 2명의 플레이어가 필요함' };
        }
        
        this.state = ROOM_STATES.STARTING;
        this.updateActivity();
        
        console.log(`🎮 게임 시작: ${this.roomId} (${this.players.size}명)`);
        return { success: true };
    }
    
    // 게임 상태로 전환
    setPlaying() {
        this.state = ROOM_STATES.PLAYING;
        this.updateActivity();
    }
    
    // 게임 종료 후 대기실로 복귀
    returnToWaiting() {
        this.state = ROOM_STATES.WAITING;
        
        // 모든 플레이어의 센서 연결 상태 유지
        this.checkReadyState();
        
        console.log(`🔄 룸 대기실로 복귀: ${this.roomId}`);
    }
    
    // 활동 시간 업데이트
    updateActivity() {
        this.lastActivity = Date.now();
    }
    
    // 룸이 비어있는지 확인
    isEmpty() {
        return this.players.size === 0;
    }
    
    // 룸 상태 정보 가져오기
    getStatus() {
        return {
            roomId: this.roomId,
            gameId: this.gameId,
            state: this.state,
            playerCount: this.players.size,
            maxPlayers: this.maxPlayers,
            hostSessionId: this.hostSessionId,
            players: Array.from(this.players.values()),
            canStart: this.state === ROOM_STATES.READY && this.players.size >= 2
        };
    }
    
    // 룸 정리
    cleanup() {
        this.state = ROOM_STATES.FINISHED;
        console.log(`🗑️ 룸 정리: ${this.roomId}`);
    }
}

/**
 * 클라이언트 클래스
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
    }
    
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
    
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    close() {
        if (this.ws) {
            this.ws.close();
        }
        this.isActive = false;
    }
}

// ========== 유틸리티 함수들 ==========

// TTL 기반 세션 코드 생성 (중복 방지)
function generateSessionCode() {
    let attempts = 0;
    while (attempts < 10000) {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        if (!sessions.has(code) && !isRecentlyUsed(code)) {
            addToRecentlyUsed(code);
            return code;
        }
        attempts++;
    }
    throw new Error('사용 가능한 세션 코드 부족');
}

function isRecentlyUsed(code) {
    const entry = recentlyUsedCodes.get(code);
    if (!entry) return false;
    
    if (Date.now() > entry) {
        recentlyUsedCodes.delete(code);
        return false;
    }
    return true;
}

function addToRecentlyUsed(code) {
    // 10분 TTL
    recentlyUsedCodes.set(code, Date.now() + (10 * 60 * 1000));
}

// 룸 ID 생성
function generateRoomId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

module.exports = {
    Session,
    Room,
    Client,
    SESSION_STATES,
    ROOM_STATES,
    CLIENT_TYPES,
    MESSAGE_TYPES,
    generateSessionCode,
    generateRoomId
};
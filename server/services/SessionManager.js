/**
 * 🎮 세션 관리 서비스
 * 
 * 게임 세션의 생명주기를 완전 관리
 * - 세션 생성/삭제
 * - 센서 클라이언트 매칭
 * - 상태 동기화
 * - 자동 정리
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const Logger = require('../utils/Logger');

/**
 * 세션 상태 정의
 */
const SESSION_STATES = {
    CREATED: 'created',           // 세션 생성됨
    WAITING_SENSORS: 'waiting_sensors', // 센서 연결 대기
    SENSORS_CONNECTED: 'sensors_connected', // 센서 연결 완료
    GAME_READY: 'game_ready',     // 게임 시작 가능
    PLAYING: 'playing',           // 게임 진행 중
    PAUSED: 'paused',            // 게임 일시정지
    ENDED: 'ended'               // 게임 종료
};

/**
 * 게임 타입 정의
 */
const GAME_TYPES = {
    SOLO: 'solo',
    DUAL: 'dual', 
    MULTIPLAYER: 'multiplayer'
};

/**
 * 세션 클래스
 */
class GameSession {
    constructor(sessionCode, gameType, hostConnectionId) {
        this.sessionId = uuidv4();
        this.sessionCode = sessionCode;
        this.gameType = gameType;
        this.state = SESSION_STATES.CREATED;
        
        // 연결 정보
        this.hostConnectionId = hostConnectionId;
        this.sensorConnections = new Map(); // sensorId -> connectionId
        this.roomId = null; // 멀티플레이어용
        
        // 메타데이터
        this.createdAt = new Date();
        this.lastActivity = new Date();
        this.gameStartedAt = null;
        this.gameEndedAt = null;
        
        // 설정
        this.maxSensors = this.getMaxSensorsForType(gameType);
        this.autoStartGame = gameType !== GAME_TYPES.MULTIPLAYER;
        
        // 상태 데이터
        this.gameData = {};
        this.sensorData = new Map(); // sensorId -> lastSensorData
    }
    
    /**
     * 게임 타입별 최대 센서 수 반환
     */
    getMaxSensorsForType(gameType) {
        switch (gameType) {
            case GAME_TYPES.SOLO:
                return 1;
            case GAME_TYPES.DUAL:
                return 2;
            case GAME_TYPES.MULTIPLAYER:
                return 10; // 최대 10명
            default:
                return 1;
        }
    }
    
    /**
     * 센서 연결
     */
    connectSensor(connectionId, requestedSensorId = null) {
        // 센서 ID 결정
        let sensorId = requestedSensorId;
        if (!sensorId) {
            sensorId = this.generateSensorId();
        }
        
        // 중복 확인
        if (this.sensorConnections.has(sensorId)) {
            throw new Error(`센서 ID '${sensorId}'는 이미 사용 중입니다`);
        }
        
        // 최대 센서 수 확인
        if (this.sensorConnections.size >= this.maxSensors) {
            throw new Error(`최대 센서 수(${this.maxSensors})를 초과했습니다`);
        }
        
        // 센서 연결 등록
        this.sensorConnections.set(sensorId, connectionId);
        this.updateActivity();
        
        // 상태 업데이트
        this.updateState();
        
        return sensorId;
    }
    
    /**
     * 센서 ID 자동 생성
     */
    generateSensorId() {
        switch (this.gameType) {
            case GAME_TYPES.SOLO:
                return 'main';
            case GAME_TYPES.DUAL:
                return this.sensorConnections.size === 0 ? 'left' : 'right';
            case GAME_TYPES.MULTIPLAYER:
                return `player_${this.sensorConnections.size + 1}`;
            default:
                return `sensor_${this.sensorConnections.size + 1}`;
        }
    }
    
    /**
     * 센서 연결 해제
     */
    disconnectSensor(sensorId) {
        const connectionId = this.sensorConnections.get(sensorId);
        if (!connectionId) {
            return null;
        }
        
        this.sensorConnections.delete(sensorId);
        this.sensorData.delete(sensorId);
        this.updateActivity();
        
        // 상태 업데이트
        this.updateState();
        
        return connectionId;
    }
    
    /**
     * 연결 ID로 센서 찾기
     */
    findSensorByConnectionId(connectionId) {
        for (const [sensorId, connId] of this.sensorConnections) {
            if (connId === connectionId) {
                return sensorId;
            }
        }
        return null;
    }
    
    /**
     * 센서 데이터 업데이트
     */
    updateSensorData(sensorId, data) {
        if (!this.sensorConnections.has(sensorId)) {
            throw new Error(`센서 '${sensorId}'를 찾을 수 없습니다`);
        }
        
        this.sensorData.set(sensorId, {
            ...data,
            timestamp: Date.now(),
            sensorId
        });
        
        this.updateActivity();
    }
    
    /**
     * 상태 자동 업데이트
     */
    updateState() {
        const oldState = this.state;
        
        // 센서 연결 상태에 따른 상태 전환
        if (this.state === SESSION_STATES.CREATED || this.state === SESSION_STATES.WAITING_SENSORS) {
            if (this.isAllSensorsConnected()) {
                this.state = SESSION_STATES.SENSORS_CONNECTED;
                
                // 자동 게임 시작이 활성화된 경우
                if (this.autoStartGame) {
                    this.state = SESSION_STATES.GAME_READY;
                }
            } else if (this.sensorConnections.size > 0) {
                this.state = SESSION_STATES.WAITING_SENSORS;
            }
        }
        
        // 센서 연결이 끊어진 경우
        if (this.state === SESSION_STATES.SENSORS_CONNECTED || this.state === SESSION_STATES.GAME_READY) {
            if (!this.isAllSensorsConnected()) {
                this.state = SESSION_STATES.WAITING_SENSORS;
            }
        }
        
        // 상태 변경 이벤트 발생
        if (oldState !== this.state) {
            this.onStateChanged(oldState, this.state);
        }
    }
    
    /**
     * 모든 센서가 연결되었는지 확인
     */
    isAllSensorsConnected() {
        return this.sensorConnections.size === this.maxSensors;
    }
    
    /**
     * 게임 시작
     */
    startGame() {
        if (this.state !== SESSION_STATES.GAME_READY && 
            this.state !== SESSION_STATES.SENSORS_CONNECTED) {
            throw new Error(`게임을 시작할 수 없는 상태입니다: ${this.state}`);
        }
        
        this.state = SESSION_STATES.PLAYING;
        this.gameStartedAt = new Date();
        this.updateActivity();
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        if (this.state !== SESSION_STATES.PLAYING && this.state !== SESSION_STATES.PAUSED) {
            throw new Error(`게임을 종료할 수 없는 상태입니다: ${this.state}`);
        }
        
        this.state = SESSION_STATES.ENDED;
        this.gameEndedAt = new Date();
        this.updateActivity();
    }
    
    /**
     * 활동 시간 업데이트
     */
    updateActivity() {
        this.lastActivity = new Date();
    }
    
    /**
     * 상태 변경 이벤트 핸들러
     */
    onStateChanged(oldState, newState) {
        // 서브클래스에서 오버라이드 가능
    }
    
    /**
     * 세션 정보 반환
     */
    getInfo() {
        return {
            sessionId: this.sessionId,
            sessionCode: this.sessionCode,
            gameType: this.gameType,
            state: this.state,
            hostConnectionId: this.hostConnectionId,
            sensors: Array.from(this.sensorConnections.keys()),
            sensorCount: this.sensorConnections.size,
            maxSensors: this.maxSensors,
            roomId: this.roomId,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity,
            gameStartedAt: this.gameStartedAt,
            gameEndedAt: this.gameEndedAt,
            isReady: this.state === SESSION_STATES.GAME_READY,
            isPlaying: this.state === SESSION_STATES.PLAYING
        };
    }
    
    /**
     * 세션이 만료되었는지 확인
     */
    isExpired(timeoutMs = 5 * 60 * 1000) { // 기본 5분
        return Date.now() - this.lastActivity.getTime() > timeoutMs;
    }
}

/**
 * 세션 관리자 클래스
 */
class SessionManager extends EventEmitter {
    constructor() {
        super();
        
        this.logger = new Logger('SessionManager');
        this.sessions = new Map(); // sessionCode -> GameSession
        this.connectionToSession = new Map(); // connectionId -> sessionCode
        this.usedCodes = new Map(); // 최근 사용된 코드들 (TTL)
        
        // 설정
        this.codeLength = 4;
        this.codeReuseCooldown = 10 * 60 * 1000; // 10분
        this.sessionTimeout = 30 * 60 * 1000; // 30분
        
        this.logger.info('세션 관리자 초기화 완료');
    }
    
    /**
     * 새 세션 생성
     */
    async createSession(gameType, hostConnectionId) {
        try {
            // 게임 타입 검증
            if (!Object.values(GAME_TYPES).includes(gameType)) {
                throw new Error(`지원하지 않는 게임 타입: ${gameType}`);
            }
            
            // 세션 코드 생성
            const sessionCode = this.generateUniqueSessionCode();
            
            // 세션 생성
            const session = new GameSession(sessionCode, gameType, hostConnectionId);
            
            // 등록
            this.sessions.set(sessionCode, session);
            this.connectionToSession.set(hostConnectionId, sessionCode);
            
            this.logger.info('새 세션 생성', {
                sessionCode,
                gameType,
                hostConnectionId,
                sessionId: session.sessionId
            });
            
            this.emit('session:created', session);
            
            return session;
            
        } catch (error) {
            this.logger.error('세션 생성 실패', {
                gameType,
                hostConnectionId,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 고유한 세션 코드 생성
     */
    generateUniqueSessionCode() {
        let attempts = 0;
        const maxAttempts = 1000;
        
        while (attempts < maxAttempts) {
            const code = this.generateSessionCode();
            
            // 현재 사용 중인지 확인
            if (this.sessions.has(code)) {
                attempts++;
                continue;
            }
            
            // 최근 사용된 코드인지 확인
            const recentlyUsed = this.usedCodes.get(code);
            if (recentlyUsed && Date.now() - recentlyUsed < this.codeReuseCooldown) {
                attempts++;
                continue;
            }
            
            // 사용된 코드로 등록
            this.usedCodes.set(code, Date.now());
            
            return code;
        }
        
        throw new Error('사용 가능한 세션 코드를 생성할 수 없습니다');
    }
    
    /**
     * 세션 코드 생성
     */
    generateSessionCode() {
        let code = '';
        for (let i = 0; i < this.codeLength; i++) {
            code += Math.floor(Math.random() * 10);
        }
        return code;
    }
    
    /**
     * 세션 찾기
     */
    getSession(sessionCode) {
        return this.sessions.get(sessionCode) || null;
    }
    
    /**
     * 연결 ID로 세션 찾기
     */
    getSessionByConnection(connectionId) {
        const sessionCode = this.connectionToSession.get(connectionId);
        return sessionCode ? this.sessions.get(sessionCode) : null;
    }
    
    /**
     * 센서를 세션에 연결
     */
    async connectSensorToSession(sessionCode, connectionId, requestedSensorId = null) {
        try {
            const session = this.getSession(sessionCode);
            if (!session) {
                throw new Error(`세션을 찾을 수 없습니다: ${sessionCode}`);
            }
            
            // 센서 연결
            const sensorId = session.connectSensor(connectionId, requestedSensorId);
            
            // 연결 매핑 등록
            this.connectionToSession.set(connectionId, sessionCode);
            
            this.logger.info('센서 연결 완료', {
                sessionCode,
                sensorId,
                connectionId,
                sessionState: session.state
            });
            
            this.emit('sensor:connected', {
                session,
                sensorId,
                connectionId
            });
            
            return { session, sensorId };
            
        } catch (error) {
            this.logger.error('센서 연결 실패', {
                sessionCode,
                connectionId,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 연결 해제 처리
     */
    async handleDisconnection(connectionId) {
        try {
            const sessionCode = this.connectionToSession.get(connectionId);
            if (!sessionCode) {
                return; // 세션에 속하지 않은 연결
            }
            
            const session = this.getSession(sessionCode);
            if (!session) {
                this.connectionToSession.delete(connectionId);
                return;
            }
            
            // 호스트 연결 해제
            if (session.hostConnectionId === connectionId) {
                this.logger.info('호스트 연결 해제, 세션 종료', {
                    sessionCode,
                    connectionId
                });
                
                await this.removeSession(sessionCode);
                return;
            }
            
            // 센서 연결 해제
            const sensorId = session.findSensorByConnectionId(connectionId);
            if (sensorId) {
                session.disconnectSensor(sensorId);
                this.connectionToSession.delete(connectionId);
                
                this.logger.info('센서 연결 해제', {
                    sessionCode,
                    sensorId,
                    connectionId,
                    remainingSensors: session.sensorConnections.size
                });
                
                this.emit('sensor:disconnected', {
                    session,
                    sensorId,
                    connectionId
                });
            }
            
        } catch (error) {
            this.logger.error('연결 해제 처리 실패', {
                connectionId,
                error: error.message
            });
        }
    }
    
    /**
     * 세션 제거
     */
    async removeSession(sessionCode) {
        try {
            const session = this.sessions.get(sessionCode);
            if (!session) {
                return;
            }
            
            // 모든 연결 매핑 제거
            this.connectionToSession.delete(session.hostConnectionId);
            for (const connectionId of session.sensorConnections.values()) {
                this.connectionToSession.delete(connectionId);
            }
            
            // 세션 제거
            this.sessions.delete(sessionCode);
            
            this.logger.info('세션 제거 완료', {
                sessionCode,
                sessionId: session.sessionId
            });
            
            this.emit('session:removed', session);
            
        } catch (error) {
            this.logger.error('세션 제거 실패', {
                sessionCode,
                error: error.message
            });
        }
    }
    
    /**
     * 정리 작업 수행
     */
    async cleanup() {
        let cleaned = 0;
        const now = Date.now();
        
        try {
            // 만료된 세션 정리
            for (const [sessionCode, session] of this.sessions) {
                if (session.isExpired(this.sessionTimeout)) {
                    await this.removeSession(sessionCode);
                    cleaned++;
                }
            }
            
            // 오래된 사용 코드 정리
            for (const [code, timestamp] of this.usedCodes) {
                if (now - timestamp > this.codeReuseCooldown) {
                    this.usedCodes.delete(code);
                }
            }
            
            if (cleaned > 0) {
                this.logger.info('세션 정리 완료', {
                    cleanedSessions: cleaned,
                    activeSessions: this.sessions.size
                });
            }
            
        } catch (error) {
            this.logger.error('세션 정리 실패', { error: error.message });
        }
        
        return cleaned;
    }
    
    /**
     * 활성 세션 수 반환
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }
    
    /**
     * 모든 세션 정보 반환
     */
    getAllSessions() {
        const sessions = [];
        for (const session of this.sessions.values()) {
            sessions.push(session.getInfo());
        }
        return sessions;
    }
    
    /**
     * 서비스 종료
     */
    async shutdown() {
        this.logger.info('세션 관리자 종료 시작...');
        
        // 모든 세션 정리
        const sessionCodes = Array.from(this.sessions.keys());
        for (const sessionCode of sessionCodes) {
            await this.removeSession(sessionCode);
        }
        
        this.logger.info('세션 관리자 종료 완료');
    }
}

module.exports = {
    SessionManager,
    GameSession,
    SESSION_STATES,
    GAME_TYPES
};
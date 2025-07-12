/**
 * 🎮 게임 상태 관리 서비스
 * 
 * 멀티플레이어 게임 상태 및 룸 관리
 * - 룸 생성/삭제
 * - 플레이어 관리
 * - 게임 상태 동기화
 * - 실시간 이벤트 처리
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const Logger = require('../utils/Logger');

/**
 * 룸 상태 정의
 */
const ROOM_STATES = {
    WAITING: 'waiting',         // 플레이어 대기 중
    READY: 'ready',            // 모든 플레이어 준비 완료
    STARTING: 'starting',       // 게임 시작 중
    PLAYING: 'playing',        // 게임 진행 중
    PAUSED: 'paused',          // 게임 일시정지
    FINISHED: 'finished'       // 게임 종료
};

/**
 * 플레이어 상태 정의
 */
const PLAYER_STATES = {
    JOINING: 'joining',         // 참가 중
    CONNECTED: 'connected',     // 연결됨
    SENSOR_READY: 'sensor_ready', // 센서 준비됨
    READY: 'ready',            // 게임 준비됨
    PLAYING: 'playing',        // 게임 중
    DISCONNECTED: 'disconnected' // 연결 끊김
};

/**
 * 플레이어 클래스
 */
class Player {
    constructor(sessionId, nickname = 'Player') {
        this.sessionId = sessionId;
        this.playerId = uuidv4();
        this.nickname = nickname;
        this.state = PLAYER_STATES.JOINING;
        
        // 연결 정보
        this.connectionId = null;
        this.sensorConnectionId = null;
        this.isHost = false;
        this.isReady = false;
        this.hasSensor = false;
        
        // 게임 데이터
        this.score = 0;
        this.position = { x: 0, y: 0 };
        this.gameData = {};
        
        // 메타데이터
        this.joinedAt = new Date();
        this.lastActivity = new Date();
        this.lastSensorData = null;
        
        // 통계
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            sensorDataReceived: 0,
            gameEventsTriggered: 0
        };
    }
    
    /**
     * 센서 연결
     */
    connectSensor(sensorConnectionId) {
        this.sensorConnectionId = sensorConnectionId;
        this.hasSensor = true;
        this.state = PLAYER_STATES.SENSOR_READY;
        this.updateActivity();
    }
    
    /**
     * 센서 연결 해제
     */
    disconnectSensor() {
        this.sensorConnectionId = null;
        this.hasSensor = false;
        this.lastSensorData = null;
        
        if (this.state === PLAYER_STATES.SENSOR_READY || this.state === PLAYER_STATES.READY) {
            this.state = PLAYER_STATES.CONNECTED;
        }
        
        this.updateActivity();
    }
    
    /**
     * 센서 데이터 업데이트
     */
    updateSensorData(data) {
        this.lastSensorData = {
            ...data,
            timestamp: Date.now()
        };
        this.stats.sensorDataReceived++;
        this.updateActivity();
    }
    
    /**
     * 게임 준비 상태 설정
     */
    setReady(isReady = true) {
        this.isReady = isReady;
        
        if (isReady && this.hasSensor) {
            this.state = PLAYER_STATES.READY;
        } else if (this.hasSensor) {
            this.state = PLAYER_STATES.SENSOR_READY;
        } else {
            this.state = PLAYER_STATES.CONNECTED;
        }
        
        this.updateActivity();
    }
    
    /**
     * 활동 시간 업데이트
     */
    updateActivity() {
        this.lastActivity = new Date();
    }
    
    /**
     * 플레이어 정보 반환
     */
    getInfo() {
        return {
            sessionId: this.sessionId,
            playerId: this.playerId,
            nickname: this.nickname,
            state: this.state,
            isHost: this.isHost,
            isReady: this.isReady,
            hasSensor: this.hasSensor,
            score: this.score,
            position: this.position,
            joinedAt: this.joinedAt,
            lastActivity: this.lastActivity,
            stats: { ...this.stats }
        };
    }
    
    /**
     * 플레이어가 비활성인지 확인
     */
    isInactive(timeoutMs = 5 * 60 * 1000) { // 기본 5분
        return Date.now() - this.lastActivity.getTime() > timeoutMs;
    }
}

/**
 * 게임 룸 클래스
 */
class GameRoom {
    constructor(roomId, gameId, hostSessionId, options = {}) {
        this.roomId = roomId;
        this.gameId = gameId;
        this.hostSessionId = hostSessionId;
        this.state = ROOM_STATES.WAITING;
        
        // 설정
        this.maxPlayers = options.maxPlayers || 10;
        this.isPrivate = options.isPrivate || false;
        this.password = options.password || null;
        this.gameConfig = options.gameConfig || {};
        
        // 플레이어 관리
        this.players = new Map(); // sessionId -> Player
        this.spectators = new Map(); // sessionId -> spectator info
        
        // 게임 상태
        this.gameData = {};
        this.gameStartedAt = null;
        this.gameEndedAt = null;
        
        // 메타데이터
        this.createdAt = new Date();
        this.lastActivity = new Date();
        
        // 통계
        this.stats = {
            totalPlayers: 0,
            gamesPlayed: 0,
            totalGameTime: 0
        };
    }
    
    /**
     * 플레이어 추가
     */
    addPlayer(sessionId, nickname, isHost = false) {
        // 최대 플레이어 수 확인
        if (this.players.size >= this.maxPlayers) {
            throw new Error('룸이 가득참');
        }
        
        // 이미 존재하는 플레이어 확인
        if (this.players.has(sessionId)) {
            throw new Error('이미 룸에 참가한 플레이어');
        }
        
        // 플레이어 생성
        const player = new Player(sessionId, nickname);
        player.isHost = isHost;
        
        // 첫 번째 플레이어가 호스트인 경우
        if (this.players.size === 0 && !isHost) {
            player.isHost = true;
            this.hostSessionId = sessionId;
        }
        
        // 플레이어 추가
        this.players.set(sessionId, player);
        this.stats.totalPlayers++;
        this.updateActivity();
        
        // 상태 업데이트
        this.updateRoomState();
        
        return player;
    }
    
    /**
     * 플레이어 제거
     */
    removePlayer(sessionId) {
        const player = this.players.get(sessionId);
        if (!player) {
            return null;
        }
        
        // 플레이어 제거
        this.players.delete(sessionId);
        this.updateActivity();
        
        // 호스트가 나간 경우 새 호스트 지정
        if (sessionId === this.hostSessionId && this.players.size > 0) {
            const newHost = Array.from(this.players.values())[0];
            newHost.isHost = true;
            this.hostSessionId = newHost.sessionId;
        }
        
        // 상태 업데이트
        this.updateRoomState();
        
        return player;
    }
    
    /**
     * 플레이어 찾기
     */
    getPlayer(sessionId) {
        return this.players.get(sessionId) || null;
    }
    
    /**
     * 호스트 플레이어 반환
     */
    getHost() {
        return this.players.get(this.hostSessionId) || null;
    }
    
    /**
     * 플레이어 센서 연결
     */
    connectPlayerSensor(sessionId, sensorConnectionId) {
        const player = this.getPlayer(sessionId);
        if (!player) {
            throw new Error('플레이어를 찾을 수 없음');
        }
        
        player.connectSensor(sensorConnectionId);
        this.updateActivity();
        
        // 상태 업데이트
        this.updateRoomState();
        
        return player;
    }
    
    /**
     * 플레이어 센서 연결 해제
     */
    disconnectPlayerSensor(sessionId) {
        const player = this.getPlayer(sessionId);
        if (!player) {
            return false;
        }
        
        player.disconnectSensor();
        this.updateActivity();
        
        // 상태 업데이트
        this.updateRoomState();
        
        return true;
    }
    
    /**
     * 룸 상태 자동 업데이트
     */
    updateRoomState() {
        const oldState = this.state;
        
        // 빈 룸
        if (this.players.size === 0) {
            this.state = ROOM_STATES.FINISHED;
            return;
        }
        
        // 게임 중이 아닌 경우에만 상태 체크
        if (this.state === ROOM_STATES.WAITING || this.state === ROOM_STATES.READY) {
            const allPlayersReady = this.areAllPlayersReady();
            
            if (allPlayersReady && this.players.size >= 2) {
                this.state = ROOM_STATES.READY;
            } else {
                this.state = ROOM_STATES.WAITING;
            }
        }
        
        // 상태 변경 이벤트
        if (oldState !== this.state) {
            this.onStateChanged(oldState, this.state);
        }
    }
    
    /**
     * 모든 플레이어가 준비되었는지 확인
     */
    areAllPlayersReady() {
        if (this.players.size < 2) {
            return false;
        }
        
        for (const player of this.players.values()) {
            if (!player.hasSensor || !player.isReady) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 게임 시작
     */
    startGame() {
        if (this.state !== ROOM_STATES.READY) {
            throw new Error(`게임을 시작할 수 없는 상태: ${this.state}`);
        }
        
        if (!this.areAllPlayersReady()) {
            throw new Error('모든 플레이어가 준비되지 않음');
        }
        
        this.state = ROOM_STATES.STARTING;
        this.gameStartedAt = new Date();
        this.stats.gamesPlayed++;
        
        // 모든 플레이어 상태를 PLAYING으로 변경
        for (const player of this.players.values()) {
            player.state = PLAYER_STATES.PLAYING;
        }
        
        this.updateActivity();
        
        // 게임 시작 후 PLAYING 상태로 전환
        setTimeout(() => {
            if (this.state === ROOM_STATES.STARTING) {
                this.state = ROOM_STATES.PLAYING;
            }
        }, 1000);
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        if (this.state !== ROOM_STATES.PLAYING && this.state !== ROOM_STATES.PAUSED) {
            throw new Error(`게임을 종료할 수 없는 상태: ${this.state}`);
        }
        
        this.gameEndedAt = new Date();
        
        if (this.gameStartedAt) {
            this.stats.totalGameTime += this.gameEndedAt.getTime() - this.gameStartedAt.getTime();
        }
        
        // 플레이어들을 대기 상태로 되돌림
        for (const player of this.players.values()) {
            if (player.hasSensor) {
                player.state = PLAYER_STATES.SENSOR_READY;
            } else {
                player.state = PLAYER_STATES.CONNECTED;
            }
            player.isReady = false;
        }
        
        this.state = ROOM_STATES.WAITING;
        this.updateActivity();
        
        // 자동으로 다시 상태 체크
        this.updateRoomState();
    }
    
    /**
     * 게임 일시정지
     */
    pauseGame() {
        if (this.state !== ROOM_STATES.PLAYING) {
            throw new Error(`게임을 일시정지할 수 없는 상태: ${this.state}`);
        }
        
        this.state = ROOM_STATES.PAUSED;
        this.updateActivity();
    }
    
    /**
     * 게임 재개
     */
    resumeGame() {
        if (this.state !== ROOM_STATES.PAUSED) {
            throw new Error(`게임을 재개할 수 없는 상태: ${this.state}`);
        }
        
        this.state = ROOM_STATES.PLAYING;
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
     * 룸 정보 반환
     */
    getInfo() {
        const players = Array.from(this.players.values()).map(p => p.getInfo());
        
        return {
            roomId: this.roomId,
            gameId: this.gameId,
            state: this.state,
            hostSessionId: this.hostSessionId,
            playerCount: this.players.size,
            maxPlayers: this.maxPlayers,
            isPrivate: this.isPrivate,
            players,
            canStart: this.state === ROOM_STATES.READY,
            isPlaying: this.state === ROOM_STATES.PLAYING,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity,
            gameStartedAt: this.gameStartedAt,
            gameEndedAt: this.gameEndedAt,
            stats: { ...this.stats }
        };
    }
    
    /**
     * 룸이 비어있는지 확인
     */
    isEmpty() {
        return this.players.size === 0;
    }
    
    /**
     * 룸이 만료되었는지 확인
     */
    isExpired(timeoutMs = 30 * 60 * 1000) { // 기본 30분
        return Date.now() - this.lastActivity.getTime() > timeoutMs;
    }
}

/**
 * 게임 상태 관리자 클래스
 */
class GameStateManager extends EventEmitter {
    constructor() {
        super();
        
        this.logger = new Logger('GameStateManager');
        this.rooms = new Map(); // roomId -> GameRoom
        
        // 설정
        this.maxRooms = 100;
        this.roomTimeout = 30 * 60 * 1000; // 30분
        this.playerTimeout = 5 * 60 * 1000; // 5분
        
        this.logger.info('게임 상태 관리자 초기화 완료');
    }
    
    /**
     * 새 룸 생성
     */
    async createRoom(gameId, hostSessionId, options = {}) {
        try {
            // 최대 룸 수 확인
            if (this.rooms.size >= this.maxRooms) {
                throw new Error('최대 룸 수 초과');
            }
            
            // 룸 ID 생성
            const roomId = this.generateRoomId();
            
            // 룸 생성
            const room = new GameRoom(roomId, gameId, hostSessionId, options);
            
            // 호스트 플레이어 추가
            room.addPlayer(hostSessionId, options.hostNickname || 'Host', true);
            
            // 등록
            this.rooms.set(roomId, room);
            
            this.logger.info('새 룸 생성', {
                roomId,
                gameId,
                hostSessionId,
                maxPlayers: room.maxPlayers
            });
            
            this.emit('room:created', room);
            
            return room;
            
        } catch (error) {
            this.logger.error('룸 생성 실패', {
                gameId,
                hostSessionId,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 룸 ID 생성
     */
    generateRoomId() {
        let attempts = 0;
        const maxAttempts = 1000;
        
        while (attempts < maxAttempts) {
            const roomId = Math.random().toString(36).substr(2, 8).toUpperCase();
            
            if (!this.rooms.has(roomId)) {
                return roomId;
            }
            
            attempts++;
        }
        
        throw new Error('사용 가능한 룸 ID를 생성할 수 없습니다');
    }
    
    /**
     * 룸 찾기
     */
    getRoom(roomId) {
        return this.rooms.get(roomId) || null;
    }
    
    /**
     * 플레이어를 룸에 추가
     */
    async addPlayerToRoom(roomId, sessionId, nickname) {
        try {
            const room = this.getRoom(roomId);
            if (!room) {
                throw new Error(`룸을 찾을 수 없습니다: ${roomId}`);
            }
            
            const player = room.addPlayer(sessionId, nickname);
            
            this.logger.info('플레이어 룸 참가', {
                roomId,
                sessionId,
                nickname,
                playerCount: room.players.size
            });
            
            this.emit('player:joined', { room, player });
            
            return { room, player };
            
        } catch (error) {
            this.logger.error('플레이어 룸 참가 실패', {
                roomId,
                sessionId,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 룸에서 플레이어 제거
     */
    async removePlayerFromRoom(roomId, sessionId) {
        try {
            const room = this.getRoom(roomId);
            if (!room) {
                return null;
            }
            
            const player = room.removePlayer(sessionId);
            if (!player) {
                return null;
            }
            
            this.logger.info('플레이어 룸 퇴장', {
                roomId,
                sessionId,
                playerCount: room.players.size
            });
            
            this.emit('player:left', { room, player });
            
            // 빈 룸 정리
            if (room.isEmpty()) {
                await this.removeRoom(roomId);
            }
            
            return { room, player };
            
        } catch (error) {
            this.logger.error('플레이어 룸 퇴장 실패', {
                roomId,
                sessionId,
                error: error.message
            });
            return null;
        }
    }
    
    /**
     * 룸 제거
     */
    async removeRoom(roomId) {
        try {
            const room = this.rooms.get(roomId);
            if (!room) {
                return false;
            }
            
            this.rooms.delete(roomId);
            
            this.logger.info('룸 제거 완료', {
                roomId,
                gameId: room.gameId,
                playerCount: room.players.size
            });
            
            this.emit('room:removed', room);
            
            return true;
            
        } catch (error) {
            this.logger.error('룸 제거 실패', {
                roomId,
                error: error.message
            });
            return false;
        }
    }
    
    /**
     * 세션 ID로 룸 찾기
     */
    findRoomBySession(sessionId) {
        for (const room of this.rooms.values()) {
            if (room.players.has(sessionId)) {
                return room;
            }
        }
        return null;
    }
    
    /**
     * 정리 작업 수행
     */
    async cleanup() {
        let cleaned = 0;
        
        try {
            // 만료된 룸 정리
            for (const [roomId, room] of this.rooms) {
                if (room.isExpired(this.roomTimeout) || room.isEmpty()) {
                    await this.removeRoom(roomId);
                    cleaned++;
                    continue;
                }
                
                // 비활성 플레이어 정리
                const inactivePlayers = [];
                for (const [sessionId, player] of room.players) {
                    if (player.isInactive(this.playerTimeout)) {
                        inactivePlayers.push(sessionId);
                    }
                }
                
                for (const sessionId of inactivePlayers) {
                    await this.removePlayerFromRoom(roomId, sessionId);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                this.logger.info('게임 상태 정리 완료', {
                    cleanedItems: cleaned,
                    activeRooms: this.rooms.size
                });
            }
            
        } catch (error) {
            this.logger.error('게임 상태 정리 실패', { error: error.message });
        }
        
        return cleaned;
    }
    
    /**
     * 활성 룸 수 반환
     */
    getActiveRoomCount() {
        return this.rooms.size;
    }
    
    /**
     * 모든 룸 정보 반환
     */
    getAllRooms() {
        const rooms = [];
        for (const room of this.rooms.values()) {
            rooms.push(room.getInfo());
        }
        return rooms;
    }
    
    /**
     * 통계 정보 반환
     */
    getStats() {
        const rooms = Array.from(this.rooms.values());
        const totalPlayers = rooms.reduce((sum, room) => sum + room.players.size, 0);
        
        return {
            activeRooms: this.rooms.size,
            totalPlayers,
            roomsByState: {
                waiting: rooms.filter(r => r.state === ROOM_STATES.WAITING).length,
                ready: rooms.filter(r => r.state === ROOM_STATES.READY).length,
                playing: rooms.filter(r => r.state === ROOM_STATES.PLAYING).length,
                finished: rooms.filter(r => r.state === ROOM_STATES.FINISHED).length
            },
            averagePlayersPerRoom: totalPlayers / Math.max(this.rooms.size, 1)
        };
    }
    
    /**
     * 서비스 종료
     */
    async shutdown() {
        this.logger.info('게임 상태 관리자 종료 시작...');
        
        // 모든 룸 정리
        const roomIds = Array.from(this.rooms.keys());
        for (const roomId of roomIds) {
            await this.removeRoom(roomId);
        }
        
        this.logger.info('게임 상태 관리자 종료 완료');
    }
}

module.exports = {
    GameStateManager,
    GameRoom,
    Player,
    ROOM_STATES,
    PLAYER_STATES
};
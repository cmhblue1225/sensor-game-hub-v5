/**
 * 🎮 Sensor Game SDK v5.0
 * 
 * 센서 기반 게임을 쉽게 개발할 수 있는 통합 SDK
 * 
 * 주요 기능:
 * - 센서 데이터 수신 및 처리
 * - 게임 상태 관리  
 * - 멀티플레이어 지원
 * - 이벤트 기반 시스템
 * - 간단한 API
 * 
 * 사용법:
 * ```javascript
 * class MyGame extends SensorGameSDK {
 *   constructor() {
 *     super({
 *       gameId: 'my-game',
 *       gameName: '내 게임',
 *       gameType: 'solo' // 'solo', 'multiplayer', 'dual'
 *     });
 *   }
 *   
 *   onSensorData(data) {
 *     // 센서 데이터 처리
 *   }
 *   
 *   onGameStart() {
 *     // 게임 시작 로직
 *   }
 * }
 * ```
 */

class SensorGameSDK {
    /**
     * SDK 생성자
     * @param {Object} config - 게임 설정
     * @param {string} config.gameId - 게임 ID
     * @param {string} config.gameName - 게임 이름
     * @param {string} config.gameType - 게임 타입 ('solo', 'multiplayer', 'dual')
     * @param {Array} config.sensorTypes - 사용할 센서 타입들 ['orientation', 'accelerometer', 'gyroscope']
     * @param {Object} config.sensorConfig - 센서 설정
     * @param {Object} config.multiplayerConfig - 멀티플레이어 설정
     */
    constructor(config = {}) {
        // 기본 설정
        this.config = {
            gameId: config.gameId || 'unknown-game',
            gameName: config.gameName || 'Unknown Game',
            gameType: config.gameType || 'solo', // 'solo', 'multiplayer', 'dual'
            sensorTypes: config.sensorTypes || ['orientation', 'accelerometer', 'gyroscope'],
            sensorConfig: {
                smoothing: config.sensorConfig?.smoothing || 0.8,
                sensitivity: config.sensorConfig?.sensitivity || 1.0,
                deadzone: config.sensorConfig?.deadzone || 0.1,
                ...config.sensorConfig
            },
            multiplayerConfig: {
                maxPlayers: config.multiplayerConfig?.maxPlayers || 4,
                autoStart: config.multiplayerConfig?.autoStart || false,
                ...config.multiplayerConfig
            }
        };
        
        // 상태 관리
        this.state = {
            isInitialized: false,
            isConnected: false,
            gameStatus: 'waiting', // 'waiting', 'playing', 'paused', 'ended'
            sessionCode: null,
            sessionId: null,
            roomId: null,
            isHost: false,
            sensorConnected: false,
            sensorData: {
                orientation: { alpha: 0, beta: 0, gamma: 0 },
                accelerometer: { x: 0, y: 0, z: 0 },
                gyroscope: { x: 0, y: 0, z: 0 }
            },
            processedSensorData: {
                tilt: { x: 0, y: 0 },
                movement: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                shake: { detected: false, intensity: 0 }
            }
        };
        
        // 이벤트 시스템
        this.events = new Map();
        
        // 센서 데이터 처리기
        this.sensorProcessor = new SensorDataProcessor(this.config.sensorConfig);
        
        // 멀티플레이어 관리자
        if (this.config.gameType === 'multiplayer') {
            this.multiplayerManager = new MultiplayerManager(this);
        }
        
        // WebSocket 연결
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        console.log(`🎮 Sensor Game SDK 초기화: ${this.config.gameName} (${this.config.gameType})`);
        
        // 자동 초기화
        this.init();
    }
    
    /**
     * SDK 초기화
     */
    async init() {
        try {
            console.log('🔧 SDK 초기화 시작...');
            
            // WebSocket 연결
            await this.connect();
            
            // 게임별 초기화 호출
            if (typeof this.onInit === 'function') {
                await this.onInit();
            }
            
            this.state.isInitialized = true;
            console.log('✅ SDK 초기화 완료');
            
            this.emit('ready');
            
        } catch (error) {
            console.error('❌ SDK 초기화 실패:', error);
            this.emit('error', { message: 'SDK 초기화 실패', error });
        }
    }
    
    /**
     * WebSocket 연결
     */
    async connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;
            
            console.log(`🔗 서버 연결 시도: ${wsUrl}`);
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('✅ 서버 연결 성공');
                this.state.isConnected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
                resolve();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (error) {
                    console.error('❌ 메시지 파싱 오류:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('🔌 서버 연결 종료');
                this.state.isConnected = false;
                this.emit('disconnected');
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 오류:', error);
                this.emit('error', { message: '연결 오류', error });
                reject(error);
            };
        });
    }
    
    /**
     * 재연결 시도
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ 최대 재연결 시도 횟수 초과');
            this.emit('error', { message: '서버 연결을 복구할 수 없습니다' });
            return;
        }
        
        this.reconnectAttempts++;
        const delay = 2000 * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts} (${delay}ms 후)`);
        
        setTimeout(() => {
            this.connect().catch(() => {
                // 재연결 실패는 onclose에서 처리됨
            });
        }, delay);
    }
    
    /**
     * 서버 메시지 처리
     */
    handleServerMessage(message) {
        console.log('📨 서버 메시지:', message.type);
        
        switch (message.type) {
            case 'connected':
                this.handleConnected(message);
                break;
            case 'session_created':
                this.handleSessionCreated(message);
                break;
            case 'session_matched':
                this.handleSessionMatched(message);
                break;
            case 'sensor_data':
                this.handleSensorData(message);
                break;
            case 'room_created':
                this.handleRoomCreated(message);
                break;
            case 'room_joined':
                this.handleRoomJoined(message);
                break;
            case 'player_joined':
                this.handlePlayerJoined(message);
                break;
            case 'player_left':
                this.handlePlayerLeft(message);
                break;
            case 'game_started':
                this.handleGameStarted(message);
                break;
            case 'game_event':
                this.handleGameEvent(message);
                break;
            case 'error':
                this.handleError(message);
                break;
            default:
                console.warn('⚠️ 알 수 없는 메시지 타입:', message.type);
        }
    }
    
    /**
     * 연결 확인 처리
     */
    handleConnected(message) {
        console.log('✅ 서버 연결 확인');
        this.emit('server_connected');
    }
    
    /**
     * 세션 생성 처리
     */
    handleSessionCreated(message) {
        this.state.sessionCode = message.sessionCode;
        this.state.sessionId = message.sessionId;
        
        console.log('🔑 세션 생성됨:', this.state.sessionCode);
        this.emit('session_created', {
            sessionCode: this.state.sessionCode,
            sessionId: this.state.sessionId
        });
    }
    
    /**
     * 센서 연결 처리
     */
    handleSessionMatched(message) {
        this.state.sensorConnected = true;
        
        console.log('📱 센서 연결됨');
        this.emit('sensor_connected', {
            sensorId: message.sensorId,
            sensorCount: message.sensorCount
        });
        
        // 게임별 센서 연결 콜백
        if (typeof this.onSensorConnected === 'function') {
            this.onSensorConnected(message);
        }
    }
    
    /**
     * 센서 데이터 처리
     */
    handleSensorData(message) {
        // 원시 센서 데이터 저장
        this.state.sensorData = message.data;
        
        // 센서 데이터 처리 및 변환
        this.state.processedSensorData = this.sensorProcessor.process(message.data);
        
        // 게임별 센서 데이터 콜백
        if (typeof this.onSensorData === 'function') {
            this.onSensorData(this.state.processedSensorData, this.state.sensorData);
        }
        
        this.emit('sensor_data', {
            processed: this.state.processedSensorData,
            raw: this.state.sensorData,
            sensorId: message.sensorId
        });
    }
    
    /**
     * 룸 생성 처리
     */
    handleRoomCreated(message) {
        this.state.roomId = message.roomId;
        this.state.isHost = true;
        
        console.log('🏠 룸 생성됨:', this.state.roomId);
        this.emit('room_created', { roomId: this.state.roomId });
        
        if (typeof this.onRoomCreated === 'function') {
            this.onRoomCreated(message);
        }
    }
    
    /**
     * 룸 참가 처리
     */
    handleRoomJoined(message) {
        this.state.roomId = message.roomId;
        this.state.isHost = false;
        
        console.log('👥 룸 참가됨:', this.state.roomId);
        this.emit('room_joined', { roomId: this.state.roomId });
        
        if (typeof this.onRoomJoined === 'function') {
            this.onRoomJoined(message);
        }
    }
    
    /**
     * 플레이어 참가 처리
     */
    handlePlayerJoined(message) {
        console.log('👤 플레이어 참가:', message.player.nickname);
        this.emit('player_joined', message);
        
        if (typeof this.onPlayerJoined === 'function') {
            this.onPlayerJoined(message);
        }
    }
    
    /**
     * 플레이어 퇴장 처리
     */
    handlePlayerLeft(message) {
        console.log('👤 플레이어 퇴장');
        this.emit('player_left', message);
        
        if (typeof this.onPlayerLeft === 'function') {
            this.onPlayerLeft(message);
        }
    }
    
    /**
     * 게임 시작 처리
     */
    handleGameStarted(message) {
        this.state.gameStatus = 'playing';
        
        console.log('🎮 게임 시작!');
        this.emit('game_started', message);
        
        if (typeof this.onGameStart === 'function') {
            this.onGameStart(message);
        }
    }
    
    /**
     * 게임 이벤트 처리
     */
    handleGameEvent(message) {
        this.emit('game_event', message);
        
        if (typeof this.onGameEvent === 'function') {
            this.onGameEvent(message);
        }
    }
    
    /**
     * 오류 처리
     */
    handleError(message) {
        console.error('❌ 서버 오류:', message.error);
        this.emit('error', message);
        
        if (typeof this.onError === 'function') {
            this.onError(message);
        }
    }
    
    // ========== 공개 API 메서드들 ==========
    
    /**
     * 세션 생성 (PC에서 호출)
     */
    createSession() {
        if (!this.state.isConnected) {
            throw new Error('서버에 연결되지 않음');
        }
        
        this.send({
            type: 'create_session',
            gameMode: this.config.gameType
        });
    }
    
    /**
     * 룸 생성 (멀티플레이어 게임)
     */
    createRoom(roomName = null) {
        if (this.config.gameType !== 'multiplayer') {
            throw new Error('멀티플레이어 게임이 아님');
        }
        
        if (!this.state.sessionCode) {
            throw new Error('세션이 생성되지 않음');
        }
        
        this.send({
            type: 'create_room',
            gameId: this.config.gameId,
            roomName: roomName || `${this.config.gameName} 룸`,
            maxPlayers: this.config.multiplayerConfig.maxPlayers
        });
    }
    
    /**
     * 룸 참가 (멀티플레이어 게임)
     */
    joinRoom(roomId, nickname = 'Player') {
        if (this.config.gameType !== 'multiplayer') {
            throw new Error('멀티플레이어 게임이 아님');
        }
        
        this.send({
            type: 'join_room',
            roomId: roomId,
            nickname: nickname
        });
    }
    
    /**
     * 게임 시작 (호스트만)
     */
    startGame() {
        if (!this.state.isHost) {
            throw new Error('호스트만 게임을 시작할 수 있음');
        }
        
        this.send({
            type: 'start_game'
        });
    }
    
    /**
     * 게임 이벤트 전송
     */
    sendGameEvent(eventType, data) {
        this.send({
            type: 'game_event',
            eventType: eventType,
            data: data
        });
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        this.state.gameStatus = 'ended';
        
        if (typeof this.onGameEnd === 'function') {
            this.onGameEnd();
        }
        
        this.emit('game_ended');
    }
    
    /**
     * 게임 일시정지
     */
    pauseGame() {
        this.state.gameStatus = 'paused';
        
        if (typeof this.onGamePause === 'function') {
            this.onGamePause();
        }
        
        this.emit('game_paused');
    }
    
    /**
     * 게임 재개
     */
    resumeGame() {
        this.state.gameStatus = 'playing';
        
        if (typeof this.onGameResume === 'function') {
            this.onGameResume();
        }
        
        this.emit('game_resumed');
    }
    
    // ========== 유틸리티 메서드들 ==========
    
    /**
     * 메시지 전송
     */
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        }
        console.warn('⚠️ WebSocket이 연결되지 않음');
        return false;
    }
    
    /**
     * 이벤트 리스너 등록
     */
    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
    }
    
    /**
     * 이벤트 리스너 제거
     */
    off(eventName, callback) {
        if (this.events.has(eventName)) {
            const callbacks = this.events.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    /**
     * 이벤트 발생
     */
    emit(eventName, data = null) {
        if (this.events.has(eventName)) {
            this.events.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ 이벤트 콜백 오류 (${eventName}):`, error);
                }
            });
        }
    }
    
    /**
     * 센서 데이터 가져오기
     */
    getSensorData() {
        return {
            raw: this.state.sensorData,
            processed: this.state.processedSensorData
        };
    }
    
    /**
     * 게임 상태 가져오기
     */
    getGameState() {
        return { ...this.state };
    }
    
    /**
     * 정리
     */
    destroy() {
        if (this.ws) {
            this.ws.close();
        }
        
        this.events.clear();
        
        if (typeof this.onDestroy === 'function') {
            this.onDestroy();
        }
        
        console.log('🗑️ SDK 정리 완료');
    }
}

/**
 * 센서 데이터 처리기
 */
class SensorDataProcessor {
    constructor(config = {}) {
        this.config = {
            smoothing: config.smoothing || 0.8,
            sensitivity: config.sensitivity || 1.0,
            deadzone: config.deadzone || 0.1,
            shakeThreshold: config.shakeThreshold || 15,
            ...config
        };
        
        // 이전 값들 (평활화용)
        this.previousValues = {
            tilt: { x: 0, y: 0 },
            movement: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
        };
        
        // 흔들기 감지용
        this.accelerationHistory = [];
        this.maxHistoryLength = 10;
    }
    
    /**
     * 센서 데이터 처리
     */
    process(rawData) {
        const processed = {
            tilt: this.processTilt(rawData.orientation),
            movement: this.processMovement(rawData.accelerometer),
            rotation: this.processRotation(rawData.gyroscope),
            shake: this.processShake(rawData.accelerometer)
        };
        
        // 평활화 적용
        processed.tilt = this.smooth(processed.tilt, this.previousValues.tilt);
        processed.movement = this.smooth(processed.movement, this.previousValues.movement);
        processed.rotation = this.smooth(processed.rotation, this.previousValues.rotation);
        
        // 데드존 적용
        processed.tilt = this.applyDeadzone(processed.tilt);
        processed.movement = this.applyDeadzone(processed.movement);
        processed.rotation = this.applyDeadzone(processed.rotation);
        
        // 이전 값 저장
        this.previousValues.tilt = { ...processed.tilt };
        this.previousValues.movement = { ...processed.movement };
        this.previousValues.rotation = { ...processed.rotation };
        
        return processed;
    }
    
    /**
     * 기울기 처리 (orientation -> tilt)
     */
    processTilt(orientation) {
        // beta: 전후 기울기 (-180 ~ 180)
        // gamma: 좌우 기울기 (-90 ~ 90)
        
        let x = (orientation.gamma || 0) / 90; // 좌우 기울기
        let y = (orientation.beta || 0) / 90; // 전후 기울기
        
        // -1 ~ 1 범위로 정규화
        x = Math.max(-1, Math.min(1, x * this.config.sensitivity));
        y = Math.max(-1, Math.min(1, y * this.config.sensitivity));
        
        return { x, y };
    }
    
    /**
     * 움직임 처리 (accelerometer -> movement)
     */
    processMovement(accelerometer) {
        const x = (accelerometer.x || 0) * this.config.sensitivity;
        const y = (accelerometer.y || 0) * this.config.sensitivity;
        const z = (accelerometer.z || 0) * this.config.sensitivity;
        
        return { x, y, z };
    }
    
    /**
     * 회전 처리 (gyroscope -> rotation)
     */
    processRotation(gyroscope) {
        const x = (gyroscope.x || 0) * this.config.sensitivity;
        const y = (gyroscope.y || 0) * this.config.sensitivity;
        const z = (gyroscope.z || 0) * this.config.sensitivity;
        
        return { x, y, z };
    }
    
    /**
     * 흔들기 감지
     */
    processShake(accelerometer) {
        // 가속도 벡터의 크기 계산
        const magnitude = Math.sqrt(
            (accelerometer.x || 0) ** 2 +
            (accelerometer.y || 0) ** 2 +
            (accelerometer.z || 0) ** 2
        );
        
        // 히스토리에 추가
        this.accelerationHistory.push(magnitude);
        if (this.accelerationHistory.length > this.maxHistoryLength) {
            this.accelerationHistory.shift();
        }
        
        // 최근 값들의 표준편차 계산
        if (this.accelerationHistory.length >= this.maxHistoryLength) {
            const average = this.accelerationHistory.reduce((a, b) => a + b) / this.accelerationHistory.length;
            const variance = this.accelerationHistory.reduce((sum, val) => sum + (val - average) ** 2, 0) / this.accelerationHistory.length;
            const stdDev = Math.sqrt(variance);
            
            const detected = stdDev > this.config.shakeThreshold;
            const intensity = Math.min(stdDev / this.config.shakeThreshold, 2.0);
            
            return { detected, intensity };
        }
        
        return { detected: false, intensity: 0 };
    }
    
    /**
     * 평활화 (Exponential Smoothing)
     */
    smooth(current, previous) {
        const alpha = 1 - this.config.smoothing;
        
        const result = {};
        for (const key in current) {
            result[key] = alpha * current[key] + this.config.smoothing * (previous[key] || 0);
        }
        
        return result;
    }
    
    /**
     * 데드존 적용
     */
    applyDeadzone(values) {
        const result = {};
        for (const key in values) {
            const value = values[key];
            if (Math.abs(value) < this.config.deadzone) {
                result[key] = 0;
            } else {
                // 데드존을 고려한 값 재조정
                const sign = value > 0 ? 1 : -1;
                result[key] = sign * (Math.abs(value) - this.config.deadzone) / (1 - this.config.deadzone);
            }
        }
        return result;
    }
}

/**
 * 멀티플레이어 관리자
 */
class MultiplayerManager {
    constructor(sdk) {
        this.sdk = sdk;
        this.players = new Map();
        this.isHost = false;
    }
    
    /**
     * 플레이어 추가
     */
    addPlayer(playerData) {
        this.players.set(playerData.sessionId, playerData);
        console.log(`👥 플레이어 추가: ${playerData.nickname}`);
    }
    
    /**
     * 플레이어 제거
     */
    removePlayer(sessionId) {
        const player = this.players.get(sessionId);
        this.players.delete(sessionId);
        console.log(`👤 플레이어 제거: ${player?.nickname || sessionId}`);
        return player;
    }
    
    /**
     * 모든 플레이어 가져오기
     */
    getPlayers() {
        return Array.from(this.players.values());
    }
    
    /**
     * 플레이어 수 가져오기
     */
    getPlayerCount() {
        return this.players.size;
    }
    
    /**
     * 호스트 여부 확인
     */
    isPlayerHost() {
        return this.isHost;
    }
}

// 전역 스코프에 SDK 클래스 등록
if (typeof window !== 'undefined') {
    window.SensorGameSDK = SensorGameSDK;
    window.SensorDataProcessor = SensorDataProcessor;
    window.MultiplayerManager = MultiplayerManager;
}

// Node.js 환경에서의 export (필요한 경우)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SensorGameSDK, SensorDataProcessor, MultiplayerManager };
}

console.log('✅ Sensor Game SDK v5.0 로드 완료');
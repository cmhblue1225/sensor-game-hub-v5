/**
 * 🎮 센서 게임 SDK v6.0
 * 
 * 모바일 센서를 활용한 게임 개발을 위한 완전한 SDK
 * - 간단한 API로 복잡한 센서 매칭 시스템 추상화
 * - 솔로/듀얼/멀티플레이어 모드 완벽 지원
 * - 자동 연결 관리 및 에러 복구
 * - 실시간 센서 데이터 처리
 */

/**
 * 게임 타입 정의
 */
const GAME_TYPES = {
    SOLO: 'solo',           // 단일 센서 게임
    DUAL: 'dual',           // 듀얼 센서 게임 
    MULTIPLAYER: 'multiplayer' // 멀티플레이어 게임
};

/**
 * SDK 상태 정의
 */
const SDK_STATES = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    SESSION_READY: 'session_ready',
    SENSORS_CONNECTING: 'sensors_connecting',
    GAME_READY: 'game_ready',
    GAME_RUNNING: 'game_running',
    ERROR: 'error'
};

/**
 * 센서 게임 SDK 메인 클래스
 */
class SensorGameSDK {
    constructor(options = {}) {
        // 기본 설정
        this.options = {
            serverUrl: options.serverUrl || 'wss://localhost:3000',
            gameId: options.gameId || 'unknown',
            gameTitle: options.gameTitle || 'Sensor Game',
            autoReconnect: options.autoReconnect !== false,
            reconnectInterval: options.reconnectInterval || 3000,
            heartbeatInterval: options.heartbeatInterval || 30000,
            enablePersistence: options.enablePersistence !== false,
            debug: options.debug || false,
            ...options
        };
        
        // 상태 관리
        this.state = SDK_STATES.DISCONNECTED;
        this.gameType = null;
        this.sessionCode = null;
        this.sessionId = null;
        this.roomId = null;
        
        // 연결 관리
        this.ws = null;
        this.isConnected = false;
        this.connectionId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // 센서 데이터
        this.sensorData = new Map(); // sensorId -> latest data
        this.sensorStatus = new Map(); // sensorId -> connection status
        this.expectedSensors = 1; // 기본값
        
        // 이벤트 핸들러
        this.eventHandlers = new Map();
        
        // 타이머
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        
        // 세션 지속성 관리
        this.persistenceManager = null;
        if (this.options.enablePersistence && typeof window !== 'undefined') {
            this.persistenceManager = this.setupPersistenceManager();
        }
        
        // 통계
        this.stats = {
            connectionsCount: 0,
            messagesReceived: 0,
            messagesSent: 0,
            sensorDataReceived: 0,
            errors: 0,
            connectionStartTime: null
        };
        
        this.log('SDK 초기화 완료', { gameId: this.options.gameId });
    }
    
    /**
     * 세션 지속성 관리자 설정
     */
    setupPersistenceManager() {
        const manager = getSessionPersistenceManager();
        
        // 복구 콜백 설정
        manager.setRecoveryCallbacks({
            onSessionRecovered: (sessionData) => {
                this.log('세션 복구됨', { sessionCode: sessionData.sessionCode });
                this.emit('sessionRecovered', sessionData);
            },
            onGameStateRestored: (gameState) => {
                this.log('게임 상태 복구됨');
                this.emit('gameStateRestored', gameState);
            }
        });
        
        // 동기화 요청 처리
        manager.on('sync_requested', (sessionData) => {
            this.syncSessionWithServer(sessionData);
        });
        
        // 다른 탭에서 세션 업데이트 시 처리
        manager.on('session_updated_by_other_tab', (sessionData) => {
            this.handleSessionUpdateFromOtherTab(sessionData);
        });
        
        return manager;
    }
    
    /**
     * 서버에 연결
     */
    async connect() {
        if (this.isConnected) {
            this.log('이미 연결되어 있습니다');
            return;
        }
        
        this.setState(SDK_STATES.CONNECTING);
        
        // 세션 복구 시도
        if (this.persistenceManager) {
            await this.attemptSessionRecovery();
        }
        
        try {
            // WebSocket 연결
            this.ws = new WebSocket(this.options.serverUrl);
            
            this.ws.onopen = () => {
                this.onConnected();
            };
            
            this.ws.onmessage = (event) => {
                this.onMessage(event);
            };
            
            this.ws.onclose = (event) => {
                this.onDisconnected(event);
            };
            
            this.ws.onerror = (error) => {
                this.onError('WebSocket 오류', error);
            };
            
        } catch (error) {
            this.onError('연결 실패', error);
            throw error;
        }
    }
    
    /**
     * 세션 복구 시도
     */
    async attemptSessionRecovery() {
        if (!this.persistenceManager) return;
        
        const recovery = await this.persistenceManager.attemptSessionRecovery(this);
        
        if (recovery.success) {
            this.log('세션 복구 성공', { sessionCode: recovery.session.sessionCode });
            
            // 복구된 상태로 설정
            this.sessionCode = recovery.session.sessionCode;
            this.sessionId = recovery.session.sessionId;
            this.gameType = recovery.session.gameType;
            this.roomId = recovery.session.roomId;
            
            if (recovery.session.sensorConnections) {
                recovery.session.sensorConnections.forEach(sensorId => {
                    this.sensorStatus.set(sensorId, 'connected');
                });
                this.expectedSensors = recovery.session.sensorConnections.length;
            }
            
            this.emit('sessionRecovered', recovery.session);
        } else {
            this.log('세션 복구 실패', { reason: recovery.reason });
        }
    }
    
    /**
     * 연결 성공 처리
     */
    onConnected() {
        this.isConnected = true;
        this.setState(SDK_STATES.CONNECTED);
        this.reconnectAttempts = 0;
        this.stats.connectionsCount++;
        
        this.log('서버 연결 성공');
        
        // 클라이언트 식별
        this.send({
            type: 'client:identify',
            clientType: 'pc',
            gameId: this.options.gameId,
            userAgent: navigator.userAgent,
            version: '6.0.0'
        });
        
        // 하트비트 시작
        this.startHeartbeat();
        
        this.emit('connected');
    }
    
    /**
     * 연결 해제 처리
     */
    onDisconnected(event) {
        this.isConnected = false;
        this.connectionId = null;
        
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        this.log('서버 연결 끊김', { code: event.code, reason: event.reason });
        
        // 자동 재연결
        if (this.options.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        } else {
            this.setState(SDK_STATES.DISCONNECTED);
            this.emit('disconnected', { code: event.code, reason: event.reason });
        }
    }
    
    /**
     * 메시지 수신 처리
     */
    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.stats.messagesReceived++;
            
            this.log('메시지 수신', { type: message.type });
            
            // 메시지 타입별 처리
            switch (message.type) {
                case 'client:identified':
                    this.onClientIdentified(message);
                    break;
                    
                case 'session:created':
                    this.onSessionCreated(message);
                    break;
                    
                case 'sensor:connected':
                    this.onSensorConnected(message);
                    break;
                    
                case 'sensor:data':
                    this.onSensorData(message);
                    break;
                    
                case 'game:started':
                    this.onGameStarted(message);
                    break;
                    
                case 'game:ended':
                    this.onGameEnded(message);
                    break;
                    
                case 'room:created':
                    this.onRoomCreated(message);
                    break;
                    
                case 'room:joined':
                    this.onRoomJoined(message);
                    break;
                    
                case 'player:joined':
                    this.onPlayerJoined(message);
                    break;
                    
                case 'player:left':
                    this.onPlayerLeft(message);
                    break;
                    
                case 'error':
                    this.onErrorMessage(message);
                    break;
                    
                case 'pong':
                    // 하트비트 응답 - 특별한 처리 없음
                    break;
                    
                default:
                    this.log('알 수 없는 메시지 타입', { type: message.type });
            }
            
            // 모든 메시지를 외부로 전달
            this.emit('message', message);
            
        } catch (error) {
            this.onError('메시지 파싱 오류', error);
        }
    }
    
    /**
     * 클라이언트 식별 완료
     */
    onClientIdentified(message) {
        this.connectionId = message.connectionId;
        this.log('클라이언트 식별 완료', { 
            connectionId: this.connectionId,
            capabilities: message.capabilities 
        });
        
        this.emit('identified', message);
    }
    
    /**
     * 세션 생성 완료
     */
    onSessionCreated(message) {
        this.sessionCode = message.sessionCode;
        this.sessionId = message.sessionId;
        this.gameType = message.gameType;
        this.expectedSensors = message.maxSensors;
        
        this.setState(SDK_STATES.SESSION_READY);
        
        // 세션 정보 저장
        if (this.persistenceManager) {
            this.persistenceManager.saveSession({
                sessionCode: this.sessionCode,
                sessionId: this.sessionId,
                gameType: this.gameType,
                expectedSensors: this.expectedSensors,
                state: this.state,
                createdAt: Date.now(),
                gameId: this.options.gameId
            });
        }
        
        this.log('세션 생성 완료', {
            sessionCode: this.sessionCode,
            gameType: this.gameType,
            maxSensors: this.expectedSensors
        });
        
        this.emit('sessionCreated', {
            sessionCode: this.sessionCode,
            sessionId: this.sessionId,
            gameType: this.gameType,
            maxSensors: this.expectedSensors
        });
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(message) {
        const { sensorId, sensorCount, isReady } = message;
        
        this.sensorStatus.set(sensorId, 'connected');
        
        // 센서 연결 정보 저장
        if (this.persistenceManager) {
            this.persistenceManager.updateSensorConnections(this.sensorStatus);
        }
        
        this.log('센서 연결됨', {
            sensorId,
            connectedCount: sensorCount,
            totalExpected: this.expectedSensors,
            isReady
        });
        
        // 상태 업데이트
        if (sensorCount > 0 && this.state === SDK_STATES.SESSION_READY) {
            this.setState(SDK_STATES.SENSORS_CONNECTING);
        }
        
        if (isReady) {
            this.setState(SDK_STATES.GAME_READY);
        }
        
        this.emit('sensorConnected', {
            sensorId,
            connectedCount: sensorCount,
            totalExpected: this.expectedSensors,
            isReady
        });
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(message) {
        const { sensorId, data, timestamp } = message;
        
        // 센서 데이터 저장
        this.sensorData.set(sensorId, {
            ...data,
            timestamp,
            receivedAt: Date.now()
        });
        
        this.stats.sensorDataReceived++;
        
        // 센서별 이벤트 발생
        this.emit('sensorData', {
            sensorId,
            data,
            timestamp
        });
        
        // 특정 센서 이벤트 발생
        this.emit(`sensor:${sensorId}`, {
            sensorId,
            data,
            timestamp
        });
    }
    
    /**
     * 게임 시작됨
     */
    onGameStarted(message) {
        this.setState(SDK_STATES.GAME_RUNNING);
        
        this.log('게임 시작됨', {
            sessionCode: message.sessionCode,
            gameType: message.gameType
        });
        
        this.emit('gameStarted', message);
    }
    
    /**
     * 게임 종료됨
     */
    onGameEnded(message) {
        this.setState(SDK_STATES.SESSION_READY);
        
        this.log('게임 종료됨', {
            sessionCode: message.sessionCode,
            reason: message.reason
        });
        
        this.emit('gameEnded', message);
    }
    
    /**
     * 룸 생성됨 (멀티플레이어)
     */
    onRoomCreated(message) {
        this.roomId = message.roomId;
        
        this.log('룸 생성됨', {
            roomId: this.roomId,
            gameId: message.gameId
        });
        
        this.emit('roomCreated', message);
    }
    
    /**
     * 룸 참가됨 (멀티플레이어)
     */
    onRoomJoined(message) {
        this.roomId = message.roomId;
        
        this.log('룸 참가됨', {
            roomId: this.roomId,
            isHost: message.isHost
        });
        
        this.emit('roomJoined', message);
    }
    
    /**
     * 플레이어 참가 (멀티플레이어)
     */
    onPlayerJoined(message) {
        this.log('플레이어 참가', {
            player: message.player.nickname,
            playerCount: message.roomInfo.playerCount
        });
        
        this.emit('playerJoined', message);
    }
    
    /**
     * 플레이어 퇴장 (멀티플레이어)
     */
    onPlayerLeft(message) {
        this.log('플레이어 퇴장', {
            player: message.player.nickname,
            playerCount: message.roomInfo.playerCount
        });
        
        this.emit('playerLeft', message);
    }
    
    /**
     * 에러 메시지 처리
     */
    onErrorMessage(message) {
        this.stats.errors++;
        
        this.log('서버 에러', {
            code: message.error.code,
            message: message.error.message
        });
        
        this.emit('serverError', message.error);
    }
    
    /**
     * 에러 처리
     */
    onError(context, error) {
        this.stats.errors++;
        
        this.log('SDK 에러', { context, error: error.message });
        
        this.setState(SDK_STATES.ERROR);
        this.emit('error', { context, error });
    }
    
    /**
     * 솔로 게임 시작
     */
    async startSoloGame(gameConfig = {}) {
        this.log('솔로 게임 시작 요청');
        
        try {
            await this.send({
                type: 'session:create',
                gameType: GAME_TYPES.SOLO,
                gameConfig
            });
            
        } catch (error) {
            this.onError('솔로 게임 시작 실패', error);
            throw error;
        }
    }
    
    /**
     * 듀얼 센서 게임 시작
     */
    async startDualGame(gameConfig = {}) {
        this.log('듀얼 센서 게임 시작 요청');
        
        try {
            await this.send({
                type: 'session:create',
                gameType: GAME_TYPES.DUAL,
                gameConfig
            });
            
        } catch (error) {
            this.onError('듀얼 센서 게임 시작 실패', error);
            throw error;
        }
    }
    
    /**
     * 멀티플레이어 룸 생성
     */
    async createMultiplayerRoom(options = {}) {
        this.log('멀티플레이어 룸 생성 요청', options);
        
        try {
            // 먼저 멀티플레이어 세션 생성
            await this.send({
                type: 'session:create',
                gameType: GAME_TYPES.MULTIPLAYER,
                gameConfig: options.gameConfig || {}
            });
            
            // 세션 생성 완료를 기다린 후 룸 생성
            await this.waitForState(SDK_STATES.SESSION_READY);
            
            await this.send({
                type: 'room:create',
                gameId: this.options.gameId,
                maxPlayers: options.maxPlayers || 10,
                isPrivate: options.isPrivate || false,
                password: options.password,
                hostNickname: options.hostNickname || 'Host'
            });
            
        } catch (error) {
            this.onError('멀티플레이어 룸 생성 실패', error);
            throw error;
        }
    }
    
    /**
     * 멀티플레이어 룸 참가
     */
    async joinMultiplayerRoom(roomId, options = {}) {
        this.log('멀티플레이어 룸 참가 요청', { roomId });
        
        try {
            // 먼저 멀티플레이어 세션 생성
            await this.send({
                type: 'session:create',
                gameType: GAME_TYPES.MULTIPLAYER,
                gameConfig: {}
            });
            
            // 세션 생성 완료를 기다린 후 룸 참가
            await this.waitForState(SDK_STATES.SESSION_READY);
            
            await this.send({
                type: 'room:join',
                roomId,
                nickname: options.nickname || 'Player',
                password: options.password
            });
            
        } catch (error) {
            this.onError('멀티플레이어 룸 참가 실패', error);
            throw error;
        }
    }
    
    /**
     * 게임 플레이 시작
     */
    async startGame() {
        this.log('게임 플레이 시작 요청');
        
        try {
            if (this.gameType === GAME_TYPES.MULTIPLAYER) {
                await this.send({
                    type: 'room:start'
                });
            } else {
                await this.send({
                    type: 'session:start'
                });
            }
            
        } catch (error) {
            this.onError('게임 시작 실패', error);
            throw error;
        }
    }
    
    /**
     * 게임 종료
     */
    async endGame(reason = 'user_ended') {
        this.log('게임 종료 요청', { reason });
        
        try {
            await this.send({
                type: 'session:end',
                reason
            });
            
        } catch (error) {
            this.onError('게임 종료 실패', error);
            throw error;
        }
    }
    
    /**
     * 센서 데이터 가져오기
     */
    getSensorData(sensorId = null) {
        if (sensorId) {
            return this.sensorData.get(sensorId) || null;
        }
        
        // 모든 센서 데이터 반환
        const allData = {};
        for (const [id, data] of this.sensorData) {
            allData[id] = data;
        }
        return allData;
    }
    
    /**
     * 연결된 센서 목록
     */
    getConnectedSensors() {
        const connected = [];
        for (const [sensorId, status] of this.sensorStatus) {
            if (status === 'connected') {
                connected.push(sensorId);
            }
        }
        return connected;
    }
    
    /**
     * 게임 준비 상태 확인
     */
    isGameReady() {
        return this.state === SDK_STATES.GAME_READY || this.state === SDK_STATES.GAME_RUNNING;
    }
    
    /**
     * 현재 세션 정보
     */
    getSessionInfo() {
        return {
            sessionCode: this.sessionCode,
            sessionId: this.sessionId,
            gameType: this.gameType,
            roomId: this.roomId,
            state: this.state,
            connectedSensors: this.getConnectedSensors().length,
            expectedSensors: this.expectedSensors,
            isReady: this.isGameReady()
        };
    }
    
    /**
     * 연결 해제
     */
    disconnect() {
        this.log('연결 해제 요청');
        
        this.options.autoReconnect = false; // 자동 재연결 비활성화
        
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close(1000, 'User disconnect');
            this.ws = null;
        }
        
        this.isConnected = false;
        this.setState(SDK_STATES.DISCONNECTED);
        
        this.emit('disconnected', { reason: 'user_disconnect' });
    }
    
    /**
     * 메시지 전송
     */
    async send(message) {
        if (!this.isConnected || !this.ws) {
            throw new Error('서버에 연결되어 있지 않습니다');
        }
        
        try {
            const data = JSON.stringify(message);
            this.ws.send(data);
            this.stats.messagesSent++;
            
            this.log('메시지 전송', { type: message.type });
            
        } catch (error) {
            this.onError('메시지 전송 실패', error);
            throw error;
        }
    }
    
    /**
     * 하트비트 시작
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.send({
                    type: 'ping',
                    timestamp: Date.now()
                }).catch(() => {
                    // Ping 실패 시 연결 문제로 간주
                    this.log('하트비트 실패 - 연결 확인 필요');
                });
            }
        }, this.options.heartbeatInterval);
    }
    
    /**
     * 재연결 스케줄링
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        const delay = this.options.reconnectInterval * this.reconnectAttempts;
        
        this.log('재연결 시도', {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            delay
        });
        
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
                this.log('재연결 실패', { error: error.message });
            });
        }, delay);
    }
    
    /**
     * 특정 상태가 될 때까지 대기
     */
    async waitForState(targetState, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (this.state === targetState) {
                resolve();
                return;
            }
            
            const timer = setTimeout(() => {
                reject(new Error(`상태 변경 타임아웃: ${targetState}`));
            }, timeout);
            
            const checkState = () => {
                if (this.state === targetState) {
                    clearTimeout(timer);
                    this.off('stateChanged', checkState);
                    resolve();
                }
            };
            
            this.on('stateChanged', checkState);
        });
    }
    
    /**
     * 상태 변경
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        
        // 상태 변경을 지속성 관리자에 저장
        if (this.persistenceManager) {
            this.persistenceManager.updateSessionState(newState, {
                previousState: oldState,
                stateChangedAt: Date.now()
            });
        }
        
        this.log('상태 변경', { from: oldState, to: newState });
        
        this.emit('stateChanged', {
            from: oldState,
            to: newState,
            timestamp: Date.now()
        });
    }
    
    /**
     * 페이지 이동 전 세션 보존
     */
    preserveSessionForNavigation(additionalData = {}) {
        if (!this.persistenceManager) return false;
        
        const currentGameState = this.getCurrentGameState();
        
        return this.persistenceManager.preserveForNavigation({
            ...additionalData,
            currentGameState,
            sensorData: Object.fromEntries(this.sensorData),
            sensorStatus: Object.fromEntries(this.sensorStatus),
            isConnected: this.isConnected,
            connectionId: this.connectionId
        });
    }
    
    /**
     * 페이지 이동 후 세션 복원
     */
    restoreSessionFromNavigation() {
        if (!this.persistenceManager) return null;
        
        const restored = this.persistenceManager.restoreFromNavigation();
        if (!restored) return null;
        
        // 복원된 데이터로 상태 설정
        this.sessionCode = restored.sessionCode;
        this.sessionId = restored.sessionId;
        this.gameType = restored.gameType;
        this.roomId = restored.roomId;
        this.state = restored.state;
        
        // 센서 데이터 복원
        if (restored.sensorData) {
            this.sensorData = new Map(Object.entries(restored.sensorData));
        }
        
        if (restored.sensorStatus) {
            this.sensorStatus = new Map(Object.entries(restored.sensorStatus));
        }
        
        // 게임 상태 복원
        if (restored.currentGameState) {
            this.emit('gameStateRestored', restored.currentGameState);
        }
        
        this.log('세션 복원 완료', { sessionCode: this.sessionCode });
        this.emit('sessionRestored', restored);
        
        return restored;
    }
    
    /**
     * 현재 게임 상태 수집
     */
    getCurrentGameState() {
        // 서브클래스에서 오버라이드 또는 게임별 상태 수집
        return {
            sessionInfo: this.getSessionInfo(),
            sensorData: Object.fromEntries(this.sensorData),
            timestamp: Date.now()
        };
    }
    
    /**
     * 서버와 세션 동기화
     */
    async syncSessionWithServer(sessionData) {
        if (!this.isConnected) return;
        
        try {
            await this.send({
                type: 'session:sync',
                sessionCode: sessionData.sessionCode,
                sessionId: sessionData.sessionId,
                clientState: this.state,
                lastActivity: sessionData.lastUpdated
            });
        } catch (error) {
            this.log('세션 동기화 실패', { error: error.message });
        }
    }
    
    /**
     * 다른 탭에서 세션 업데이트 처리
     */
    handleSessionUpdateFromOtherTab(sessionData) {
        // 현재 세션과 다른 경우에만 업데이트
        if (this.sessionCode !== sessionData.sessionCode) {
            this.log('다른 탭에서 새 세션 감지', { 
                current: this.sessionCode,
                new: sessionData.sessionCode 
            });
            
            this.emit('sessionChangedByOtherTab', sessionData);
        }
    }
    
    /**
     * 게임 상태 저장
     */
    saveGameState(gameState) {
        if (this.persistenceManager) {
            this.persistenceManager.saveGameState(gameState);
        }
    }
    
    /**
     * 세션 종료 시 정리
     */
    async cleanupSession() {
        if (this.persistenceManager) {
            // 세션 종료 상태로 업데이트
            this.persistenceManager.updateSessionState('ended', {
                endedAt: Date.now(),
                reason: 'user_ended'
            });
            
            // 임시 데이터 정리
            this.persistenceManager.cleanup();
        }
        
        // 내부 상태 정리
        this.sessionCode = null;
        this.sessionId = null;
        this.gameType = null;
        this.roomId = null;
        this.sensorData.clear();
        this.sensorStatus.clear();
    }
    
    /**
     * 이벤트 리스너 등록
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    
    /**
     * 이벤트 리스너 제거
     */
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    /**
     * 이벤트 발생
     */
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    this.log('이벤트 핸들러 오류', {
                        event,
                        error: error.message
                    });
                }
            });
        }
    }
    
    /**
     * 통계 정보 반환
     */
    getStats() {
        return {
            ...this.stats,
            state: this.state,
            uptime: this.stats.connectionsCount > 0 ? Date.now() - this.stats.connectionStartTime : 0,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    /**
     * 로깅
     */
    log(message, data = {}) {
        if (this.options.debug) {
            console.log(`[SensorGameSDK] ${message}`, data);
        }
    }
}

// 전역 SDK 인스턴스 (편의를 위해)
let globalSDK = null;

/**
 * SDK 팩토리 함수
 */
function createSensorGameSDK(options = {}) {
    return new SensorGameSDK(options);
}

/**
 * 전역 SDK 인스턴스 생성/반환
 */
function getSensorGameSDK(options = {}) {
    if (!globalSDK) {
        globalSDK = new SensorGameSDK(options);
    }
    return globalSDK;
}

// 브라우저 환경에서 전역 객체로 등록
if (typeof window !== 'undefined') {
    window.SensorGameSDK = SensorGameSDK;
    window.createSensorGameSDK = createSensorGameSDK;
    window.getSensorGameSDK = getSensorGameSDK;
    window.GAME_TYPES = GAME_TYPES;
    window.SDK_STATES = SDK_STATES;
}

// Node.js 환경에서 모듈로 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SensorGameSDK,
        createSensorGameSDK,
        getSensorGameSDK,
        GAME_TYPES,
        SDK_STATES
    };
}
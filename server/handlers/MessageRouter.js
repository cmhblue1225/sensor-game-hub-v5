/**
 * 📬 메시지 라우팅 시스템
 * 
 * 클라이언트 메시지를 적절한 핸들러로 라우팅
 * - 메시지 타입별 라우팅
 * - 인증 및 권한 검사
 * - 에러 처리 및 복구
 * - 성능 모니터링
 */

const Logger = require('../utils/Logger');
const { CLIENT_TYPES } = require('../services/ConnectionManager');
const { GAME_TYPES } = require('../services/SessionManager');

/**
 * 메시지 타입 정의
 */
const MESSAGE_TYPES = {
    // 연결 관련
    'ping': 'handlePing',
    'pong': 'handlePong',
    'client:identify': 'handleClientIdentify',
    
    // 세션 관리
    'session:create': 'handleSessionCreate',
    'session:join': 'handleSessionJoin',
    'session:start': 'handleSessionStart',
    'session:end': 'handleSessionEnd',
    'session:validate': 'handleSessionValidate',
    'session:sync': 'handleSessionSync',
    
    // 센서 데이터
    'sensor:data': 'handleSensorData',
    'sensor:calibrate': 'handleSensorCalibrate',
    
    // 룸 관리 (멀티플레이어)
    'room:create': 'handleRoomCreate',
    'room:join': 'handleRoomJoin',
    'room:leave': 'handleRoomLeave',
    'room:start': 'handleRoomStart',
    
    // 게임 이벤트
    'game:event': 'handleGameEvent',
    'game:state': 'handleGameState',
    
    // 관리자
    'admin:status': 'handleAdminStatus',
    'admin:command': 'handleAdminCommand'
};

/**
 * 메시지 라우터 클래스
 */
class MessageRouter {
    constructor(gameServer) {
        this.gameServer = gameServer;
        this.logger = new Logger('MessageRouter');
        
        // 서비스 참조
        this.connectionManager = gameServer.connectionManager;
        this.sessionManager = gameServer.sessionManager;
        this.gameStateManager = gameServer.gameStateManager;
        
        // 통계
        this.stats = {
            totalMessages: 0,
            messagesByType: new Map(),
            errors: 0,
            processingTimes: new Map()
        };
        
        this.logger.info('메시지 라우터 초기화 완료');
    }
    
    /**
     * 메시지 라우팅
     */
    async route(connectionId, message) {
        const startTime = process.hrtime.bigint();
        
        try {
            // 통계 업데이트
            this.stats.totalMessages++;
            const typeCount = this.stats.messagesByType.get(message.type) || 0;
            this.stats.messagesByType.set(message.type, typeCount + 1);
            
            // 메시지 검증
            this.validateMessage(message);
            
            // 핸들러 찾기
            const handlerName = MESSAGE_TYPES[message.type];
            if (!handlerName || typeof this[handlerName] !== 'function') {
                throw new Error(`지원하지 않는 메시지 타입: ${message.type}`);
            }
            
            // 권한 검사
            await this.checkPermissions(connectionId, message);
            
            // 핸들러 실행
            await this[handlerName](connectionId, message);
            
            // 성능 통계 기록
            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000; // 밀리초
            
            const times = this.stats.processingTimes.get(message.type) || [];
            times.push(duration);
            if (times.length > 100) times.shift(); // 최근 100개만 유지
            this.stats.processingTimes.set(message.type, times);
            
        } catch (error) {
            this.stats.errors++;
            await this.handleError(connectionId, message, error);
        }
    }
    
    /**
     * 메시지 검증
     */
    validateMessage(message) {
        if (!message.type) {
            throw new Error('메시지 타입이 없습니다');
        }
        
        if (typeof message.type !== 'string') {
            throw new Error('메시지 타입은 문자열이어야 합니다');
        }
        
        if (message.type.length > 50) {
            throw new Error('메시지 타입이 너무 깁니다');
        }
    }
    
    /**
     * 권한 검사
     */
    async checkPermissions(connectionId, message) {
        const connection = this.connectionManager.getConnection(connectionId);
        if (!connection) {
            throw new Error('연결을 찾을 수 없습니다');
        }
        
        // 관리자 메시지는 관리자만
        if (message.type.startsWith('admin:') && connection.clientType !== CLIENT_TYPES.ADMIN) {
            throw new Error('관리자 권한이 필요합니다');
        }
        
        // 센서 데이터는 모바일 클라이언트만
        if (message.type === 'sensor:data' && connection.clientType !== CLIENT_TYPES.MOBILE) {
            throw new Error('센서 데이터는 모바일 클라이언트만 전송할 수 있습니다');
        }
        
        // 룸 관리는 PC 클라이언트만
        if (message.type.startsWith('room:') && connection.clientType !== CLIENT_TYPES.PC) {
            throw new Error('룸 관리는 PC 클라이언트만 가능합니다');
        }
    }
    
    // ========== 연결 관련 핸들러 ==========
    
    /**
     * Ping 처리
     */
    async handlePing(connectionId, message) {
        await this.connectionManager.sendToConnection(connectionId, {
            type: 'pong',
            timestamp: Date.now(),
            clientTimestamp: message.timestamp
        });
    }
    
    /**
     * Pong 처리
     */
    async handlePong(connectionId, message) {
        this.connectionManager.updateLastPong(connectionId);
    }
    
    /**
     * 클라이언트 식별
     */
    async handleClientIdentify(connectionId, message) {
        const { clientType, userAgent, version } = message;
        
        // 클라이언트 타입 검증
        if (!Object.values(CLIENT_TYPES).includes(clientType)) {
            throw new Error(`지원하지 않는 클라이언트 타입: ${clientType}`);
        }
        
        // 클라이언트 타입 설정
        this.connectionManager.setClientType(connectionId, clientType);
        
        this.logger.info('클라이언트 식별 완료', {
            connectionId,
            clientType,
            userAgent,
            version
        });
        
        // 응답 전송
        await this.connectionManager.sendToConnection(connectionId, {
            type: 'client:identified',
            clientType,
            serverVersion: '6.0.0',
            capabilities: this.getClientCapabilities(clientType)
        });
    }
    
    /**
     * 클라이언트 타입별 기능 반환
     */
    getClientCapabilities(clientType) {
        switch (clientType) {
            case CLIENT_TYPES.PC:
                return ['session_management', 'room_management', 'game_control'];
            case CLIENT_TYPES.MOBILE:
                return ['sensor_data', 'session_join'];
            case CLIENT_TYPES.ADMIN:
                return ['admin_control', 'monitoring', 'debug'];
            default:
                return [];
        }
    }
    
    // ========== 세션 관리 핸들러 ==========
    
    /**
     * 세션 생성
     */
    async handleSessionCreate(connectionId, message) {
        const { gameType, gameConfig } = message;
        
        try {
            // 게임 타입 검증
            if (!Object.values(GAME_TYPES).includes(gameType)) {
                throw new Error(`지원하지 않는 게임 타입: ${gameType}`);
            }
            
            // 세션 생성
            const session = await this.sessionManager.createSession(gameType, connectionId);
            
            // 응답 전송
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'session:created',
                sessionCode: session.sessionCode,
                sessionId: session.sessionId,
                gameType: session.gameType,
                maxSensors: session.maxSensors,
                config: gameConfig
            });
            
            this.logger.info('세션 생성 완료', {
                connectionId,
                sessionCode: session.sessionCode,
                gameType
            });
            
        } catch (error) {
            throw new Error(`세션 생성 실패: ${error.message}`);
        }
    }
    
    /**
     * 세션 참가
     */
    async handleSessionJoin(connectionId, message) {
        const { sessionCode, sensorId } = message;
        
        try {
            // 세션에 센서 연결
            const result = await this.sessionManager.connectSensorToSession(
                sessionCode, 
                connectionId, 
                sensorId
            );
            
            const { session, sensorId: finalSensorId } = result;
            
            // 센서 클라이언트에 응답
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'session:joined',
                sessionCode: session.sessionCode,
                sessionId: session.sessionId,
                sensorId: finalSensorId,
                gameType: session.gameType
            });
            
            // PC 클라이언트에 센서 연결 알림
            if (session.hostConnectionId) {
                await this.connectionManager.sendToConnection(session.hostConnectionId, {
                    type: 'sensor:connected',
                    sessionCode: session.sessionCode,
                    sensorId: finalSensorId,
                    sensorCount: session.sensorConnections.size,
                    isReady: session.isAllSensorsConnected()
                });
            }
            
            this.logger.info('세션 참가 완료', {
                connectionId,
                sessionCode,
                sensorId: finalSensorId
            });
            
        } catch (error) {
            throw new Error(`세션 참가 실패: ${error.message}`);
        }
    }
    
    /**
     * 세션 시작
     */
    async handleSessionStart(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session) {
                throw new Error('세션을 찾을 수 없습니다');
            }
            
            // 호스트 권한 확인
            if (session.hostConnectionId !== connectionId) {
                throw new Error('호스트만 게임을 시작할 수 있습니다');
            }
            
            // 게임 시작
            session.startGame();
            
            // 모든 참가자에게 게임 시작 알림
            const gameStartMessage = {
                type: 'game:started',
                sessionCode: session.sessionCode,
                gameType: session.gameType,
                startTime: Date.now()
            };
            
            // PC 클라이언트에 전송
            await this.connectionManager.sendToConnection(connectionId, gameStartMessage);
            
            // 센서 클라이언트들에 전송
            for (const sensorConnectionId of session.sensorConnections.values()) {
                await this.connectionManager.sendToConnection(sensorConnectionId, gameStartMessage);
            }
            
            this.logger.info('세션 시작 완료', {
                connectionId,
                sessionCode: session.sessionCode
            });
            
        } catch (error) {
            throw new Error(`세션 시작 실패: ${error.message}`);
        }
    }
    
    /**
     * 세션 종료
     */
    async handleSessionEnd(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session) {
                throw new Error('세션을 찾을 수 없습니다');
            }
            
            // 호스트 권한 확인
            if (session.hostConnectionId !== connectionId) {
                throw new Error('호스트만 게임을 종료할 수 있습니다');
            }
            
            // 게임 종료
            session.endGame();
            
            // 모든 참가자에게 게임 종료 알림
            const gameEndMessage = {
                type: 'game:ended',
                sessionCode: session.sessionCode,
                endTime: Date.now(),
                reason: message.reason || 'host_ended'
            };
            
            // 모든 연결에 전송
            await this.connectionManager.sendToConnection(connectionId, gameEndMessage);
            for (const sensorConnectionId of session.sensorConnections.values()) {
                await this.connectionManager.sendToConnection(sensorConnectionId, gameEndMessage);
            }
            
            this.logger.info('세션 종료 완료', {
                connectionId,
                sessionCode: session.sessionCode
            });
            
        } catch (error) {
            throw new Error(`세션 종료 실패: ${error.message}`);
        }
    }
    
    // ========== 센서 데이터 핸들러 ==========
    
    /**
     * 센서 데이터 처리
     */
    async handleSensorData(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session) {
                throw new Error('세션을 찾을 수 없습니다');
            }
            
            const sensorId = session.findSensorByConnectionId(connectionId);
            if (!sensorId) {
                throw new Error('센서를 찾을 수 없습니다');
            }
            
            // 센서 데이터 저장
            session.updateSensorData(sensorId, message.data);
            
            // PC 클라이언트에 센서 데이터 전달
            if (session.hostConnectionId) {
                await this.connectionManager.sendToConnection(session.hostConnectionId, {
                    type: 'sensor:data',
                    sessionCode: session.sessionCode,
                    sensorId,
                    data: message.data,
                    timestamp: Date.now()
                });
            }
            
            // 멀티플레이어인 경우 룸의 다른 플레이어들에게도 전달
            if (session.gameType === GAME_TYPES.MULTIPLAYER && session.roomId) {
                const room = this.gameStateManager.getRoom(session.roomId);
                if (room && room.state === 'playing') {
                    // 다른 플레이어들에게 브로드캐스트
                    for (const [playerSessionId, player] of room.players) {
                        if (playerSessionId !== session.sessionId && player.connectionId) {
                            await this.connectionManager.sendToConnection(player.connectionId, {
                                type: 'sensor:data',
                                fromSessionId: session.sessionId,
                                sensorId,
                                data: message.data,
                                timestamp: Date.now()
                            });
                        }
                    }
                }
            }
            
        } catch (error) {
            throw new Error(`센서 데이터 처리 실패: ${error.message}`);
        }
    }
    
    /**
     * 센서 캘리브레이션
     */
    async handleSensorCalibrate(connectionId, message) {
        try {
            // 캘리브레이션 데이터 저장 (구현 필요)
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'sensor:calibrated',
                success: true,
                calibrationData: message.calibrationData
            });
            
        } catch (error) {
            throw new Error(`센서 캘리브레이션 실패: ${error.message}`);
        }
    }
    
    // ========== 룸 관리 핸들러 (멀티플레이어) ==========
    
    /**
     * 룸 생성
     */
    async handleRoomCreate(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session) {
                throw new Error('세션을 찾을 수 없습니다');
            }
            
            if (session.gameType !== GAME_TYPES.MULTIPLAYER) {
                throw new Error('멀티플레이어 세션이 아닙니다');
            }
            
            const { gameId, maxPlayers, isPrivate, password } = message;
            
            // 룸 생성
            const room = await this.gameStateManager.createRoom(gameId, session.sessionId, {
                maxPlayers: maxPlayers || 10,
                isPrivate: isPrivate || false,
                password,
                hostNickname: message.hostNickname || 'Host'
            });
            
            // 세션에 룸 ID 설정
            session.roomId = room.roomId;
            
            // 응답 전송
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'room:created',
                roomId: room.roomId,
                gameId: room.gameId,
                isHost: true,
                roomInfo: room.getInfo()
            });
            
            this.logger.info('룸 생성 완료', {
                connectionId,
                roomId: room.roomId,
                gameId
            });
            
        } catch (error) {
            throw new Error(`룸 생성 실패: ${error.message}`);
        }
    }
    
    /**
     * 룸 참가
     */
    async handleRoomJoin(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session) {
                throw new Error('세션을 찾을 수 없습니다');
            }
            
            if (session.gameType !== GAME_TYPES.MULTIPLAYER) {
                throw new Error('멀티플레이어 세션이 아닙니다');
            }
            
            const { roomId, nickname, password } = message;
            
            // 룸에 플레이어 추가
            const result = await this.gameStateManager.addPlayerToRoom(roomId, session.sessionId, nickname);
            const { room, player } = result;
            
            // 세션에 룸 ID 설정
            session.roomId = room.roomId;
            
            // 참가자에게 응답
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'room:joined',
                roomId: room.roomId,
                gameId: room.gameId,
                isHost: false,
                roomInfo: room.getInfo()
            });
            
            // 다른 플레이어들에게 알림
            await this.broadcastToRoom(room, {
                type: 'player:joined',
                player: player.getInfo(),
                roomInfo: room.getInfo()
            }, session.sessionId);
            
            this.logger.info('룸 참가 완료', {
                connectionId,
                roomId,
                nickname
            });
            
        } catch (error) {
            throw new Error(`룸 참가 실패: ${error.message}`);
        }
    }
    
    /**
     * 룸 나가기
     */
    async handleRoomLeave(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session || !session.roomId) {
                throw new Error('룸에 참가하지 않았습니다');
            }
            
            const result = await this.gameStateManager.removePlayerFromRoom(session.roomId, session.sessionId);
            if (!result) {
                throw new Error('룸에서 제거할 수 없습니다');
            }
            
            const { room, player } = result;
            
            // 세션에서 룸 ID 제거
            session.roomId = null;
            
            // 떠난 플레이어에게 응답
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'room:left',
                roomId: room.roomId
            });
            
            // 남은 플레이어들에게 알림
            if (room.players.size > 0) {
                await this.broadcastToRoom(room, {
                    type: 'player:left',
                    player: player.getInfo(),
                    roomInfo: room.getInfo()
                });
            }
            
            this.logger.info('룸 나가기 완료', {
                connectionId,
                roomId: room.roomId
            });
            
        } catch (error) {
            throw new Error(`룸 나가기 실패: ${error.message}`);
        }
    }
    
    /**
     * 룸 게임 시작
     */
    async handleRoomStart(connectionId, message) {
        try {
            const session = this.sessionManager.getSessionByConnection(connectionId);
            if (!session || !session.roomId) {
                throw new Error('룸에 참가하지 않았습니다');
            }
            
            const room = this.gameStateManager.getRoom(session.roomId);
            if (!room) {
                throw new Error('룸을 찾을 수 없습니다');
            }
            
            // 호스트 권한 확인
            if (room.hostSessionId !== session.sessionId) {
                throw new Error('호스트만 게임을 시작할 수 있습니다');
            }
            
            // 게임 시작
            room.startGame();
            
            // 모든 플레이어에게 게임 시작 알림
            await this.broadcastToRoom(room, {
                type: 'game:started',
                roomId: room.roomId,
                gameId: room.gameId,
                players: Array.from(room.players.values()).map(p => p.getInfo()),
                startTime: Date.now()
            });
            
            this.logger.info('룸 게임 시작 완료', {
                connectionId,
                roomId: room.roomId,
                playerCount: room.players.size
            });
            
        } catch (error) {
            throw new Error(`룸 게임 시작 실패: ${error.message}`);
        }
    }
    
    // ========== 게임 이벤트 핸들러 ==========
    
    /**
     * 게임 이벤트 처리
     */
    async handleGameEvent(connectionId, message) {
        try {
            const { eventType, eventData } = message;
            
            // 이벤트 브로드캐스트 (구현 필요)
            this.logger.debug('게임 이벤트 수신', {
                connectionId,
                eventType,
                eventData
            });
            
        } catch (error) {
            throw new Error(`게임 이벤트 처리 실패: ${error.message}`);
        }
    }
    
    /**
     * 게임 상태 업데이트
     */
    async handleGameState(connectionId, message) {
        try {
            // 게임 상태 업데이트 로직 (구현 필요)
            
        } catch (error) {
            throw new Error(`게임 상태 업데이트 실패: ${error.message}`);
        }
    }
    
    /**
     * 세션 유효성 검증
     */
    async handleSessionValidate(connectionId, message) {
        try {
            const { sessionCode, sessionId, lastKnownState } = message;
            
            // 세션 존재 여부 확인
            const session = this.sessionManager.getSession(sessionCode);
            let isValid = false;
            let currentState = null;
            let reason = 'session_not_found';
            
            if (session) {
                // 세션 ID 일치 확인
                if (session.sessionId === sessionId) {
                    isValid = true;
                    currentState = session.state;
                    reason = 'valid';
                    
                    // 마지막 활동 시간 업데이트
                    session.updateActivity();
                    
                    this.logger.info('세션 검증 성공', {
                        connectionId,
                        sessionCode,
                        currentState
                    });
                } else {
                    reason = 'session_id_mismatch';
                }
            }
            
            // 검증 결과 전송
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'session:validation_result',
                isValid,
                sessionCode,
                currentState,
                reason,
                timestamp: Date.now()
            });
            
            if (!isValid) {
                this.logger.warn('세션 검증 실패', {
                    connectionId,
                    sessionCode,
                    reason
                });
            }
            
        } catch (error) {
            throw new Error(`세션 검증 실패: ${error.message}`);
        }
    }
    
    /**
     * 세션 동기화
     */
    async handleSessionSync(connectionId, message) {
        try {
            const { sessionCode, sessionId, clientState, lastActivity } = message;
            
            // 세션 확인
            const session = this.sessionManager.getSession(sessionCode);
            if (!session) {
                throw new Error(`세션을 찾을 수 없습니다: ${sessionCode}`);
            }
            
            if (session.sessionId !== sessionId) {
                throw new Error('세션 ID가 일치하지 않습니다');
            }
            
            // 클라이언트 상태와 서버 상태 비교
            const serverState = session.state;
            let needsSync = false;
            let syncData = {};
            
            if (clientState !== serverState) {
                needsSync = true;
                syncData.correctState = serverState;
            }
            
            // 센서 연결 정보 동기화
            if (session.sensorConnections.size > 0) {
                syncData.sensorConnections = Array.from(session.sensorConnections.keys());
                syncData.sensorCount = session.sensorConnections.size;
                syncData.isAllSensorsConnected = session.isAllSensorsConnected();
            }
            
            // 멀티플레이어 룸 정보 동기화
            if (session.roomId) {
                const room = this.gameStateManager.getRoom(session.roomId);
                if (room) {
                    syncData.roomInfo = room.getInfo();
                }
            }
            
            // 마지막 활동 시간 업데이트
            session.updateActivity();
            
            // 동기화 응답 전송
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'session:sync_result',
                sessionCode,
                needsSync,
                syncData,
                serverTimestamp: Date.now()
            });
            
            this.logger.debug('세션 동기화 완료', {
                connectionId,
                sessionCode,
                needsSync,
                clientState,
                serverState
            });
            
        } catch (error) {
            throw new Error(`세션 동기화 실패: ${error.message}`);
        }
    }
    
    // ========== 관리자 핸들러 ==========
    
    /**
     * 관리자 상태 요청
     */
    async handleAdminStatus(connectionId, message) {
        try {
            const serverStatus = this.gameServer.getStatus();
            const connectionStats = this.connectionManager.getStats();
            const sessionStats = {
                activeSessions: this.sessionManager.getActiveSessionCount(),
                allSessions: this.sessionManager.getAllSessions()
            };
            const gameStats = this.gameStateManager.getStats();
            
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'admin:status',
                server: serverStatus,
                connections: connectionStats,
                sessions: sessionStats,
                games: gameStats,
                router: this.getRouterStats()
            });
            
        } catch (error) {
            throw new Error(`관리자 상태 조회 실패: ${error.message}`);
        }
    }
    
    /**
     * 관리자 명령어 처리
     */
    async handleAdminCommand(connectionId, message) {
        try {
            const { command, params } = message;
            
            let result = null;
            
            switch (command) {
                case 'shutdown':
                    result = await this.gameServer.shutdown();
                    break;
                case 'restart':
                    // 재시작 로직 (구현 필요)
                    break;
                case 'cleanup':
                    result = {
                        sessions: await this.sessionManager.cleanup(),
                        games: await this.gameStateManager.cleanup()
                    };
                    break;
                default:
                    throw new Error(`지원하지 않는 명령어: ${command}`);
            }
            
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'admin:command_result',
                command,
                result,
                success: true
            });
            
        } catch (error) {
            throw new Error(`관리자 명령어 실행 실패: ${error.message}`);
        }
    }
    
    // ========== 유틸리티 메서드 ==========
    
    /**
     * 룸의 모든 플레이어에게 메시지 브로드캐스트
     */
    async broadcastToRoom(room, message, excludeSessionId = null) {
        const results = [];
        
        for (const [sessionId, player] of room.players) {
            if (sessionId === excludeSessionId) continue;
            
            const session = this.sessionManager.getSessionByConnection(player.connectionId);
            if (session && session.hostConnectionId) {
                try {
                    await this.connectionManager.sendToConnection(session.hostConnectionId, message);
                    results.push({ sessionId, success: true });
                } catch (error) {
                    results.push({ sessionId, success: false, error: error.message });
                }
            }
        }
        
        return results;
    }
    
    /**
     * 에러 처리
     */
    async handleError(connectionId, message, error) {
        this.logger.error('메시지 처리 오류', {
            connectionId,
            messageType: message?.type,
            error: error.message
        });
        
        try {
            await this.connectionManager.sendError(connectionId, 'MESSAGE_ERROR', error.message, {
                messageType: message?.type,
                timestamp: Date.now()
            });
        } catch (sendError) {
            this.logger.error('에러 응답 전송 실패', {
                connectionId,
                sendError: sendError.message
            });
        }
    }
    
    /**
     * 라우터 통계 반환
     */
    getRouterStats() {
        const processingTimes = {};
        for (const [type, times] of this.stats.processingTimes) {
            const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
            processingTimes[type] = {
                average: avg.toFixed(2),
                count: times.length,
                latest: times[times.length - 1]?.toFixed(2)
            };
        }
        
        return {
            totalMessages: this.stats.totalMessages,
            errors: this.stats.errors,
            errorRate: (this.stats.errors / Math.max(this.stats.totalMessages, 1) * 100).toFixed(2),
            messagesByType: Object.fromEntries(this.stats.messagesByType),
            processingTimes
        };
    }
}

module.exports = MessageRouter;
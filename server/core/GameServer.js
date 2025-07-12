/**
 * 🚀 센서 게임 허브 v6.0 - 핵심 게임 서버
 * 
 * 완전히 재설계된 고성능 게임 서버
 * - 모듈화된 아키텍처
 * - 견고한 에러 처리
 * - 실시간 상태 동기화
 * - 확장 가능한 구조
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const SessionManager = require('../services/SessionManager');
const ConnectionManager = require('../services/ConnectionManager');
const GameStateManager = require('../services/GameStateManager');
const MessageRouter = require('../handlers/MessageRouter');
const Logger = require('../utils/Logger');
const Config = require('../utils/Config');

/**
 * 메인 게임 서버 클래스
 * 모든 서버 기능을 통합 관리
 */
class GameServer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            port: config.port || 3000,
            host: config.host || '0.0.0.0',
            enableMetrics: config.enableMetrics || true,
            maxConnections: config.maxConnections || 1000,
            heartbeatInterval: config.heartbeatInterval || 30000,
            cleanupInterval: config.cleanupInterval || 60000,
            ...config
        };
        
        // 핵심 서비스 초기화
        this.logger = new Logger('GameServer');
        this.sessionManager = new SessionManager();
        this.connectionManager = new ConnectionManager(this);
        this.gameStateManager = new GameStateManager();
        this.messageRouter = new MessageRouter(this);
        
        // 서버 상태
        this.isRunning = false;
        this.startTime = null;
        this.metrics = {
            totalConnections: 0,
            activeSessions: 0,
            activeRooms: 0,
            messagesProcessed: 0,
            errorsOccurred: 0
        };
        
        // 정리 작업 타이머
        this.heartbeatTimer = null;
        this.cleanupTimer = null;
        
        this.logger.info('게임 서버 초기화 완료', { config: this.config });
    }
    
    /**
     * 서버 시작
     */
    async start() {
        try {
            this.logger.info('게임 서버 시작 중...');
            
            // WebSocket 서버 생성
            this.wss = new WebSocket.Server({
                port: this.config.port,
                host: this.config.host,
                perMessageDeflate: false,
                clientTracking: true,
                maxPayload: 16 * 1024 // 16KB max payload
            });
            
            // WebSocket 이벤트 핸들러 설정
            this.setupWebSocketHandlers();
            
            // 주기적 작업 시작
            this.startPeriodicTasks();
            
            this.isRunning = true;
            this.startTime = new Date();
            
            this.logger.info('게임 서버 시작 완료', {
                port: this.config.port,
                host: this.config.host
            });
            
            this.emit('server:started');
            
        } catch (error) {
            this.logger.error('서버 시작 실패', { error: error.message });
            throw error;
        }
    }
    
    /**
     * WebSocket 이벤트 핸들러 설정
     */
    setupWebSocketHandlers() {
        this.wss.on('connection', (ws, req) => {
            this.handleNewConnection(ws, req);
        });
        
        this.wss.on('error', (error) => {
            this.logger.error('WebSocket 서버 오류', { error: error.message });
            this.metrics.errorsOccurred++;
        });
        
        this.wss.on('listening', () => {
            this.logger.info('WebSocket 서버 리스닝 시작');
        });
    }
    
    /**
     * 새로운 클라이언트 연결 처리
     */
    async handleNewConnection(ws, req) {
        const connectionId = uuidv4();
        const clientIP = req.socket.remoteAddress;
        
        try {
            // 연결 수 제한 확인
            if (this.connectionManager.getConnectionCount() >= this.config.maxConnections) {
                this.logger.warn('최대 연결 수 초과', { connectionId, clientIP });
                ws.close(1013, 'Server overloaded');
                return;
            }
            
            // 새 연결 등록
            const connection = await this.connectionManager.addConnection(connectionId, ws, {
                ip: clientIP,
                userAgent: req.headers['user-agent'],
                connectedAt: new Date()
            });
            
            this.metrics.totalConnections++;
            
            this.logger.info('새 클라이언트 연결', {
                connectionId,
                clientIP,
                totalConnections: this.connectionManager.getConnectionCount()
            });
            
            // 연결 확인 메시지 전송
            await this.connectionManager.sendToConnection(connectionId, {
                type: 'connection:established',
                connectionId,
                serverTime: Date.now(),
                version: '6.0.0'
            });
            
            // WebSocket 이벤트 핸들러 설정
            ws.on('message', async (data) => {
                await this.handleMessage(connectionId, data);
            });
            
            ws.on('close', async (code, reason) => {
                await this.handleDisconnection(connectionId, code, reason);
            });
            
            ws.on('error', async (error) => {
                this.logger.error('WebSocket 연결 오류', {
                    connectionId,
                    error: error.message
                });
                await this.handleConnectionError(connectionId, error);
            });
            
            ws.on('pong', () => {
                this.connectionManager.updateLastPong(connectionId);
            });
            
            this.emit('connection:new', { connectionId, connection });
            
        } catch (error) {
            this.logger.error('연결 처리 실패', {
                connectionId,
                error: error.message
            });
            ws.close(1011, 'Internal server error');
        }
    }
    
    /**
     * 클라이언트 메시지 처리
     */
    async handleMessage(connectionId, data) {
        try {
            // 메시지 파싱
            const message = JSON.parse(data.toString());
            
            // 메시지 검증
            if (!this.validateMessage(message)) {
                await this.connectionManager.sendError(connectionId, 'INVALID_MESSAGE', '잘못된 메시지 형식');
                return;
            }
            
            this.metrics.messagesProcessed++;
            
            // 연결 활성화 시간 업데이트
            this.connectionManager.updateLastActivity(connectionId);
            
            this.logger.debug('메시지 수신', {
                connectionId,
                type: message.type,
                size: data.length
            });
            
            // 메시지 라우팅
            await this.messageRouter.route(connectionId, message);
            
        } catch (error) {
            this.logger.error('메시지 처리 실패', {
                connectionId,
                error: error.message
            });
            
            this.metrics.errorsOccurred++;
            await this.connectionManager.sendError(connectionId, 'MESSAGE_PROCESSING_ERROR', '메시지 처리 실패');
        }
    }
    
    /**
     * 메시지 검증
     */
    validateMessage(message) {
        return (
            message &&
            typeof message === 'object' &&
            typeof message.type === 'string' &&
            message.type.length > 0 &&
            message.type.length < 100
        );
    }
    
    /**
     * 클라이언트 연결 해제 처리
     */
    async handleDisconnection(connectionId, code, reason) {
        try {
            this.logger.info('클라이언트 연결 해제', {
                connectionId,
                code,
                reason: reason?.toString()
            });
            
            // 세션 정리
            await this.sessionManager.handleDisconnection(connectionId);
            
            // 연결 제거
            await this.connectionManager.removeConnection(connectionId);
            
            this.emit('connection:closed', { connectionId, code, reason });
            
        } catch (error) {
            this.logger.error('연결 해제 처리 실패', {
                connectionId,
                error: error.message
            });
        }
    }
    
    /**
     * 연결 오류 처리
     */
    async handleConnectionError(connectionId, error) {
        this.metrics.errorsOccurred++;
        
        // 심각한 오류인 경우 연결 강제 종료
        if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
            await this.handleDisconnection(connectionId, 1006, 'Connection error');
        }
    }
    
    /**
     * 주기적 작업 시작
     */
    startPeriodicTasks() {
        // 하트비트 (연결 상태 확인)
        this.heartbeatTimer = setInterval(() => {
            this.performHeartbeat();
        }, this.config.heartbeatInterval);
        
        // 정리 작업 (비활성 세션, 연결 정리)
        this.cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.config.cleanupInterval);
        
        this.logger.info('주기적 작업 시작', {
            heartbeatInterval: this.config.heartbeatInterval,
            cleanupInterval: this.config.cleanupInterval
        });
    }
    
    /**
     * 하트비트 수행
     */
    async performHeartbeat() {
        try {
            const connections = this.connectionManager.getAllConnections();
            const now = Date.now();
            const timeout = this.config.heartbeatInterval * 2; // 2배 시간 초과
            
            for (const [connectionId, connection] of connections) {
                // 마지막 활동으로부터 시간 초과 확인
                if (now - connection.lastActivity > timeout) {
                    this.logger.warn('비활성 연결 감지', { connectionId });
                    await this.connectionManager.closeConnection(connectionId, 1001, 'Timeout');
                    continue;
                }
                
                // ping 전송
                try {
                    connection.ws.ping();
                } catch (error) {
                    this.logger.warn('Ping 전송 실패', { connectionId, error: error.message });
                }
            }
            
        } catch (error) {
            this.logger.error('하트비트 실패', { error: error.message });
        }
    }
    
    /**
     * 정리 작업 수행
     */
    async performCleanup() {
        try {
            // 세션 정리
            const cleanedSessions = await this.sessionManager.cleanup();
            
            // 게임 상태 정리
            const cleanedGameStates = await this.gameStateManager.cleanup();
            
            // 메트릭스 업데이트
            this.metrics.activeSessions = this.sessionManager.getActiveSessionCount();
            this.metrics.activeRooms = this.gameStateManager.getActiveRoomCount();
            
            if (cleanedSessions > 0 || cleanedGameStates > 0) {
                this.logger.info('정리 작업 완료', {
                    cleanedSessions,
                    cleanedGameStates,
                    activeSessions: this.metrics.activeSessions,
                    activeRooms: this.metrics.activeRooms
                });
            }
            
        } catch (error) {
            this.logger.error('정리 작업 실패', { error: error.message });
        }
    }
    
    /**
     * 서버 상태 정보 반환
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            startTime: this.startTime,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            metrics: { ...this.metrics },
            connections: this.connectionManager.getConnectionCount(),
            memory: process.memoryUsage(),
            version: '6.0.0'
        };
    }
    
    /**
     * 서버 종료
     */
    async shutdown() {
        try {
            this.logger.info('서버 종료 시작...');
            
            this.isRunning = false;
            
            // 타이머 정리
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
            
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }
            
            // 모든 클라이언트에 종료 알림
            await this.connectionManager.broadcastShutdown();
            
            // WebSocket 서버 종료
            if (this.wss) {
                this.wss.close();
            }
            
            // 리소스 정리
            await this.sessionManager.shutdown();
            await this.gameStateManager.shutdown();
            
            this.logger.info('서버 종료 완료');
            this.emit('server:shutdown');
            
        } catch (error) {
            this.logger.error('서버 종료 실패', { error: error.message });
            throw error;
        }
    }
}

module.exports = GameServer;
/**
 * 🔗 연결 관리 서비스
 * 
 * WebSocket 연결의 생명주기를 완전 관리
 * - 연결 상태 추적
 * - 메시지 전송/수신
 * - 연결 품질 모니터링
 * - 자동 복구
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const Logger = require('../utils/Logger');

/**
 * 연결 상태 정의
 */
const CONNECTION_STATES = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    AUTHENTICATED: 'authenticated',
    ACTIVE: 'active',
    IDLE: 'idle',
    DISCONNECTING: 'disconnecting',
    DISCONNECTED: 'disconnected',
    ERROR: 'error'
};

/**
 * 클라이언트 타입 정의
 */
const CLIENT_TYPES = {
    PC: 'pc',           // PC 게임 클라이언트
    MOBILE: 'mobile',   // 모바일 센서 클라이언트
    ADMIN: 'admin',     // 관리자 클라이언트
    UNKNOWN: 'unknown'  // 미확인 클라이언트
};

/**
 * 연결 정보 클래스
 */
class Connection {
    constructor(connectionId, ws, metadata = {}) {
        this.connectionId = connectionId;
        this.ws = ws;
        this.state = CONNECTION_STATES.CONNECTED;
        this.clientType = CLIENT_TYPES.UNKNOWN;
        
        // 메타데이터
        this.ip = metadata.ip || 'unknown';
        this.userAgent = metadata.userAgent || 'unknown';
        this.connectedAt = metadata.connectedAt || new Date();
        
        // 활동 추적
        this.lastActivity = new Date();
        this.lastPing = new Date();
        this.lastPong = new Date();
        
        // 통계
        this.messagesSent = 0;
        this.messagesReceived = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.errors = 0;
        
        // 품질 메트릭
        this.latency = 0;
        this.packetLoss = 0;
        
        // 사용자 정보
        this.userId = null;
        this.sessionId = null;
        this.roomId = null;
        
        // 플래그
        this.isAuthenticated = false;
        this.isRateLimited = false;
    }
    
    /**
     * 메시지 전송
     */
    async send(message) {
        if (!this.isConnected()) {
            throw new Error(`연결이 닫혀있습니다: ${this.connectionId}`);
        }
        
        try {
            const data = JSON.stringify(message);
            this.ws.send(data);
            
            this.messagesSent++;
            this.bytesSent += data.length;
            this.updateActivity();
            
            return true;
            
        } catch (error) {
            this.errors++;
            throw new Error(`메시지 전송 실패: ${error.message}`);
        }
    }
    
    /**
     * 연결 상태 확인
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    /**
     * 활동 시간 업데이트
     */
    updateActivity() {
        this.lastActivity = new Date();
        
        // 상태 자동 업데이트
        if (this.state === CONNECTION_STATES.IDLE && this.isConnected()) {
            this.state = CONNECTION_STATES.ACTIVE;
        }
    }
    
    /**
     * Ping 시간 업데이트
     */
    updateLastPing() {
        this.lastPing = new Date();
    }
    
    /**
     * Pong 시간 업데이트 및 지연시간 계산
     */
    updateLastPong() {
        this.lastPong = new Date();
        this.latency = this.lastPong.getTime() - this.lastPing.getTime();
    }
    
    /**
     * 연결 닫기
     */
    close(code = 1000, reason = 'Normal closure') {
        if (this.isConnected()) {
            this.state = CONNECTION_STATES.DISCONNECTING;
            this.ws.close(code, reason);
        }
        this.state = CONNECTION_STATES.DISCONNECTED;
    }
    
    /**
     * 연결 정보 반환
     */
    getInfo() {
        return {
            connectionId: this.connectionId,
            state: this.state,
            clientType: this.clientType,
            ip: this.ip,
            userAgent: this.userAgent,
            connectedAt: this.connectedAt,
            lastActivity: this.lastActivity,
            uptime: Date.now() - this.connectedAt.getTime(),
            isConnected: this.isConnected(),
            isAuthenticated: this.isAuthenticated,
            stats: {
                messagesSent: this.messagesSent,
                messagesReceived: this.messagesReceived,
                bytesReceived: this.bytesReceived,
                bytesSent: this.bytesSent,
                errors: this.errors,
                latency: this.latency
            },
            session: {
                userId: this.userId,
                sessionId: this.sessionId,
                roomId: this.roomId
            }
        };
    }
}

/**
 * 연결 관리자 클래스
 */
class ConnectionManager extends EventEmitter {
    constructor(gameServer) {
        super();
        
        this.gameServer = gameServer;
        this.logger = new Logger('ConnectionManager');
        this.connections = new Map(); // connectionId -> Connection
        
        // 설정
        this.maxConnections = 1000;
        this.connectionTimeout = 30000; // 30초
        this.pingInterval = 30000; // 30초
        this.maxMessageSize = 16 * 1024; // 16KB
        this.rateLimitWindow = 60000; // 1분
        this.rateLimitMax = 100; // 분당 최대 메시지 수
        
        // 통계
        this.totalConnections = 0;
        this.totalMessages = 0;
        this.totalErrors = 0;
        
        this.logger.info('연결 관리자 초기화 완료');
    }
    
    /**
     * 새 연결 추가
     */
    async addConnection(connectionId, ws, metadata = {}) {
        try {
            // 최대 연결 수 확인
            if (this.connections.size >= this.maxConnections) {
                throw new Error('최대 연결 수 초과');
            }
            
            // 연결 객체 생성
            const connection = new Connection(connectionId, ws, metadata);
            
            // 등록
            this.connections.set(connectionId, connection);
            this.totalConnections++;
            
            this.logger.debug('새 연결 추가', {
                connectionId,
                ip: connection.ip,
                totalConnections: this.connections.size
            });
            
            this.emit('connection:added', connection);
            
            return connection;
            
        } catch (error) {
            this.logger.error('연결 추가 실패', {
                connectionId,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 연결 제거
     */
    async removeConnection(connectionId) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) {
                return false;
            }
            
            // 연결 닫기
            if (connection.isConnected()) {
                connection.close(1001, 'Connection removed');
            }
            
            // 제거
            this.connections.delete(connectionId);
            
            this.logger.debug('연결 제거 완료', {
                connectionId,
                uptime: Date.now() - connection.connectedAt.getTime(),
                totalConnections: this.connections.size
            });
            
            this.emit('connection:removed', connection);
            
            return true;
            
        } catch (error) {
            this.logger.error('연결 제거 실패', {
                connectionId,
                error: error.message
            });
            return false;
        }
    }
    
    /**
     * 연결 정보 반환
     */
    getConnection(connectionId) {
        return this.connections.get(connectionId) || null;
    }
    
    /**
     * 모든 연결 반환
     */
    getAllConnections() {
        return this.connections;
    }
    
    /**
     * 연결 수 반환
     */
    getConnectionCount() {
        return this.connections.size;
    }
    
    /**
     * 특정 연결에 메시지 전송
     */
    async sendToConnection(connectionId, message) {
        try {
            const connection = this.getConnection(connectionId);
            if (!connection) {
                throw new Error(`연결을 찾을 수 없습니다: ${connectionId}`);
            }
            
            // Rate limiting 확인
            if (this.isRateLimited(connection)) {
                throw new Error('Rate limit exceeded');
            }
            
            await connection.send(message);
            this.totalMessages++;
            
            return true;
            
        } catch (error) {
            this.logger.error('메시지 전송 실패', {
                connectionId,
                messageType: message?.type,
                error: error.message
            });
            this.totalErrors++;
            throw error;
        }
    }
    
    /**
     * 여러 연결에 메시지 브로드캐스트
     */
    async broadcastToConnections(connectionIds, message) {
        const results = [];
        
        for (const connectionId of connectionIds) {
            try {
                await this.sendToConnection(connectionId, message);
                results.push({ connectionId, success: true });
            } catch (error) {
                results.push({ 
                    connectionId, 
                    success: false, 
                    error: error.message 
                });
            }
        }
        
        return results;
    }
    
    /**
     * 모든 연결에 메시지 브로드캐스트
     */
    async broadcastToAll(message, excludeConnectionIds = []) {
        const connectionIds = Array.from(this.connections.keys())
            .filter(id => !excludeConnectionIds.includes(id));
        
        return this.broadcastToConnections(connectionIds, message);
    }
    
    /**
     * 클라이언트 타입별 브로드캐스트
     */
    async broadcastToClientType(clientType, message) {
        const connectionIds = [];
        
        for (const [connectionId, connection] of this.connections) {
            if (connection.clientType === clientType) {
                connectionIds.push(connectionId);
            }
        }
        
        return this.broadcastToConnections(connectionIds, message);
    }
    
    /**
     * 에러 메시지 전송
     */
    async sendError(connectionId, errorCode, errorMessage, details = {}) {
        const message = {
            type: 'error',
            error: {
                code: errorCode,
                message: errorMessage,
                timestamp: Date.now(),
                ...details
            }
        };
        
        return this.sendToConnection(connectionId, message);
    }
    
    /**
     * 연결 닫기
     */
    async closeConnection(connectionId, code = 1000, reason = 'Normal closure') {
        const connection = this.getConnection(connectionId);
        if (connection) {
            connection.close(code, reason);
            await this.removeConnection(connectionId);
        }
    }
    
    /**
     * 클라이언트 타입 설정
     */
    setClientType(connectionId, clientType) {
        const connection = this.getConnection(connectionId);
        if (connection) {
            connection.clientType = clientType;
            this.logger.debug('클라이언트 타입 설정', {
                connectionId,
                clientType
            });
        }
    }
    
    /**
     * 인증 상태 설정
     */
    setAuthenticated(connectionId, isAuthenticated) {
        const connection = this.getConnection(connectionId);
        if (connection) {
            connection.isAuthenticated = isAuthenticated;
            if (isAuthenticated) {
                connection.state = CONNECTION_STATES.AUTHENTICATED;
            }
        }
    }
    
    /**
     * 활동 시간 업데이트
     */
    updateLastActivity(connectionId) {
        const connection = this.getConnection(connectionId);
        if (connection) {
            connection.updateActivity();
        }
    }
    
    /**
     * Pong 시간 업데이트
     */
    updateLastPong(connectionId) {
        const connection = this.getConnection(connectionId);
        if (connection) {
            connection.updateLastPong();
        }
    }
    
    /**
     * Rate limiting 확인
     */
    isRateLimited(connection) {
        const now = Date.now();
        const windowStart = now - this.rateLimitWindow;
        
        // 간단한 Rate limiting (실제로는 Redis 등을 사용하는 것이 좋음)
        if (connection.messagesSent > this.rateLimitMax) {
            const timeSinceFirstMessage = now - connection.connectedAt.getTime();
            if (timeSinceFirstMessage < this.rateLimitWindow) {
                connection.isRateLimited = true;
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 비활성 연결 감지
     */
    getInactiveConnections(timeoutMs = this.connectionTimeout) {
        const now = Date.now();
        const inactiveConnections = [];
        
        for (const [connectionId, connection] of this.connections) {
            const timeSinceLastActivity = now - connection.lastActivity.getTime();
            if (timeSinceLastActivity > timeoutMs) {
                inactiveConnections.push(connectionId);
            }
        }
        
        return inactiveConnections;
    }
    
    /**
     * 연결 품질 모니터링
     */
    getConnectionQuality(connectionId) {
        const connection = this.getConnection(connectionId);
        if (!connection) {
            return null;
        }
        
        const now = Date.now();
        const uptime = now - connection.connectedAt.getTime();
        const errorRate = connection.errors / Math.max(connection.messagesSent, 1);
        
        return {
            connectionId,
            uptime,
            latency: connection.latency,
            errorRate,
            isStable: errorRate < 0.05 && connection.latency < 200,
            stats: connection.getInfo().stats
        };
    }
    
    /**
     * 서버 종료 알림 브로드캐스트
     */
    async broadcastShutdown() {
        const message = {
            type: 'server:shutdown',
            message: '서버가 종료됩니다',
            timestamp: Date.now()
        };
        
        await this.broadcastToAll(message);
        
        // 모든 연결 닫기
        for (const [connectionId, connection] of this.connections) {
            connection.close(1001, 'Server shutdown');
        }
        
        this.logger.info('서버 종료 알림 전송 완료');
    }
    
    /**
     * 통계 정보 반환
     */
    getStats() {
        const connections = Array.from(this.connections.values());
        
        return {
            activeConnections: this.connections.size,
            totalConnections: this.totalConnections,
            totalMessages: this.totalMessages,
            totalErrors: this.totalErrors,
            clientTypes: {
                pc: connections.filter(c => c.clientType === CLIENT_TYPES.PC).length,
                mobile: connections.filter(c => c.clientType === CLIENT_TYPES.MOBILE).length,
                admin: connections.filter(c => c.clientType === CLIENT_TYPES.ADMIN).length,
                unknown: connections.filter(c => c.clientType === CLIENT_TYPES.UNKNOWN).length
            },
            averageLatency: connections.reduce((sum, c) => sum + c.latency, 0) / connections.length,
            errorRate: this.totalErrors / Math.max(this.totalMessages, 1)
        };
    }
}

module.exports = {
    ConnectionManager,
    Connection,
    CONNECTION_STATES,
    CLIENT_TYPES
};
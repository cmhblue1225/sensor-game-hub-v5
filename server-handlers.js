/**
 * 🚀 Sensor Game Hub v5.0 - 메시지 핸들러 (재설계)
 * 
 * 완벽한 사용자 경험을 위한 메시지 처리 로직
 */

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

// 데이터 저장소 (재설계된 서버에서 가져옴)
let clients, sessions, rooms;

function initializeHandlers(clientsMap, sessionsMap, roomsMap) {
    clients = clientsMap;
    sessions = sessionsMap;
    rooms = roomsMap;
}

// ========== 세션 관리 핸들러 ==========

/**
 * 세션 생성 (듀얼/멀티플레이어 게임용)
 */
function handleCreateSession(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    try {
        const { gameType } = message; // 'dual' or 'multiplayer'
        
        if (!['dual', 'multiplayer'].includes(gameType)) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '지원하지 않는 게임 타입'
            });
            return;
        }
        
        // 세션 코드 생성
        const sessionCode = generateSessionCode();
        
        // 새 세션 생성
        const session = new Session(sessionCode, gameType);
        session.connectPC(clientId);
        sessions.set(sessionCode, session);
        
        // 클라이언트 설정
        client.type = CLIENT_TYPES.PC;
        client.sessionId = session.sessionId;
        
        // 성공 응답
        client.send({
            type: MESSAGE_TYPES.SESSION_CREATED,
            sessionCode: sessionCode,
            sessionId: session.sessionId,
            gameType: gameType
        });
        
        console.log(`✅ ${gameType} 세션 생성 완료: ${sessionCode}`);
        
    } catch (error) {
        console.error(`❌ 세션 생성 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '세션 생성 실패'
        });
    }
}

/**
 * 센서 클라이언트 세션 참가
 */
function handleJoinSession(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;
    
    try {
        const { sessionCode, sensorId } = message;
        
        // 세션 확인
        const session = sessions.get(sessionCode);
        if (!session) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '유효하지 않은 세션 코드'
            });
            return;
        }
        
        // 센서 연결
        const finalSensorId = session.connectSensor(clientId, sensorId);
        
        // 클라이언트 설정
        client.type = CLIENT_TYPES.SENSOR;
        client.sessionId = session.sessionId;
        
        // 센서 클라이언트에 응답
        client.send({
            type: MESSAGE_TYPES.SESSION_JOINED,
            sessionCode: sessionCode,
            sessionId: session.sessionId,
            sensorId: finalSensorId,
            gameType: session.gameType
        });
        
        // PC 클라이언트에 센서 연결 알림
        if (session.pcClientId) {
            const pcClient = clients.get(session.pcClientId);
            if (pcClient && pcClient.isConnected()) {
                pcClient.send({
                    type: MESSAGE_TYPES.SESSION_MATCHED,
                    sessionCode: sessionCode,
                    sensorId: finalSensorId,
                    sensorCount: session.sensorClients.size,
                    gameType: session.gameType
                });
                
                // 듀얼 센서 완료 확인
                if (session.isDualSensorReady()) {
                    pcClient.send({
                        type: MESSAGE_TYPES.DUAL_SENSOR_READY,
                        sessionCode: sessionCode,
                        sensorCount: session.sensorClients.size
                    });
                }
            }
        }
        
        console.log(`✅ 센서 연결 완료: ${sessionCode} (${finalSensorId})`);
        
    } catch (error) {
        console.error(`❌ 센서 연결 실패 (${clientId}):`, error.message);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: error.message || '센서 연결 실패'
        });
    }
}

// ========== 멀티플레이어 룸 관리 핸들러 ==========

/**
 * 룸 생성 (호스트)
 */
function handleCreateRoom(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        const { gameId, maxPlayers = 10 } = message;
        
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session || session.gameType !== 'multiplayer') {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '멀티플레이어 세션이 필요함'
            });
            return;
        }
        
        // 룸 생성
        const roomId = generateRoomId();
        const room = new Room(roomId, session.sessionId, gameId, maxPlayers);
        rooms.set(roomId, room);
        
        // 호스트를 룸에 추가
        const hostResult = room.addPlayer(session.sessionId, { 
            nickname: 'Host'
        });
        
        if (!hostResult.success) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: hostResult.error
            });
            return;
        }
        
        // 세션에 룸 ID 연결
        session.roomId = roomId;
        session.state = SESSION_STATES.MULTIPLAYER_ROOM_CREATED;
        
        // 성공 응답 (팝업 표시용)
        client.send({
            type: MESSAGE_TYPES.ROOM_CREATED,
            roomId: roomId,
            gameId: gameId,
            isHost: true,
            roomStatus: room.getStatus()
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
 * 룸 참가 (참가자)
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
                error: '존재하지 않는 룸 ID'
            });
            return;
        }
        
        if (room.state === ROOM_STATES.PLAYING) {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '이미 게임이 진행 중인 룸'
            });
            return;
        }
        
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session || session.gameType !== 'multiplayer') {
            client.send({
                type: MESSAGE_TYPES.ERROR,
                error: '멀티플레이어 세션이 필요함'
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
        
        // 세션에 룸 ID 연결
        session.roomId = roomId;
        
        // 참가자에게 응답
        client.send({
            type: MESSAGE_TYPES.ROOM_JOINED,
            roomId: roomId,
            gameId: room.gameId,
            isHost: false,
            roomStatus: room.getStatus()
        });
        
        // 룸의 모든 플레이어에게 새 플레이어 알림
        broadcastToRoom(room, {
            type: MESSAGE_TYPES.PLAYER_JOINED,
            player: result.player,
            roomStatus: room.getStatus()
        }, session.sessionId); // 자신은 제외
        
        console.log(`✅ 룸 참가 완료: ${roomId} <- ${session.sessionId} (${nickname})`);
        
    } catch (error) {
        console.error(`❌ 룸 참가 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '룸 참가 실패'
        });
    }
}

/**
 * 룸 떠나기
 */
function handleLeaveRoom(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session || !session.roomId) {
            return;
        }
        
        const room = rooms.get(session.roomId);
        if (!room) {
            return;
        }
        
        // 룸에서 제거
        const removedPlayer = room.removePlayer(session.sessionId);
        session.roomId = null;
        
        // 떠난 플레이어에게 응답
        client.send({
            type: MESSAGE_TYPES.ROOM_LEFT,
            roomId: room.roomId
        });
        
        // 남은 플레이어들에게 알림
        if (room.players.size > 0) {
            broadcastToRoom(room, {
                type: MESSAGE_TYPES.PLAYER_LEFT,
                player: removedPlayer,
                roomStatus: room.getStatus()
            });
        } else {
            // 룸이 비었으면 정리
            room.cleanup();
            rooms.delete(room.roomId);
        }
        
        console.log(`✅ 룸 떠나기 완료: ${room.roomId} -> ${session.sessionId}`);
        
    } catch (error) {
        console.error(`❌ 룸 떠나기 실패 (${clientId}):`, error);
    }
}

// ========== 게임 컨트롤 핸들러 ==========

/**
 * 게임 시작 (호스트만)
 */
function handleStartGame(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
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
        
        // 듀얼 센서 게임 시작
        if (session.gameType === 'dual') {
            if (!session.isDualSensorReady()) {
                client.send({
                    type: MESSAGE_TYPES.ERROR,
                    error: '두 개의 센서가 모두 연결되어야 함'
                });
                return;
            }
            
            session.state = SESSION_STATES.PLAYING;
            
            // 모든 클라이언트에 게임 시작 알림
            const gameMessage = {
                type: MESSAGE_TYPES.GAME_STARTED,
                gameType: 'dual',
                sessionCode: session.sessionCode,
                sensorCount: session.sensorClients.size
            };
            
            client.send(gameMessage);
            
            // 센서 클라이언트들에게도 알림
            session.sensorClients.forEach((sensorClientId) => {
                const sensorClient = clients.get(sensorClientId);
                if (sensorClient && sensorClient.isConnected()) {
                    sensorClient.send(gameMessage);
                }
            });
            
            console.log(`🎮 듀얼 센서 게임 시작: ${session.sessionCode}`);
        }
        
        // 멀티플레이어 게임 시작
        else if (session.gameType === 'multiplayer') {
            if (!session.roomId) {
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
                    error: '룸을 찾을 수 없음'
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
            
            // 모든 룸 참가자에게 게임 시작 알림
            broadcastToRoom(room, {
                type: MESSAGE_TYPES.GAME_STARTED,
                gameType: 'multiplayer',
                roomId: room.roomId,
                gameId: room.gameId,
                players: Array.from(room.players.values())
            });
            
            room.setPlaying();
            
            console.log(`🎮 멀티플레이어 게임 시작: ${room.roomId} (${room.players.size}명)`);
        }
        
    } catch (error) {
        console.error(`❌ 게임 시작 실패 (${clientId}):`, error);
        client.send({
            type: MESSAGE_TYPES.ERROR,
            error: '게임 시작 실패'
        });
    }
}

/**
 * 게임 종료 후 룸으로 복귀
 */
function handleReturnToRoom(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.PC) return;
    
    try {
        // 세션 확인
        const session = Array.from(sessions.values())
            .find(s => s.pcClientId === clientId);
        
        if (!session || !session.roomId) {
            return;
        }
        
        const room = rooms.get(session.roomId);
        if (!room) {
            return;
        }
        
        // 룸을 대기 상태로 복귀
        room.returnToWaiting();
        
        // 모든 룸 참가자에게 복귀 알림
        broadcastToRoom(room, {
            type: MESSAGE_TYPES.RETURN_TO_ROOM,
            roomId: room.roomId,
            roomStatus: room.getStatus()
        });
        
        console.log(`🔄 룸 복귀: ${room.roomId}`);
        
    } catch (error) {
        console.error(`❌ 룸 복귀 실패 (${clientId}):`, error);
    }
}

// ========== 센서 데이터 핸들러 ==========

/**
 * 센서 데이터 처리 (완전 재설계)
 */
function handleSensorData(clientId, message) {
    const client = clients.get(clientId);
    if (!client || client.type !== CLIENT_TYPES.SENSOR) return;
    
    try {
        // 세션 찾기 (개선된 방식)
        let session = null;
        let sensorId = null;
        
        for (const [sessionCode, sessionObj] of sessions) {
            const foundSensorId = sessionObj.findSensorIdByClientId(clientId);
            if (foundSensorId) {
                session = sessionObj;
                sensorId = foundSensorId;
                break;
            }
        }
        
        if (!session) {
            console.warn(`⚠️ 센서 데이터: 세션을 찾을 수 없음 (${clientId})`);
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
                    sensorId: sensorId,
                    gameType: session.gameType,
                    timestamp: Date.now()
                });
            }
        }
        
        // 멀티플레이어 룸의 다른 플레이어들에게도 전달
        if (session.roomId && session.gameType === 'multiplayer') {
            const room = rooms.get(session.roomId);
            if (room && room.state === ROOM_STATES.PLAYING) {
                broadcastToRoom(room, {
                    type: MESSAGE_TYPES.SENSOR_DATA,
                    data: message.data,
                    sensorId: sensorId,
                    fromSessionId: session.sessionId,
                    gameType: session.gameType,
                    timestamp: Date.now()
                }, session.sessionId); // 자신은 제외
            }
        }
        
        // 룸에서 센서 연결 상태 업데이트
        if (session.roomId) {
            const room = rooms.get(session.roomId);
            if (room) {
                room.updatePlayerSensorStatus(session.sessionId, true);
                
                // 룸 상태 변경이 있었다면 알림
                broadcastToRoom(room, {
                    type: MESSAGE_TYPES.PLAYER_SENSOR_CONNECTED,
                    sessionId: session.sessionId,
                    roomStatus: room.getStatus()
                });
            }
        }
        
    } catch (error) {
        console.error(`❌ 센서 데이터 처리 실패 (${clientId}):`, error);
    }
}

// ========== 유틸리티 함수 ==========

/**
 * 룸의 모든 플레이어에게 메시지 브로드캐스트
 */
function broadcastToRoom(room, message, excludeSessionId = null) {
    room.players.forEach((player, sessionId) => {
        if (sessionId === excludeSessionId) return;
        
        const session = Array.from(sessions.values())
            .find(s => s.sessionId === sessionId);
        
        if (session && session.pcClientId) {
            const client = clients.get(session.pcClientId);
            if (client && client.isConnected()) {
                client.send(message);
            }
        }
    });
}

/**
 * 클라이언트 연결 해제 처리 (완전 재설계)
 */
function handleDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;
    
    console.log(`🔌 클라이언트 연결 해제: ${clientId} (타입: ${client.type || 'unknown'})`);
    
    try {
        if (client.type === CLIENT_TYPES.PC) {
            // PC 클라이언트 연결 해제
            const session = Array.from(sessions.values())
                .find(s => s.pcClientId === clientId);
            
            if (session) {
                // 룸에서 제거
                if (session.roomId) {
                    const room = rooms.get(session.roomId);
                    if (room) {
                        room.removePlayer(session.sessionId);
                        
                        // 남은 플레이어들에게 알림
                        if (room.players.size > 0) {
                            broadcastToRoom(room, {
                                type: MESSAGE_TYPES.PLAYER_LEFT,
                                sessionId: session.sessionId,
                                roomStatus: room.getStatus()
                            });
                        } else {
                            room.cleanup();
                            rooms.delete(room.roomId);
                        }
                    }
                }
                
                // 세션 정리
                session.cleanup();
                sessions.delete(session.sessionCode);
            }
        }
        
        else if (client.type === CLIENT_TYPES.SENSOR) {
            // 센서 클라이언트 연결 해제
            const session = Array.from(sessions.values())
                .find(s => s.findSensorIdByClientId(clientId));
            
            if (session) {
                const sensorId = session.findSensorIdByClientId(clientId);
                session.disconnectSensor(sensorId);
                
                // PC 클라이언트에 센서 해제 알림
                if (session.pcClientId) {
                    const pcClient = clients.get(session.pcClientId);
                    if (pcClient && pcClient.isConnected()) {
                        pcClient.send({
                            type: MESSAGE_TYPES.SESSION_MATCHED,
                            sessionCode: session.sessionCode,
                            sensorId: sensorId,
                            sensorCount: session.sensorClients.size,
                            disconnected: true
                        });
                    }
                }
                
                // 룸에서 센서 연결 상태 업데이트
                if (session.roomId) {
                    const room = rooms.get(session.roomId);
                    if (room) {
                        room.updatePlayerSensorStatus(session.sessionId, false);
                        
                        broadcastToRoom(room, {
                            type: MESSAGE_TYPES.ROOM_STATUS_UPDATE,
                            roomStatus: room.getStatus()
                        });
                    }
                }
            }
        }
        
    } catch (error) {
        console.error(`❌ 연결 해제 처리 실패 (${clientId}):`, error);
    } finally {
        clients.delete(clientId);
    }
}

module.exports = {
    initializeHandlers,
    handleCreateSession,
    handleJoinSession,
    handleCreateRoom,
    handleJoinRoom,
    handleLeaveRoom,
    handleStartGame,
    handleReturnToRoom,
    handleSensorData,
    handleDisconnect,
    broadcastToRoom
};
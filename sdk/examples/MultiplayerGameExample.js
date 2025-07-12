/**
 * 🎮 멀티플레이어 게임 예제
 * 
 * 여러 플레이어가 참여하는 실시간 경쟁 게임 구현 예제
 * - 룸 생성/참가 시스템
 * - 실시간 플레이어 동기화
 * - 경쟁 게임플레이
 */

class MultiplayerGameExample {
    constructor() {
        this.sdk = null;
        this.gameState = {
            isPlaying: false,
            isHost: false,
            roomInfo: null,
            players: new Map(),
            myPlayer: null,
            gameStartTime: null,
            gameEndTime: null
        };
        
        this.gameElements = {
            connectionStatus: null,
            roomPanel: null,
            gameArea: null,
            playersDisplay: null
        };
        
        this.uiMode = 'menu'; // 'menu', 'lobby', 'game'
        
        this.init();
    }
    
    /**
     * 초기화
     */
    async init() {
        // SDK 생성
        this.sdk = createSensorGameSDK({
            serverUrl: 'wss://localhost:3000',
            gameId: 'multiplayer-racing',
            gameTitle: '멀티플레이어 레이싱 게임',
            debug: true
        });
        
        // 이벤트 리스너 등록
        this.setupEventListeners();
        
        // UI 초기화
        this.setupUI();
        
        // 서버 연결
        try {
            await this.sdk.connect();
        } catch (error) {
            this.showError('서버 연결 실패: ' + error.message);
        }
    }
    
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 연결 상태
        this.sdk.on('connected', () => {
            this.updateStatus('서버에 연결되었습니다');
            this.showMainMenu();
        });
        
        this.sdk.on('disconnected', (data) => {
            this.updateStatus('서버 연결이 끊어졌습니다: ' + data.reason);
            this.showConnectionLost();
        });
        
        // 세션 이벤트
        this.sdk.on('sessionCreated', (data) => {
            this.updateStatus('멀티플레이어 세션이 생성되었습니다');
        });
        
        // 룸 이벤트
        this.sdk.on('roomCreated', (data) => {
            this.gameState.isHost = true;
            this.gameState.roomInfo = data.roomInfo;
            this.showLobby(data);
        });
        
        this.sdk.on('roomJoined', (data) => {
            this.gameState.isHost = data.isHost;
            this.gameState.roomInfo = data.roomInfo;
            this.showLobby(data);
        });
        
        // 플레이어 이벤트
        this.sdk.on('playerJoined', (data) => {
            this.addPlayerToLobby(data.player);
            this.updateRoomInfo(data.roomInfo);
        });
        
        this.sdk.on('playerLeft', (data) => {
            this.removePlayerFromLobby(data.player);
            this.updateRoomInfo(data.roomInfo);
        });
        
        // 센서 이벤트
        this.sdk.on('sensorConnected', (data) => {
            this.updateSensorStatus(data);
        });
        
        this.sdk.on('sensorData', (data) => {
            this.handleSensorData(data);
        });
        
        // 게임 이벤트
        this.sdk.on('gameStarted', (data) => {
            this.startGame(data);
        });
        
        this.sdk.on('gameEnded', (data) => {
            this.endGame(data);
        });
        
        // 에러 처리
        this.sdk.on('error', (error) => {
            this.showError('SDK 오류: ' + error.error.message);
        });
        
        this.sdk.on('serverError', (error) => {
            this.showError('서버 오류: ' + error.message);
        });
    }
    
    /**
     * UI 설정
     */
    setupUI() {
        const container = document.getElementById('game-container') || document.body;
        
        container.innerHTML = `
            <div class="multiplayer-game">
                <div class="game-header">
                    <h1>🏁 멀티플레이어 레이싱 게임</h1>
                    <div class="status-panel">
                        <div id="connection-status" class="status-item">
                            <span class="label">연결 상태:</span>
                            <span class="value">연결 중...</span>
                        </div>
                    </div>
                </div>
                
                <!-- 메인 메뉴 -->
                <div id="main-menu" class="main-menu" style="display: none;">
                    <div class="menu-section">
                        <h2>게임 모드 선택</h2>
                        <div class="menu-buttons">
                            <button id="create-room-btn" class="btn primary large">
                                🏠 새 룸 만들기
                            </button>
                            <button id="join-room-btn" class="btn secondary large">
                                🚪 룸 참가하기
                            </button>
                        </div>
                    </div>
                    
                    <div id="create-room-form" class="form-section" style="display: none;">
                        <h3>새 룸 설정</h3>
                        <div class="form-group">
                            <label for="room-name">룸 이름:</label>
                            <input type="text" id="room-name" placeholder="내 멋진 룸" maxlength="20">
                        </div>
                        <div class="form-group">
                            <label for="max-players">최대 플레이어:</label>
                            <select id="max-players">
                                <option value="2">2명</option>
                                <option value="4" selected>4명</option>
                                <option value="6">6명</option>
                                <option value="8">8명</option>
                            </select>
                        </div>
                        <div class="form-buttons">
                            <button id="confirm-create-btn" class="btn success">룸 생성</button>
                            <button id="cancel-create-btn" class="btn secondary">취소</button>
                        </div>
                    </div>
                    
                    <div id="join-room-form" class="form-section" style="display: none;">
                        <h3>룸 참가</h3>
                        <div class="form-group">
                            <label for="room-id">룸 ID:</label>
                            <input type="text" id="room-id" placeholder="ABCD1234" maxlength="8">
                        </div>
                        <div class="form-group">
                            <label for="player-nickname">닉네임:</label>
                            <input type="text" id="player-nickname" placeholder="플레이어1" maxlength="15">
                        </div>
                        <div class="form-buttons">
                            <button id="confirm-join-btn" class="btn success">참가하기</button>
                            <button id="cancel-join-btn" class="btn secondary">취소</button>
                        </div>
                    </div>
                </div>
                
                <!-- 대기실 -->
                <div id="lobby" class="lobby" style="display: none;">
                    <div class="lobby-header">
                        <div class="room-info">
                            <h2 id="room-title">룸 이름</h2>
                            <div class="room-details">
                                <span>룸 ID: <strong id="room-id-display">-</strong></span>
                                <span id="player-count">0/4</span>
                            </div>
                        </div>
                        <button id="leave-room-btn" class="btn danger">룸 나가기</button>
                    </div>
                    
                    <div class="lobby-content">
                        <div class="players-section">
                            <h3>참가자 목록</h3>
                            <div id="players-list" class="players-list">
                                <!-- 플레이어들이 동적으로 추가됨 -->
                            </div>
                        </div>
                        
                        <div class="sensor-section">
                            <h3>📱 센서 연결</h3>
                            <div id="sensor-status" class="sensor-status">
                                <p>센서 클라이언트에서 세션 코드를 입력하세요:</p>
                                <div class="session-code-display">
                                    <span id="session-code">-</span>
                                </div>
                                <div id="sensor-connection-status">센서 연결 대기 중...</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="lobby-controls">
                        <button id="start-game-btn" class="btn success large" style="display: none;">
                            🏁 게임 시작
                        </button>
                        <div id="ready-status" class="ready-status">
                            센서를 연결하고 게임 시작을 기다리세요...
                        </div>
                    </div>
                </div>
                
                <!-- 게임 화면 -->
                <div id="game-area" class="game-area" style="display: none;">
                    <div class="game-ui">
                        <div class="race-info">
                            <div class="time-display">
                                시간: <span id="game-time">00:00</span>
                            </div>
                            <div class="position-display">
                                순위: <span id="my-position">-</span> / <span id="total-players">-</span>
                            </div>
                        </div>
                        
                        <div class="leaderboard">
                            <h4>순위표</h4>
                            <div id="leaderboard-list">
                                <!-- 순위가 동적으로 업데이트됨 -->
                            </div>
                        </div>
                    </div>
                    
                    <div class="race-track">
                        <div class="track">
                            <div class="start-line">시작</div>
                            <div class="finish-line">결승</div>
                            <div id="players-on-track" class="players-on-track">
                                <!-- 플레이어들이 동적으로 표시됨 -->
                            </div>
                        </div>
                        
                        <div class="sensor-feedback">
                            <div class="sensor-value">
                                <span>속도: <span id="speed-display">0</span></span>
                            </div>
                            <div class="sensor-value">
                                <span>가속도: <span id="accel-display">0, 0, 0</span></span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="game-controls">
                        <button id="end-race-btn" class="btn danger">레이스 종료</button>
                    </div>
                </div>
                
                <div id="error-message" class="error-message" style="display: none;"></div>
            </div>
        `;
        
        // 엘리먼트 참조 저장
        this.gameElements = {
            connectionStatus: document.getElementById('connection-status').querySelector('.value'),
            mainMenu: document.getElementById('main-menu'),
            lobby: document.getElementById('lobby'),
            gameArea: document.getElementById('game-area'),
            
            // 메뉴 요소들
            createRoomBtn: document.getElementById('create-room-btn'),
            joinRoomBtn: document.getElementById('join-room-btn'),
            createRoomForm: document.getElementById('create-room-form'),
            joinRoomForm: document.getElementById('join-room-form'),
            
            // 룸 생성 폼
            roomName: document.getElementById('room-name'),
            maxPlayers: document.getElementById('max-players'),
            confirmCreateBtn: document.getElementById('confirm-create-btn'),
            cancelCreateBtn: document.getElementById('cancel-create-btn'),
            
            // 룸 참가 폼
            roomId: document.getElementById('room-id'),
            playerNickname: document.getElementById('player-nickname'),
            confirmJoinBtn: document.getElementById('confirm-join-btn'),
            cancelJoinBtn: document.getElementById('cancel-join-btn'),
            
            // 대기실 요소들
            roomTitle: document.getElementById('room-title'),
            roomIdDisplay: document.getElementById('room-id-display'),
            playerCount: document.getElementById('player-count'),
            playersList: document.getElementById('players-list'),
            sessionCode: document.getElementById('session-code'),
            sensorConnectionStatus: document.getElementById('sensor-connection-status'),
            startGameBtn: document.getElementById('start-game-btn'),
            leaveRoomBtn: document.getElementById('leave-room-btn'),
            readyStatus: document.getElementById('ready-status'),
            
            // 게임 요소들
            gameTime: document.getElementById('game-time'),
            myPosition: document.getElementById('my-position'),
            totalPlayers: document.getElementById('total-players'),
            leaderboardList: document.getElementById('leaderboard-list'),
            playersOnTrack: document.getElementById('players-on-track'),
            speedDisplay: document.getElementById('speed-display'),
            accelDisplay: document.getElementById('accel-display'),
            endRaceBtn: document.getElementById('end-race-btn'),
            
            errorMessage: document.getElementById('error-message')
        };
        
        this.setupEventHandlers();
        this.addStyles();
    }
    
    /**
     * 이벤트 핸들러 설정
     */
    setupEventHandlers() {
        // 메인 메뉴 버튼들
        this.gameElements.createRoomBtn.addEventListener('click', () => {
            this.showCreateRoomForm();
        });
        
        this.gameElements.joinRoomBtn.addEventListener('click', () => {
            this.showJoinRoomForm();
        });
        
        // 룸 생성 폼
        this.gameElements.confirmCreateBtn.addEventListener('click', () => {
            this.createRoom();
        });
        
        this.gameElements.cancelCreateBtn.addEventListener('click', () => {
            this.hideAllForms();
        });
        
        // 룸 참가 폼
        this.gameElements.confirmJoinBtn.addEventListener('click', () => {
            this.joinRoom();
        });
        
        this.gameElements.cancelJoinBtn.addEventListener('click', () => {
            this.hideAllForms();
        });
        
        // 대기실 버튼들
        this.gameElements.startGameBtn.addEventListener('click', () => {
            this.sdk.startGame();
        });
        
        this.gameElements.leaveRoomBtn.addEventListener('click', () => {
            this.leaveRoom();
        });
        
        // 게임 버튼들
        this.gameElements.endRaceBtn.addEventListener('click', () => {
            this.sdk.endGame('user_ended');
        });
    }
    
    /**
     * 메인 메뉴 표시
     */
    showMainMenu() {
        this.uiMode = 'menu';
        this.gameElements.mainMenu.style.display = 'block';
        this.gameElements.lobby.style.display = 'none';
        this.gameElements.gameArea.style.display = 'none';
        this.hideAllForms();
    }
    
    /**
     * 룸 생성 폼 표시
     */
    showCreateRoomForm() {
        this.hideAllForms();
        this.gameElements.createRoomForm.style.display = 'block';
        this.gameElements.roomName.focus();
    }
    
    /**
     * 룸 참가 폼 표시
     */
    showJoinRoomForm() {
        this.hideAllForms();
        this.gameElements.joinRoomForm.style.display = 'block';
        this.gameElements.roomId.focus();
    }
    
    /**
     * 모든 폼 숨기기
     */
    hideAllForms() {
        this.gameElements.createRoomForm.style.display = 'none';
        this.gameElements.joinRoomForm.style.display = 'none';
    }
    
    /**
     * 룸 생성
     */
    async createRoom() {
        const roomName = this.gameElements.roomName.value.trim() || '새 룸';
        const maxPlayers = parseInt(this.gameElements.maxPlayers.value);
        
        try {
            await this.sdk.createMultiplayerRoom({
                roomName,
                maxPlayers,
                hostNickname: 'Host'
            });
        } catch (error) {
            this.showError('룸 생성 실패: ' + error.message);
        }
    }
    
    /**
     * 룸 참가
     */
    async joinRoom() {
        const roomId = this.gameElements.roomId.value.trim().toUpperCase();
        const nickname = this.gameElements.playerNickname.value.trim() || 'Player';
        
        if (!roomId) {
            this.showError('룸 ID를 입력하세요');
            return;
        }
        
        try {
            await this.sdk.joinMultiplayerRoom(roomId, { nickname });
        } catch (error) {
            this.showError('룸 참가 실패: ' + error.message);
        }
    }
    
    /**
     * 룸 나가기
     */
    async leaveRoom() {
        // 현재 룸에서 나가기 (구현 필요)
        this.showMainMenu();
    }
    
    /**
     * 대기실 표시
     */
    showLobby(data) {
        this.uiMode = 'lobby';
        this.gameElements.mainMenu.style.display = 'none';
        this.gameElements.lobby.style.display = 'block';
        this.gameElements.gameArea.style.display = 'none';
        
        // 룸 정보 업데이트
        this.gameElements.roomTitle.textContent = data.roomInfo?.name || '멀티플레이어 룸';
        this.gameElements.roomIdDisplay.textContent = data.roomId;
        
        // 세션 코드 표시 (SDK에서 받아올 수 있다면)
        const sessionInfo = this.sdk.getSessionInfo();
        if (sessionInfo.sessionCode) {
            this.gameElements.sessionCode.textContent = sessionInfo.sessionCode;
        }
        
        // 호스트만 게임 시작 버튼 표시
        if (this.gameState.isHost) {
            this.gameElements.startGameBtn.style.display = 'inline-block';
        }
        
        this.updateRoomInfo(data.roomInfo);
    }
    
    /**
     * 룸 정보 업데이트
     */
    updateRoomInfo(roomInfo) {
        if (!roomInfo) return;
        
        this.gameState.roomInfo = roomInfo;
        this.gameElements.playerCount.textContent = `${roomInfo.playerCount}/${roomInfo.maxPlayers}`;
        
        // 플레이어 목록 업데이트
        this.updatePlayersList(roomInfo.players);
    }
    
    /**
     * 플레이어 목록 업데이트
     */
    updatePlayersList(players) {
        this.gameElements.playersList.innerHTML = '';
        
        players.forEach((player, index) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <div class="player-info">
                    <span class="player-number">${index + 1}</span>
                    <span class="player-name">${player.nickname}</span>
                    ${player.isHost ? '<span class="host-badge">HOST</span>' : ''}
                </div>
                <div class="player-status">
                    <span class="sensor-indicator ${player.hasSensor ? 'connected' : 'disconnected'}">
                        ${player.hasSensor ? '📱 연결됨' : '📱 연결 대기'}
                    </span>
                    <span class="ready-indicator ${player.isReady ? 'ready' : 'not-ready'}">
                        ${player.isReady ? '✅ 준비됨' : '⏳ 대기중'}
                    </span>
                </div>
            `;
            
            this.gameElements.playersList.appendChild(playerElement);
        });
    }
    
    /**
     * 플레이어 추가 (대기실)
     */
    addPlayerToLobby(player) {
        // 플레이어가 추가되면 목록이 업데이트됨
        this.showNotification(`${player.nickname}님이 참가했습니다`);
    }
    
    /**
     * 플레이어 제거 (대기실)
     */
    removePlayerFromLobby(player) {
        this.showNotification(`${player.nickname}님이 나갔습니다`);
    }
    
    /**
     * 센서 상태 업데이트
     */
    updateSensorStatus(data) {
        this.gameElements.sensorConnectionStatus.textContent = 
            `센서 연결됨 (${data.connectedCount}/${data.totalExpected})`;
        
        if (data.isReady) {
            this.gameElements.readyStatus.textContent = '모든 센서가 연결되었습니다! 게임을 시작할 수 있습니다.';
            this.gameElements.readyStatus.className = 'ready-status ready';
        }
    }
    
    /**
     * 게임 시작
     */
    startGame(data) {
        this.uiMode = 'game';
        this.gameState.isPlaying = true;
        this.gameState.gameStartTime = Date.now();
        
        this.gameElements.lobby.style.display = 'none';
        this.gameElements.gameArea.style.display = 'block';
        
        // 플레이어 정보 업데이트
        this.gameElements.totalPlayers.textContent = data.players ? data.players.length : 0;
        
        // 트랙에 플레이어들 표시
        this.setupRaceTrack(data.players);
        
        // 게임 타이머 시작
        this.startGameTimer();
    }
    
    /**
     * 레이스 트랙 설정
     */
    setupRaceTrack(players) {
        this.gameElements.playersOnTrack.innerHTML = '';
        
        players.forEach((player, index) => {
            const playerCar = document.createElement('div');
            playerCar.className = 'race-car';
            playerCar.id = `car-${player.sessionId}`;
            playerCar.style.top = `${20 + index * 60}px`;
            playerCar.style.left = '10px';
            playerCar.innerHTML = `
                <div class="car-body" style="background: ${this.getPlayerColor(index)}"></div>
                <div class="car-name">${player.nickname}</div>
            `;
            
            this.gameElements.playersOnTrack.appendChild(playerCar);
        });
    }
    
    /**
     * 플레이어 색상 반환
     */
    getPlayerColor(index) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
        return colors[index % colors.length];
    }
    
    /**
     * 게임 타이머 시작
     */
    startGameTimer() {
        const updateTimer = () => {
            if (!this.gameState.isPlaying) return;
            
            const elapsed = Date.now() - this.gameState.gameStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            this.gameElements.gameTime.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            requestAnimationFrame(updateTimer);
        };
        
        updateTimer();
    }
    
    /**
     * 센서 데이터 처리 (게임 중)
     */
    handleSensorData(data) {
        if (!this.gameState.isPlaying) return;
        
        const sensorData = data.data;
        
        // 내 센서 데이터인 경우 UI 업데이트
        if (data.sensorId) {
            this.updateSensorFeedback(sensorData);
            this.updateMyCarPosition(sensorData);
        }
    }
    
    /**
     * 센서 피드백 업데이트
     */
    updateSensorFeedback(sensorData) {
        if (sensorData.accelerometer) {
            const accel = sensorData.accelerometer;
            this.gameElements.accelDisplay.textContent = 
                `${accel.x.toFixed(1)}, ${accel.y.toFixed(1)}, ${accel.z.toFixed(1)}`;
            
            // 가속도로 속도 계산 (간단한 방식)
            const speed = Math.sqrt(accel.x * accel.x + accel.y * accel.y) * 10;
            this.gameElements.speedDisplay.textContent = Math.floor(speed);
        }
    }
    
    /**
     * 내 차 위치 업데이트
     */
    updateMyCarPosition(sensorData) {
        // 센서 데이터를 바탕으로 차의 위치를 업데이트하는 로직
        // 실제 구현에서는 더 복잡한 물리 계산이 필요
    }
    
    /**
     * 게임 종료
     */
    endGame(data) {
        this.gameState.isPlaying = false;
        this.gameState.gameEndTime = Date.now();
        
        // 결과 표시
        this.showGameResults(data);
        
        // 잠시 후 대기실로 돌아가기
        setTimeout(() => {
            if (this.gameState.roomInfo) {
                this.showLobby({ 
                    roomId: this.gameState.roomInfo.roomId,
                    roomInfo: this.gameState.roomInfo
                });
            } else {
                this.showMainMenu();
            }
        }, 5000);
    }
    
    /**
     * 게임 결과 표시
     */
    showGameResults(data) {
        // 모달 또는 오버레이로 결과 표시
        const resultModal = document.createElement('div');
        resultModal.className = 'game-results-modal';
        resultModal.innerHTML = `
            <div class="results-content">
                <h2>🏁 레이스 완료!</h2>
                <div class="final-rankings">
                    <!-- 최종 순위 표시 -->
                </div>
                <p>5초 후 대기실로 돌아갑니다...</p>
            </div>
        `;
        
        document.body.appendChild(resultModal);
        
        setTimeout(() => {
            document.body.removeChild(resultModal);
        }, 5000);
    }
    
    /**
     * 연결 손실 표시
     */
    showConnectionLost() {
        this.uiMode = 'menu';
        this.gameElements.mainMenu.style.display = 'block';
        this.gameElements.lobby.style.display = 'none';
        this.gameElements.gameArea.style.display = 'none';
        this.showError('서버 연결이 끊어졌습니다. 재연결을 시도해주세요.');
    }
    
    /**
     * 알림 표시
     */
    showNotification(message) {
        // 간단한 토스트 알림
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
    
    /**
     * 상태 업데이트
     */
    updateStatus(message) {
        this.gameElements.connectionStatus.textContent = message;
    }
    
    /**
     * 에러 메시지 표시
     */
    showError(message) {
        this.gameElements.errorMessage.textContent = message;
        this.gameElements.errorMessage.style.display = 'block';
        
        setTimeout(() => {
            this.gameElements.errorMessage.style.display = 'none';
        }, 5000);
    }
    
    /**
     * 스타일 추가
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .multiplayer-game {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 1000px;
                margin: 0 auto;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 12px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.1);
            }
            
            .game-header h1 {
                text-align: center;
                color: #2c3e50;
                margin-bottom: 20px;
            }
            
            .status-panel {
                background: white;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .main-menu {
                text-align: center;
            }
            
            .menu-section h2 {
                color: #2c3e50;
                margin-bottom: 30px;
            }
            
            .menu-buttons {
                display: flex;
                justify-content: center;
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 6px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .btn.large {
                padding: 16px 32px;
                font-size: 18px;
            }
            
            .btn.primary { background: #007bff; color: white; }
            .btn.secondary { background: #6c757d; color: white; }
            .btn.success { background: #28a745; color: white; }
            .btn.danger { background: #dc3545; color: white; }
            
            .form-section {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                text-align: left;
            }
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
                color: #555;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 16px;
            }
            
            .form-buttons {
                display: flex;
                gap: 10px;
                justify-content: center;
                margin-top: 20px;
            }
            
            .lobby {
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .lobby-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid #eee;
            }
            
            .room-details {
                display: flex;
                gap: 20px;
                font-size: 14px;
                color: #666;
            }
            
            .lobby-content {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 30px;
                margin-bottom: 30px;
            }
            
            .players-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .player-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #e9ecef;
            }
            
            .player-info {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .player-number {
                background: #007bff;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
            }
            
            .host-badge {
                background: #ffc107;
                color: #000;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: bold;
            }
            
            .player-status {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 4px;
                font-size: 12px;
            }
            
            .sensor-indicator.connected { color: #28a745; }
            .sensor-indicator.disconnected { color: #dc3545; }
            .ready-indicator.ready { color: #28a745; }
            .ready-indicator.not-ready { color: #ffc107; }
            
            .session-code-display {
                text-align: center;
                margin: 15px 0;
            }
            
            .session-code-display span {
                background: #e3f2fd;
                padding: 8px 16px;
                border-radius: 6px;
                font-family: 'Courier New', monospace;
                font-size: 24px;
                font-weight: bold;
                color: #1976d2;
            }
            
            .lobby-controls {
                text-align: center;
            }
            
            .ready-status {
                margin-top: 15px;
                padding: 10px;
                border-radius: 6px;
                background: #fff3cd;
                color: #856404;
            }
            
            .ready-status.ready {
                background: #d4edda;
                color: #155724;
            }
            
            .game-area {
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .game-ui {
                display: flex;
                justify-content: space-between;
                margin-bottom: 20px;
            }
            
            .race-info {
                display: flex;
                gap: 30px;
                font-size: 18px;
                font-weight: bold;
            }
            
            .leaderboard {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                min-width: 200px;
            }
            
            .race-track {
                position: relative;
                background: #2c3e50;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                min-height: 400px;
            }
            
            .track {
                position: relative;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, 
                    #34495e 0%, #34495e 10%, 
                    #ecf0f1 10%, #ecf0f1 90%, 
                    #e74c3c 90%, #e74c3c 100%);
                border-radius: 4px;
            }
            
            .start-line {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                color: white;
                font-weight: bold;
                writing-mode: vertical-rl;
            }
            
            .finish-line {
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                color: white;
                font-weight: bold;
                writing-mode: vertical-rl;
            }
            
            .race-car {
                position: absolute;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: left 0.2s ease-out;
            }
            
            .car-body {
                width: 40px;
                height: 20px;
                border-radius: 10px;
                border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            
            .car-name {
                color: white;
                font-size: 12px;
                font-weight: bold;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
            
            .sensor-feedback {
                display: flex;
                justify-content: center;
                gap: 30px;
                margin-top: 20px;
            }
            
            .sensor-value {
                background: rgba(255,255,255,0.1);
                padding: 10px 15px;
                border-radius: 6px;
                color: white;
                font-family: 'Courier New', monospace;
            }
            
            .game-controls {
                text-align: center;
            }
            
            .error-message {
                background: #f8d7da;
                color: #721c24;
                padding: 12px;
                border-radius: 6px;
                border: 1px solid #f5c6cb;
                margin-top: 15px;
                text-align: center;
            }
            
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #007bff;
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                transform: translateX(400px);
                transition: transform 0.3s ease-out;
                z-index: 1000;
            }
            
            .toast-notification.show {
                transform: translateX(0);
            }
            
            .game-results-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .results-content {
                background: white;
                padding: 40px;
                border-radius: 12px;
                text-align: center;
                max-width: 500px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            }
        `;
        
        document.head.appendChild(style);
    }
}

// 브라우저 환경에서 자동 시작
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.multiplayerGame = new MultiplayerGameExample();
    });
}
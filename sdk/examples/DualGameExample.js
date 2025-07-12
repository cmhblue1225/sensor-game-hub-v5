/**
 * 🎮 듀얼 센서 게임 예제
 * 
 * 두 개의 센서를 사용하는 협력/경쟁 게임 구현 예제
 * - 2개 센서 연결 대기
 * - 센서별 데이터 처리
 * - 협력 게임플레이
 */

class DualGameExample {
    constructor() {
        this.sdk = null;
        this.gameState = {
            isPlaying: false,
            score: 0,
            players: {
                player1: { 
                    position: { x: 100, y: 250 }, 
                    color: '#ff6b6b', 
                    sensorId: null,
                    points: 0 
                },
                player2: { 
                    position: { x: 400, y: 250 }, 
                    color: '#4ecdc4', 
                    sensorId: null,
                    points: 0 
                }
            },
            sensorData: new Map(),
            target: { x: 250, y: 250, visible: false }
        };
        
        this.gameElements = {
            connectionStatus: null,
            sessionCode: null,
            sensorStatus: null,
            gameArea: null,
            scoreDisplay: null,
            players: new Map()
        };
        
        this.init();
    }
    
    /**
     * 초기화
     */
    async init() {
        // SDK 생성
        this.sdk = createSensorGameSDK({
            serverUrl: 'wss://localhost:3000',
            gameId: 'dual-cooperative-ball',
            gameTitle: '듀얼 협력 볼 게임',
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
            this.showStartButton();
        });
        
        this.sdk.on('disconnected', (data) => {
            this.updateStatus('서버 연결이 끊어졌습니다: ' + data.reason);
            this.hideStartButton();
        });
        
        // 세션 이벤트
        this.sdk.on('sessionCreated', (data) => {
            this.updateStatus('세션이 생성되었습니다');
            this.showSessionCode(data.sessionCode);
            this.showSensorWaiting();
        });
        
        // 센서 이벤트
        this.sdk.on('sensorConnected', (data) => {
            this.updateSensorStatus(`센서 연결됨 (${data.connectedCount}/2)`);
            
            if (data.isReady) {
                this.showGameReadyButton();
            }
        });
        
        this.sdk.on('sensorData', (data) => {
            this.handleSensorData(data);
        });
        
        // 게임 이벤트
        this.sdk.on('gameStarted', () => {
            this.startGame();
        });
        
        this.sdk.on('gameEnded', () => {
            this.endGame();
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
            <div class="dual-game">
                <div class="game-header">
                    <h1>🤝 듀얼 협력 볼 게임</h1>
                    <div class="status-panel">
                        <div id="connection-status" class="status-item">
                            <span class="label">연결 상태:</span>
                            <span class="value">연결 중...</span>
                        </div>
                        <div id="session-code" class="status-item" style="display: none;">
                            <span class="label">세션 코드:</span>
                            <span class="value code"></span>
                        </div>
                        <div id="sensor-status" class="status-item" style="display: none;">
                            <span class="label">센서 상태:</span>
                            <span class="value">대기 중...</span>
                        </div>
                    </div>
                </div>
                
                <div class="game-controls">
                    <button id="start-session-btn" style="display: none;" class="btn primary">
                        듀얼 게임 세션 시작
                    </button>
                    <button id="start-game-btn" style="display: none;" class="btn success">
                        게임 플레이 시작
                    </button>
                    <button id="end-game-btn" style="display: none;" class="btn danger">
                        게임 종료
                    </button>
                </div>
                
                <div id="sensor-instructions" style="display: none;" class="instructions">
                    <h3>📱 센서 연결 방법</h3>
                    <p>1. <strong>두 개의</strong> 모바일 기기에서 센서 클라이언트 페이지를 열어주세요</p>
                    <p>2. 각각에서 위에 표시된 <strong>세션 코드</strong>를 입력해주세요</p>
                    <p>3. 두 센서가 모두 연결되면 게임을 시작할 수 있습니다</p>
                    <div class="sensor-assignment">
                        <div class="sensor-info">
                            <span class="sensor-color player1-color"></span>
                            <span>첫 번째 센서: 플레이어 1 (빨간색 볼)</span>
                        </div>
                        <div class="sensor-info">
                            <span class="sensor-color player2-color"></span>
                            <span>두 번째 센서: 플레이어 2 (청록색 볼)</span>
                        </div>
                    </div>
                </div>
                
                <div id="game-area" class="game-area" style="display: none;">
                    <div class="score-panel">
                        <div class="team-score">
                            <span>팀 점수: <span id="team-score">0</span></span>
                        </div>
                        <div class="player-scores">
                            <div class="player-score">
                                <span class="player-color player1-color"></span>
                                플레이어 1: <span id="player1-score">0</span>
                            </div>
                            <div class="player-score">
                                <span class="player-color player2-color"></span>
                                플레이어 2: <span id="player2-score">0</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="play-area">
                        <div id="player1" class="player player1"></div>
                        <div id="player2" class="player player2"></div>
                        <div id="target" class="target" style="display: none;"></div>
                        
                        <div class="sensor-data-display">
                            <div class="sensor-section">
                                <h4>센서 1 (플레이어 1)</h4>
                                <div>가속도: <span id="sensor1-accel">-</span></div>
                                <div>자이로: <span id="sensor1-gyro">-</span></div>
                            </div>
                            <div class="sensor-section">
                                <h4>센서 2 (플레이어 2)</h4>
                                <div>가속도: <span id="sensor2-accel">-</span></div>
                                <div>자이로: <span id="sensor2-gyro">-</span></div>
                            </div>
                        </div>
                        
                        <div class="game-instructions">
                            <h4>🎯 게임 목표</h4>
                            <p>두 플레이어가 협력하여 파란색 타겟에 동시에 도달하세요!</p>
                            <p>두 볼이 모두 타겟 근처에 있을 때 점수를 획득합니다.</p>
                        </div>
                    </div>
                </div>
                
                <div id="error-message" class="error-message" style="display: none;"></div>
            </div>
        `;
        
        // 엘리먼트 참조 저장
        this.gameElements = {
            connectionStatus: document.getElementById('connection-status').querySelector('.value'),
            sessionCode: document.getElementById('session-code'),
            sessionCodeValue: document.getElementById('session-code').querySelector('.value'),
            sensorStatus: document.getElementById('sensor-status'),
            sensorStatusValue: document.getElementById('sensor-status').querySelector('.value'),
            sensorInstructions: document.getElementById('sensor-instructions'),
            gameArea: document.getElementById('game-area'),
            teamScore: document.getElementById('team-score'),
            player1Score: document.getElementById('player1-score'),
            player2Score: document.getElementById('player2-score'),
            player1: document.getElementById('player1'),
            player2: document.getElementById('player2'),
            target: document.getElementById('target'),
            sensor1Accel: document.getElementById('sensor1-accel'),
            sensor1Gyro: document.getElementById('sensor1-gyro'),
            sensor2Accel: document.getElementById('sensor2-accel'),
            sensor2Gyro: document.getElementById('sensor2-gyro'),
            errorMessage: document.getElementById('error-message'),
            startSessionBtn: document.getElementById('start-session-btn'),
            startGameBtn: document.getElementById('start-game-btn'),
            endGameBtn: document.getElementById('end-game-btn')
        };
        
        // 플레이어 엘리먼트 매핑
        this.gameElements.players.set('player1', this.gameElements.player1);
        this.gameElements.players.set('player2', this.gameElements.player2);
        
        // 버튼 이벤트 리스너
        this.gameElements.startSessionBtn.addEventListener('click', () => {
            this.startSession();
        });
        
        this.gameElements.startGameBtn.addEventListener('click', () => {
            this.sdk.startGame();
        });
        
        this.gameElements.endGameBtn.addEventListener('click', () => {
            this.sdk.endGame('user_ended');
        });
        
        // CSS 스타일 추가
        this.addStyles();
    }
    
    /**
     * 세션 시작
     */
    async startSession() {
        try {
            await this.sdk.startDualGame({
                gameMode: 'cooperative',
                difficulty: 'normal',
                targetCount: 5
            });
            
            this.gameElements.startSessionBtn.style.display = 'none';
            
        } catch (error) {
            this.showError('세션 시작 실패: ' + error.message);
        }
    }
    
    /**
     * 게임 시작
     */
    startGame() {
        this.gameState.isPlaying = true;
        this.gameState.score = 0;
        this.gameState.players.player1.points = 0;
        this.gameState.players.player2.points = 0;
        
        // 센서 ID 할당 (연결 순서대로)
        const connectedSensors = this.sdk.getConnectedSensors();
        if (connectedSensors.length >= 2) {
            this.gameState.players.player1.sensorId = connectedSensors[0];
            this.gameState.players.player2.sensorId = connectedSensors[1];
        }
        
        this.updateStatus('게임 진행 중');
        this.gameElements.gameArea.style.display = 'block';
        this.gameElements.startGameBtn.style.display = 'none';
        this.gameElements.endGameBtn.style.display = 'inline-block';
        
        this.updateAllPositions();
        this.spawnTarget();
        this.startGameLoop();
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        this.gameState.isPlaying = false;
        
        this.updateStatus('게임 종료됨');
        this.gameElements.gameArea.style.display = 'none';
        this.gameElements.startGameBtn.style.display = 'inline-block';
        this.gameElements.endGameBtn.style.display = 'none';
        
        this.gameState.target.visible = false;
        this.gameElements.target.style.display = 'none';
    }
    
    /**
     * 센서 데이터 처리
     */
    handleSensorData(data) {
        if (!this.gameState.isPlaying) return;
        
        this.gameState.sensorData.set(data.sensorId, data.data);
        
        // 센서별 플레이어 확인
        let playerKey = null;
        if (data.sensorId === this.gameState.players.player1.sensorId) {
            playerKey = 'player1';
        } else if (data.sensorId === this.gameState.players.player2.sensorId) {
            playerKey = 'player2';
        }
        
        if (playerKey) {
            // 센서 데이터 표시
            this.updateSensorDisplay(playerKey, data.data);
            
            // 게임 로직 적용
            this.updatePlayerFromSensor(playerKey, data.data);
        }
    }
    
    /**
     * 센서 데이터로 플레이어 업데이트
     */
    updatePlayerFromSensor(playerKey, sensorData) {
        const player = this.gameState.players[playerKey];
        const { accelerometer, gyroscope } = sensorData;
        
        if (accelerometer) {
            // 가속도계 데이터로 플레이어 위치 조정
            const sensitivity = 8;
            player.position.x += accelerometer.x * sensitivity;
            player.position.y += accelerometer.y * sensitivity;
            
            // 경계 제한
            player.position.x = Math.max(25, Math.min(575, player.position.x));
            player.position.y = Math.max(25, Math.min(475, player.position.y));
            
            this.updatePlayerPosition(playerKey);
        }
        
        // 움직임에 따른 개인 점수 증가
        if (gyroscope) {
            const movement = Math.abs(gyroscope.x) + Math.abs(gyroscope.y) + Math.abs(gyroscope.z);
            if (movement > 0.15) {
                player.points += Math.floor(movement * 5);
                this.updateScore();
            }
        }
    }
    
    /**
     * 플레이어 위치 업데이트
     */
    updatePlayerPosition(playerKey) {
        const player = this.gameState.players[playerKey];
        const element = this.gameElements.players.get(playerKey);
        
        element.style.left = player.position.x + 'px';
        element.style.top = player.position.y + 'px';
    }
    
    /**
     * 모든 위치 업데이트
     */
    updateAllPositions() {
        this.updatePlayerPosition('player1');
        this.updatePlayerPosition('player2');
    }
    
    /**
     * 타겟 생성
     */
    spawnTarget() {
        this.gameState.target = {
            x: Math.random() * 500 + 50,
            y: Math.random() * 400 + 50,
            visible: true
        };
        
        this.gameElements.target.style.left = this.gameState.target.x + 'px';
        this.gameElements.target.style.top = this.gameState.target.y + 'px';
        this.gameElements.target.style.display = 'block';
    }
    
    /**
     * 점수 업데이트
     */
    updateScore() {
        this.gameElements.teamScore.textContent = this.gameState.score;
        this.gameElements.player1Score.textContent = this.gameState.players.player1.points;
        this.gameElements.player2Score.textContent = this.gameState.players.player2.points;
    }
    
    /**
     * 센서 데이터 표시 업데이트
     */
    updateSensorDisplay(playerKey, sensorData) {
        const sensorNum = playerKey === 'player1' ? '1' : '2';
        
        if (sensorData.accelerometer) {
            const accel = sensorData.accelerometer;
            this.gameElements[`sensor${sensorNum}Accel`].textContent = 
                `X: ${accel.x.toFixed(2)}, Y: ${accel.y.toFixed(2)}, Z: ${accel.z.toFixed(2)}`;
        }
        
        if (sensorData.gyroscope) {
            const gyro = sensorData.gyroscope;
            this.gameElements[`sensor${sensorNum}Gyro`].textContent = 
                `X: ${gyro.x.toFixed(2)}, Y: ${gyro.y.toFixed(2)}, Z: ${gyro.z.toFixed(2)}`;
        }
    }
    
    /**
     * 게임 루프 시작
     */
    startGameLoop() {
        const gameLoop = () => {
            if (this.gameState.isPlaying) {
                this.updateGame();
                requestAnimationFrame(gameLoop);
            }
        };
        
        requestAnimationFrame(gameLoop);
    }
    
    /**
     * 게임 업데이트
     */
    updateGame() {
        if (!this.gameState.target.visible) return;
        
        // 두 플레이어가 모두 타겟 근처에 있는지 확인
        const player1Distance = this.getDistance(
            this.gameState.players.player1.position,
            this.gameState.target
        );
        const player2Distance = this.getDistance(
            this.gameState.players.player2.position,
            this.gameState.target
        );
        
        const targetRadius = 60;
        
        if (player1Distance < targetRadius && player2Distance < targetRadius) {
            // 협력 성공!
            this.gameState.score += 100;
            this.gameState.players.player1.points += 50;
            this.gameState.players.player2.points += 50;
            
            this.updateScore();
            this.spawnTarget(); // 새 타겟 생성
            
            // 시각적 효과
            this.showSuccessEffect();
        }
    }
    
    /**
     * 두 점 사이의 거리 계산
     */
    getDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 성공 효과 표시
     */
    showSuccessEffect() {
        // 타겟에 반짝이는 효과 추가
        this.gameElements.target.style.animation = 'success-flash 0.5s ease-in-out';
        
        setTimeout(() => {
            this.gameElements.target.style.animation = '';
        }, 500);
    }
    
    /**
     * 상태 업데이트
     */
    updateStatus(message) {
        this.gameElements.connectionStatus.textContent = message;
    }
    
    /**
     * 세션 코드 표시
     */
    showSessionCode(code) {
        this.gameElements.sessionCodeValue.textContent = code;
        this.gameElements.sessionCode.style.display = 'block';
    }
    
    /**
     * 센서 대기 UI 표시
     */
    showSensorWaiting() {
        this.gameElements.sensorStatus.style.display = 'block';
        this.gameElements.sensorInstructions.style.display = 'block';
    }
    
    /**
     * 센서 상태 업데이트
     */
    updateSensorStatus(message) {
        this.gameElements.sensorStatusValue.textContent = message;
    }
    
    /**
     * 게임 시작 버튼 표시
     */
    showStartButton() {
        this.gameElements.startSessionBtn.style.display = 'inline-block';
    }
    
    /**
     * 게임 시작 버튼 숨기기
     */
    hideStartButton() {
        this.gameElements.startSessionBtn.style.display = 'none';
    }
    
    /**
     * 게임 준비 버튼 표시
     */
    showGameReadyButton() {
        this.gameElements.startGameBtn.style.display = 'inline-block';
        this.gameElements.sensorInstructions.style.display = 'none';
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
            .dual-game {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 900px;
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
            
            .status-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            
            .label {
                font-weight: 600;
                color: #555;
            }
            
            .value.code {
                font-family: 'Courier New', monospace;
                background: #e3f2fd;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 1.2em;
            }
            
            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 6px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin: 0 5px;
                transition: all 0.2s;
            }
            
            .btn.primary { background: #007bff; color: white; }
            .btn.success { background: #28a745; color: white; }
            .btn.danger { background: #dc3545; color: white; }
            
            .instructions {
                background: #e7f3ff;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #007bff;
                margin-bottom: 20px;
            }
            
            .sensor-assignment {
                margin-top: 15px;
                display: flex;
                gap: 20px;
            }
            
            .sensor-info {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .sensor-color {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 4px rgba(0,0,0,0.3);
            }
            
            .player1-color { background: #ff6b6b; }
            .player2-color { background: #4ecdc4; }
            
            .game-area {
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .score-panel {
                text-align: center;
                margin-bottom: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 20px;
                background: #f8f9fa;
                border-radius: 6px;
            }
            
            .team-score {
                font-size: 20px;
                font-weight: bold;
                color: #007bff;
            }
            
            .player-scores {
                display: flex;
                gap: 20px;
            }
            
            .player-score {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
            }
            
            .player-color {
                width: 12px;
                height: 12px;
                border-radius: 50%;
            }
            
            .play-area {
                position: relative;
                width: 600px;
                height: 500px;
                border: 2px solid #ddd;
                border-radius: 8px;
                margin: 0 auto;
                background: linear-gradient(45deg, #f8f9fa 25%, transparent 25%), 
                           linear-gradient(-45deg, #f8f9fa 25%, transparent 25%), 
                           linear-gradient(45deg, transparent 75%, #f8f9fa 75%), 
                           linear-gradient(-45deg, transparent 75%, #f8f9fa 75%);
                background-size: 20px 20px;
                background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
            }
            
            .player {
                position: absolute;
                width: 35px;
                height: 35px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: all 0.1s ease-out;
                transform: translate(-50%, -50%);
            }
            
            .player1 {
                background: radial-gradient(circle at 30% 30%, #ff8a80, #ff6b6b);
            }
            
            .player2 {
                background: radial-gradient(circle at 30% 30%, #80deea, #4ecdc4);
            }
            
            .target {
                position: absolute;
                width: 120px;
                height: 120px;
                border: 4px dashed #007bff;
                border-radius: 50%;
                background: rgba(0, 123, 255, 0.1);
                transform: translate(-50%, -50%);
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(1.1); }
            }
            
            @keyframes success-flash {
                0%, 100% { background: rgba(0, 123, 255, 0.1); }
                50% { background: rgba(40, 167, 69, 0.3); }
            }
            
            .sensor-data-display {
                position: absolute;
                top: 10px;
                left: 10px;
                background: rgba(255, 255, 255, 0.95);
                padding: 10px;
                border-radius: 6px;
                font-size: 11px;
                font-family: 'Courier New', monospace;
                line-height: 1.3;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 200px;
            }
            
            .sensor-section {
                margin-bottom: 10px;
            }
            
            .sensor-section h4 {
                margin: 0 0 5px 0;
                font-size: 12px;
                color: #555;
            }
            
            .game-instructions {
                position: absolute;
                bottom: 10px;
                right: 10px;
                background: rgba(255, 255, 255, 0.95);
                padding: 10px;
                border-radius: 6px;
                font-size: 12px;
                max-width: 250px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .game-instructions h4 {
                margin: 0 0 5px 0;
                color: #007bff;
            }
            
            .game-instructions p {
                margin: 3px 0;
                line-height: 1.3;
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
            
            .game-controls {
                text-align: center;
                margin-bottom: 20px;
            }
        `;
        
        document.head.appendChild(style);
    }
}

// 브라우저 환경에서 자동 시작
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dualGame = new DualGameExample();
    });
}
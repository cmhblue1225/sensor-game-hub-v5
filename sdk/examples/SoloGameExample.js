/**
 * 🎮 솔로 게임 예제
 * 
 * 단일 센서를 사용하는 간단한 게임 구현 예제
 * - 센서 연결 대기
 * - 센서 데이터 실시간 처리
 * - 게임 상태 관리
 */

class SoloGameExample {
    constructor() {
        this.sdk = null;
        this.gameState = {
            isPlaying: false,
            score: 0,
            playerPosition: { x: 0, y: 0 },
            sensorData: null
        };
        
        this.gameElements = {
            connectionStatus: null,
            sessionCode: null,
            sensorStatus: null,
            gameArea: null,
            scoreDisplay: null,
            player: null
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
            gameId: 'solo-tilt-ball',
            gameTitle: '솔로 틸트 볼 게임',
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
            this.updateSensorStatus(`센서 연결됨 (${data.connectedCount}/${data.totalExpected})`);
            
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
            <div class="solo-game">
                <div class="game-header">
                    <h1>🎮 솔로 틸트 볼 게임</h1>
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
                        게임 세션 시작
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
                    <p>1. 모바일 기기에서 센서 클라이언트 페이지를 열어주세요</p>
                    <p>2. 위에 표시된 <strong>세션 코드</strong>를 입력해주세요</p>
                    <p>3. 센서가 연결되면 게임을 시작할 수 있습니다</p>
                </div>
                
                <div id="game-area" class="game-area" style="display: none;">
                    <div class="score-display">
                        <span>점수: <span id="score">0</span></span>
                    </div>
                    <div class="play-area">
                        <div id="player" class="player"></div>
                        <div class="sensor-data-display">
                            <div>가속도: <span id="accel-display">-</span></div>
                            <div>자이로: <span id="gyro-display">-</span></div>
                            <div>방향: <span id="orientation-display">-</span></div>
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
            scoreDisplay: document.getElementById('score'),
            player: document.getElementById('player'),
            accelDisplay: document.getElementById('accel-display'),
            gyroDisplay: document.getElementById('gyro-display'),
            orientationDisplay: document.getElementById('orientation-display'),
            errorMessage: document.getElementById('error-message'),
            startSessionBtn: document.getElementById('start-session-btn'),
            startGameBtn: document.getElementById('start-game-btn'),
            endGameBtn: document.getElementById('end-game-btn')
        };
        
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
            await this.sdk.startSoloGame({
                gameMode: 'tilt-ball',
                difficulty: 'normal'
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
        this.gameState.playerPosition = { x: 250, y: 250 }; // 중앙
        
        this.updateStatus('게임 진행 중');
        this.gameElements.gameArea.style.display = 'block';
        this.gameElements.startGameBtn.style.display = 'none';
        this.gameElements.endGameBtn.style.display = 'inline-block';
        
        this.updatePlayerPosition();
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
    }
    
    /**
     * 센서 데이터 처리
     */
    handleSensorData(data) {
        if (!this.gameState.isPlaying) return;
        
        this.gameState.sensorData = data.data;
        
        // 센서 데이터 표시
        this.updateSensorDisplay(data.data);
        
        // 게임 로직 적용
        this.updateGameFromSensor(data.data);
    }
    
    /**
     * 센서 데이터로 게임 업데이트
     */
    updateGameFromSensor(sensorData) {
        const { accelerometer, gyroscope, orientation } = sensorData;
        
        if (accelerometer) {
            // 가속도계 데이터로 플레이어 위치 조정
            const sensitivity = 10;
            this.gameState.playerPosition.x += accelerometer.x * sensitivity;
            this.gameState.playerPosition.y += accelerometer.y * sensitivity;
            
            // 경계 제한
            this.gameState.playerPosition.x = Math.max(25, Math.min(475, this.gameState.playerPosition.x));
            this.gameState.playerPosition.y = Math.max(25, Math.min(475, this.gameState.playerPosition.y));
            
            this.updatePlayerPosition();
        }
        
        // 움직임에 따른 점수 증가
        if (gyroscope) {
            const movement = Math.abs(gyroscope.x) + Math.abs(gyroscope.y) + Math.abs(gyroscope.z);
            if (movement > 0.1) {
                this.gameState.score += Math.floor(movement * 10);
                this.updateScore();
            }
        }
    }
    
    /**
     * 플레이어 위치 업데이트
     */
    updatePlayerPosition() {
        const { x, y } = this.gameState.playerPosition;
        this.gameElements.player.style.left = x + 'px';
        this.gameElements.player.style.top = y + 'px';
    }
    
    /**
     * 점수 업데이트
     */
    updateScore() {
        this.gameElements.scoreDisplay.textContent = this.gameState.score;
    }
    
    /**
     * 센서 데이터 표시 업데이트
     */
    updateSensorDisplay(sensorData) {
        if (sensorData.accelerometer) {
            const accel = sensorData.accelerometer;
            this.gameElements.accelDisplay.textContent = 
                `X: ${accel.x.toFixed(2)}, Y: ${accel.y.toFixed(2)}, Z: ${accel.z.toFixed(2)}`;
        }
        
        if (sensorData.gyroscope) {
            const gyro = sensorData.gyroscope;
            this.gameElements.gyroDisplay.textContent = 
                `X: ${gyro.x.toFixed(2)}, Y: ${gyro.y.toFixed(2)}, Z: ${gyro.z.toFixed(2)}`;
        }
        
        if (sensorData.orientation) {
            const orient = sensorData.orientation;
            this.gameElements.orientationDisplay.textContent = 
                `α: ${orient.alpha?.toFixed(2) || 'N/A'}, β: ${orient.beta?.toFixed(2) || 'N/A'}, γ: ${orient.gamma?.toFixed(2) || 'N/A'}`;
        }
    }
    
    /**
     * 게임 루프 시작
     */
    startGameLoop() {
        const gameLoop = () => {
            if (this.gameState.isPlaying) {
                // 게임 업데이트 로직
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
        // 여기에 게임별 업데이트 로직 추가
        // 예: 충돌 감지, 아이템 생성 등
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
            .solo-game {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 800px;
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
            
            .status-item:last-child {
                margin-bottom: 0;
            }
            
            .label {
                font-weight: 600;
                color: #555;
            }
            
            .value {
                color: #333;
            }
            
            .value.code {
                font-family: 'Courier New', monospace;
                background: #e3f2fd;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 1.2em;
            }
            
            .game-controls {
                text-align: center;
                margin-bottom: 20px;
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
            
            .btn.primary {
                background: #007bff;
                color: white;
            }
            
            .btn.primary:hover {
                background: #0056b3;
            }
            
            .btn.success {
                background: #28a745;
                color: white;
            }
            
            .btn.success:hover {
                background: #1e7e34;
            }
            
            .btn.danger {
                background: #dc3545;
                color: white;
            }
            
            .btn.danger:hover {
                background: #c82333;
            }
            
            .instructions {
                background: #e7f3ff;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #007bff;
                margin-bottom: 20px;
            }
            
            .instructions h3 {
                margin-top: 0;
                color: #007bff;
            }
            
            .game-area {
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            
            .score-display {
                text-align: center;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #28a745;
            }
            
            .play-area {
                position: relative;
                width: 500px;
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
                width: 40px;
                height: 40px;
                background: radial-gradient(circle at 30% 30%, #4fc3f7, #1976d2);
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4);
                transition: all 0.1s ease-out;
                transform: translate(-50%, -50%);
            }
            
            .sensor-data-display {
                position: absolute;
                top: 10px;
                left: 10px;
                background: rgba(255, 255, 255, 0.9);
                padding: 10px;
                border-radius: 6px;
                font-size: 12px;
                font-family: 'Courier New', monospace;
                line-height: 1.4;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
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
        `;
        
        document.head.appendChild(style);
    }
}

// 브라우저 환경에서 자동 시작
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.soloGame = new SoloGameExample();
    });
}
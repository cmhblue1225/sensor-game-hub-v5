/**
 * 🎮 듀얼 센서 테스트 게임 v6.0
 * 
 * v6.0 SDK 기반 듀얼 센서 협조 게임
 * - 두 개의 센서로 각각 다른 공을 조종
 * - 협조 플레이를 통한 미션 완료
 * - 점수 시스템 및 미션 진행
 */

class DualSensorTestGameV6 {
    constructor() {
        // v6.0 SDK 초기화
        this.sdk = new SensorGameSDK({
            serverUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
            gameId: 'dual-sensor-test',
            gameTitle: '듀얼 센서 테스트',
            debug: true
        });
        
        // 게임 요소들
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        this.isGameRunning = false;
        
        // 게임 오브젝트들
        this.balls = {
            sensor1: {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                radius: 20,
                color: '#3b82f6',
                trail: [],
                isActive: false
            },
            sensor2: {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                radius: 20,
                color: '#ef4444',
                trail: [],
                isActive: false
            }
        };
        
        this.targets = {
            sensor1: { x: 0, y: 0, radius: 30, completed: false },
            sensor2: { x: 0, y: 0, radius: 30, completed: false }
        };
        
        this.particles = [];
        this.backgroundHue = 220;
        this.score = 0;
        this.missionCount = 0;
        this.currentMission = null;
        
        // 센서 연결 상태
        this.sensorConnections = {
            sensor1: false,
            sensor2: false
        };
        
        // 게임 설정
        this.config = {
            ballSpeed: 6,
            friction: 0.94,
            bounceStrength: 0.8,
            particleCount: 10,
            particleLifetime: 40,
            trailLength: 15,
            scoreMultiplier: 50,
            missionScoreBonus: 500
        };
        
        // 세션 네비게이션 매니저
        this.navigationManager = null;
        
        this.initializeGame();
    }
    
    /**
     * 게임 진입시 즉시 세션 생성
     */
    createGameSession() {
        console.log('🎮 게임 세션 생성 중...');
        
        // 세션 생성 UI 표시
        this.showSessionCreationUI();
        
        // SDK를 통해 세션 생성
        this.sdk.createSession('dual')
            .then(sessionCode => {
                console.log(`✅ 게임 세션 생성 완료: ${sessionCode}`);
                this.displaySessionInfo(sessionCode);
            })
            .catch(error => {
                console.error('❌ 세션 생성 실패:', error);
                this.showError('세션 생성에 실패했습니다. 페이지를 새로고침해주세요.');
            });
    }
    
    /**
     * 세션 정보 UI 표시
     */
    displaySessionInfo(sessionCode) {
        const sessionPanel = document.getElementById('sessionInfoPanel');
        const sessionCodeDisplay = document.getElementById('sessionCodeDisplay');
        const qrContainer = document.getElementById('qrCodeContainer');
        
        // 세션 코드 표시
        sessionCodeDisplay.textContent = sessionCode;
        
        // QR 코드 생성
        const sensorUrl = `${window.location.origin}/client/sensor-v6.html?session=${sessionCode}`;
        if (typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: sensorUrl,
                width: 120,
                height: 120,
                colorDark: '#3b82f6',
                colorLight: '#ffffff'
            });
        }
        
        // 세션 패널 표시
        sessionPanel.classList.remove('hidden');
        
        // 대기 메시지 업데이트
        this.updateGameStatus('센서 연결 대기 중... 위 코드를 모바일에서 입력하세요');
    }
    
    /**
     * 세션 생성 UI 표시
     */
    showSessionCreationUI() {
        this.updateGameStatus('게임 세션 생성 중...');
        const waitingPanel = document.getElementById('waitingPanel');
        if (waitingPanel) {
            waitingPanel.classList.remove('hidden');
        }
    }
    
    /**
     * 게임 상태 메시지 업데이트
     */
    updateGameStatus(message) {
        const statusText = document.getElementById('gameStatusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }
    
    /**
     * 에러 메시지 표시
     */
    showError(message) {
        const errorPanel = document.createElement('div');
        errorPanel.className = 'error-panel';
        errorPanel.innerHTML = `
            <div class="error-content">
                <h3>⚠️ 오류</h3>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn btn-primary">새로고침</button>
            </div>
        `;
        document.body.appendChild(errorPanel);
    }
    
    /**
     * 게임 초기화
     */
    initializeGame() {
        console.log('🎮 듀얼 센서 테스트 게임 v6.0 초기화');
        
        this.setupCanvas();
        this.setupSDKEvents();
        this.generateNewMission();
        
        // 네비게이션 매니저 설정
        if (typeof SessionNavigationManager !== 'undefined') {
            this.navigationManager = new SessionNavigationManager(this.sdk);
        }
        
        // 게임 진입시 즉시 세션 생성
        this.createGameSession();
        
        // 초기 UI 상태
        this.updateGameStatus('SDK 연결 중...');
        
        // SDK 연결 시작
        this.connectToServer();
    }
    
    /**
     * 캔버스 설정
     */
    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // 키보드 이벤트 (테스트용)
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'r':
                case 'R':
                    this.reset();
                    break;
                case 'n':
                case 'N':
                    this.startNewMission();
                    break;
                case ' ':
                    e.preventDefault();
                    this.createParticles(window.innerWidth / 2, window.innerHeight / 2, 15);
                    break;
            }
        });
        
        // 마우스/터치 이벤트 (테스트용)
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.createParticles(x, y, 8);
        });
    }
    
    /**
     * 캔버스 크기 조정
     */
    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        // 볼 초기 위치 설정
        this.resetBallPositions();
    }
    
    /**
     * 볼 초기 위치 설정
     */
    resetBallPositions() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.balls.sensor1.x = width * 0.25;
        this.balls.sensor1.y = height * 0.5;
        
        this.balls.sensor2.x = width * 0.75;
        this.balls.sensor2.y = height * 0.5;
    }
    
    /**
     * SDK 이벤트 설정
     */
    setupSDKEvents() {
        // 서버 연결 이벤트
        this.sdk.on('connected', () => {
            console.log('✅ 서버 연결 성공');
            this.updateServerStatus(true);
            this.updateGameStatus('서버 연결됨 - 게임 시작 가능');
        });
        
        this.sdk.on('disconnected', () => {
            console.log('❌ 서버 연결 끊김');
            this.updateServerStatus(false);
            this.updateGameStatus('서버 연결 끊김');
        });
        
        // 세션 이벤트
        this.sdk.on('sessionCreated', (data) => {
            console.log('🔑 세션 생성됨:', data);
            this.onSessionCreated(data);
        });
        
        // 센서 이벤트
        this.sdk.on('sensorConnected', (data) => {
            console.log('📱 센서 연결됨:', data);
            this.onSensorConnected(data);
        });
        
        this.sdk.on('sensorData', (data) => {
            this.onSensorData(data);
        });
        
        // 게임 이벤트
        this.sdk.on('gameStarted', (data) => {
            console.log('🎮 게임 시작됨:', data);
            this.onGameStarted(data);
        });
        
        this.sdk.on('gameEnded', (data) => {
            console.log('🏁 게임 종료됨:', data);
            this.onGameEnded(data);
        });
        
        // 에러 이벤트
        this.sdk.on('error', (error) => {
            console.error('❌ SDK 에러:', error);
            this.updateGameStatus(`오류: ${error.context || '알 수 없음'}`);
        });
        
        this.sdk.on('serverError', (error) => {
            console.error('❌ 서버 에러:', error);
            this.updateGameStatus(`서버 오류: ${error.message}`);
        });
    }
    
    /**
     * 서버 연결
     */
    async connectToServer() {
        try {
            await this.sdk.connect();
        } catch (error) {
            console.error('서버 연결 실패:', error);
            this.updateGameStatus('서버 연결 실패');
        }
    }
    
    // ========== SDK 이벤트 핸들러들 ==========
    
    /**
     * 세션 생성됨
     */
    onSessionCreated(data) {
        this.updateGameStatus(`세션 코드: ${data.sessionCode} - 두 센서 연결 대기`);
        this.showSessionInfo(data.sessionCode);
        this.hideInstructionPanel();
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(data) {
        const sensorId = data.sensorId;
        
        console.log('📱 센서 연결됨:', data);
        
        // 센서 ID에 따라 연결 상태 업데이트
        if (sensorId === 'sensor1' || data.connectedCount === 1) {
            this.sensorConnections.sensor1 = true;
            this.updateSensorStatus('sensor1', true);
            this.balls.sensor1.isActive = true;
            console.log('✅ 센서 1 연결됨');
        } else if (sensorId === 'sensor2' || data.connectedCount === 2) {
            this.sensorConnections.sensor2 = true;
            this.updateSensorStatus('sensor2', true);
            this.balls.sensor2.isActive = true;
            console.log('✅ 센서 2 연결됨');
        }
        
        console.log('센서 연결 상태:', this.sensorConnections);
        
        // 연결된 센서 수에 따라 상태 업데이트
        if (data.connectedCount === 1) {
            this.updateGameStatus('센서 1 연결됨 - 센서 2 연결 대기');
            this.hideSessionInfo(); // 세션 정보 숨기기
        } else if (data.connectedCount >= 2 || data.isReady) {
            this.updateGameStatus('모든 센서 연결됨 - 게임 시작!');
            this.hideSessionInfo(); // 세션 정보 완전 숨기기
            
            // 모든 센서 연결되면 즉시 게임 시작
            console.log('🎮 듀얼 센서 게임 시작!');
            this.startDualSensorGame();
        }
    }
    
    /**
     * 세션 정보 숨기기
     */
    hideSessionInfo() {
        const sessionPanel = document.getElementById('sessionInfoPanel');
        const waitingPanel = document.getElementById('waitingPanel');
        
        if (sessionPanel) {
            sessionPanel.classList.add('hidden');
        }
        if (waitingPanel) {
            waitingPanel.classList.add('hidden');
        }
    }
    
    /**
     * 듀얼 센서 게임 시작
     */
    startDualSensorGame() {
        console.log('🎮 듀얼 센서 게임 시작!');
        
        // 게임 상태 변경
        this.isGameRunning = true;
        
        // UI 업데이트
        this.updateGameStatus('게임 진행 중...');
        
        // 공 위치 초기화
        this.resetBallPositions();
        
        // 게임 루프 시작
        if (!this.gameLoop) {
            this.startGameLoop();
        }
        
        // 미션 UI 표시
        this.showGameUI();
        
        // 게임 시작 이벤트 전송
        this.sdk.sendGameEvent({
            type: 'dual_game_started',
            timestamp: Date.now()
        });
    }
    
    /**
     * 공 위치 초기화
     */
    resetBallPositions() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // 센서 1 공 (왼쪽)
        this.balls.sensor1.x = centerX - 100;
        this.balls.sensor1.y = centerY;
        this.balls.sensor1.vx = 0;
        this.balls.sensor1.vy = 0;
        this.balls.sensor1.trail = [];
        
        // 센서 2 공 (오른쪽)
        this.balls.sensor2.x = centerX + 100;
        this.balls.sensor2.y = centerY;
        this.balls.sensor2.vx = 0;
        this.balls.sensor2.vy = 0;
        this.balls.sensor2.trail = [];
    }
    
    /**
     * 게임 UI 표시
     */
    showGameUI() {
        const gameUI = document.getElementById('gameUI');
        const missionPanel = document.getElementById('missionPanel');
        
        if (gameUI) {
            gameUI.classList.remove('hidden');
        }
        if (missionPanel) {
            missionPanel.classList.remove('hidden');
        }
        
        // 점수 초기화
        this.updateScoreDisplay();
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(data) {
        if (!this.isGameRunning) return;
        
        const sensorId = data.sensorId;
        const sensorData = data.data;
        
        // 센서 데이터 처리
        const processedData = this.processSensorData(sensorData);
        
        // 해당 센서의 볼 움직임 업데이트
        if (sensorId === 'sensor1' || sensorId === 'sensor_1') {
            this.updateBallMovement('sensor1', processedData.tilt);
        } else if (sensorId === 'sensor2' || sensorId === 'sensor_2') {
            this.updateBallMovement('sensor2', processedData.tilt);
        } else {
            // 센서 ID가 명확하지 않은 경우, 연결 순서로 판단
            const connectedSensors = Object.keys(this.sensorConnections).filter(id => this.sensorConnections[id]);
            if (connectedSensors.length === 1) {
                this.updateBallMovement('sensor1', processedData.tilt);
            } else if (connectedSensors.length === 2) {
                // 두 번째 연결된 센서는 sensor2로 처리
                this.updateBallMovement('sensor2', processedData.tilt);
            }
        }
        
        // 흔들기 파티클 효과
        if (processedData.shake && processedData.shake.detected) {
            const ball = sensorId === 'sensor1' ? this.balls.sensor1 : this.balls.sensor2;
            this.createShakeParticles(ball.x, ball.y, processedData.shake.intensity);
        }
        
        // 배경색 변화
        this.updateBackgroundColor(processedData.rotation);
        
        // 점수 업데이트
        this.updateScore(processedData);
    }
    
    /**
     * 게임 시작됨
     */
    onGameStarted(data) {
        this.updateGameStatus('게임 진행 중! 두 공을 목표에 도달시키세요');
        this.showGamePanels();
        this.startGameLoop();
    }
    
    /**
     * 게임 종료됨
     */
    onGameEnded(data) {
        this.stopGameLoop();
        this.updateGameStatus('게임 종료됨');
    }
    
    // ========== 센서 데이터 처리 ==========
    
    /**
     * 센서 데이터 처리
     */
    processSensorData(rawData) {
        const processed = {
            tilt: { x: 0, y: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            movement: { x: 0, y: 0, z: 0 },
            shake: { detected: false, intensity: 0 }
        };
        
        // 기울기 (DeviceOrientationEvent)
        if (rawData.orientation) {
            processed.tilt.x = this.normalizeValue(rawData.orientation.gamma, -45, 45) * 0.6;
            processed.tilt.y = this.normalizeValue(rawData.orientation.beta, -45, 45) * 0.6;
        }
        
        // 회전 (DeviceMotionEvent - rotationRate)
        if (rawData.motion && rawData.motion.rotationRate) {
            processed.rotation.x = rawData.motion.rotationRate.beta || 0;
            processed.rotation.y = rawData.motion.rotationRate.gamma || 0;
            processed.rotation.z = rawData.motion.rotationRate.alpha || 0;
        }
        
        // 가속도 (DeviceMotionEvent - acceleration)
        if (rawData.motion && rawData.motion.acceleration) {
            processed.movement.x = rawData.motion.acceleration.x || 0;
            processed.movement.y = rawData.motion.acceleration.y || 0;
            processed.movement.z = rawData.motion.acceleration.z || 0;
            
            // 흔들기 감지
            const totalAccel = Math.abs(processed.movement.x) + Math.abs(processed.movement.y) + Math.abs(processed.movement.z);
            if (totalAccel > 12) {
                processed.shake.detected = true;
                processed.shake.intensity = Math.min(totalAccel / 25, 1);
            }
        }
        
        return processed;
    }
    
    /**
     * 값 정규화
     */
    normalizeValue(value, min, max) {
        if (value < min) return -1;
        if (value > max) return 1;
        return (value - min) / (max - min) * 2 - 1;
    }
    
    // ========== 게임 로직 ==========
    
    /**
     * 게임 루프 시작
     */
    startGameLoop() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        this.isGameRunning = true;
        
        const loop = () => {
            if (this.isGameRunning) {
                this.update();
                this.render();
                this.gameLoop = requestAnimationFrame(loop);
            }
        };
        
        this.gameLoop = requestAnimationFrame(loop);
    }
    
    /**
     * 게임 루프 중지
     */
    stopGameLoop() {
        this.isGameRunning = false;
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
            this.gameLoop = null;
        }
    }
    
    /**
     * 게임 업데이트
     */
    update() {
        // 두 볼 물리 업데이트
        this.updateBallPhysics('sensor1');
        this.updateBallPhysics('sensor2');
        
        // 파티클 업데이트
        this.updateParticles();
        
        // 볼 궤적 업데이트
        this.updateBallTrail('sensor1');
        this.updateBallTrail('sensor2');
        
        // 미션 체크
        this.checkMissionCompletion();
    }
    
    /**
     * 볼 움직임 업데이트 (센서 기울기 기반)
     */
    updateBallMovement(ballId, tilt) {
        const ball = this.balls[ballId];
        if (!ball || !ball.isActive) return;
        
        // 기울기를 속도로 변환
        ball.vx += tilt.x * this.config.ballSpeed;
        ball.vy += tilt.y * this.config.ballSpeed;
        
        // 최대 속도 제한
        const maxSpeed = 12;
        ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vx));
        ball.vy = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vy));
    }
    
    /**
     * 볼 물리 업데이트
     */
    updateBallPhysics(ballId) {
        const ball = this.balls[ballId];
        if (!ball || !ball.isActive) return;
        
        // 위치 업데이트
        ball.x += ball.vx;
        ball.y += ball.vy;
        
        // 마찰력 적용
        ball.vx *= this.config.friction;
        ball.vy *= this.config.friction;
        
        // 경계 충돌 처리
        const radius = ball.radius;
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        if (ball.x - radius < 0) {
            ball.x = radius;
            ball.vx *= -this.config.bounceStrength;
            this.createParticles(ball.x, ball.y, 5);
        }
        
        if (ball.x + radius > width) {
            ball.x = width - radius;
            ball.vx *= -this.config.bounceStrength;
            this.createParticles(ball.x, ball.y, 5);
        }
        
        if (ball.y - radius < 0) {
            ball.y = radius;
            ball.vy *= -this.config.bounceStrength;
            this.createParticles(ball.x, ball.y, 5);
        }
        
        if (ball.y + radius > height) {
            ball.y = height - radius;
            ball.vy *= -this.config.bounceStrength;
            this.createParticles(ball.x, ball.y, 5);
        }
    }
    
    /**
     * 볼 궤적 업데이트
     */
    updateBallTrail(ballId) {
        const ball = this.balls[ballId];
        if (!ball || !ball.isActive) return;
        
        // 현재 위치를 궤적에 추가
        ball.trail.push({
            x: ball.x,
            y: ball.y,
            life: this.config.trailLength
        });
        
        // 오래된 궤적 제거
        ball.trail = ball.trail.filter(point => {
            point.life--;
            return point.life > 0;
        });
        
        // 최대 길이 제한
        if (ball.trail.length > this.config.trailLength) {
            ball.trail.shift();
        }
    }
    
    /**
     * 흔들기 파티클 생성
     */
    createShakeParticles(x, y, intensity) {
        const count = Math.min(intensity * 5, this.config.particleCount);
        this.createParticles(x, y, count);
    }
    
    /**
     * 파티클 생성
     */
    createParticles(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 25,
                y: y + (Math.random() - 0.5) * 25,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: this.config.particleLifetime,
                size: Math.random() * 3 + 1,
                color: `hsl(${this.backgroundHue}, 70%, 60%)`
            });
        }
    }
    
    /**
     * 파티클 업데이트
     */
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.98;
            particle.vy *= 0.98;
            particle.life--;
            particle.size *= 0.97;
            
            if (particle.life <= 0 || particle.size < 0.5) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    /**
     * 배경색 업데이트
     */
    updateBackgroundColor(rotation) {
        const rotationIntensity = Math.abs(rotation.x) + Math.abs(rotation.y) + Math.abs(rotation.z);
        
        if (rotationIntensity > 0.1) {
            this.backgroundHue += rotationIntensity * 1.5;
            this.backgroundHue = this.backgroundHue % 360;
        }
    }
    
    /**
     * 점수 업데이트
     */
    updateScore(sensorData) {
        const tiltIntensity = Math.abs(sensorData.tilt.x) + Math.abs(sensorData.tilt.y);
        const shakeIntensity = sensorData.shake.detected ? sensorData.shake.intensity : 0;
        const rotationIntensity = Math.abs(sensorData.rotation.x) + Math.abs(sensorData.rotation.y) + Math.abs(sensorData.rotation.z);
        
        const totalIntensity = tiltIntensity + shakeIntensity + rotationIntensity;
        if (totalIntensity > 0.05) {
            this.score += Math.floor(totalIntensity * this.config.scoreMultiplier);
            this.updateScoreDisplay();
        }
    }
    
    /**
     * 새 미션 생성
     */
    generateNewMission() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const margin = 80;
        
        // 목표 위치 랜덤 생성 (서로 충분히 떨어져 있도록)
        this.targets.sensor1.x = margin + Math.random() * (width - margin * 2);
        this.targets.sensor1.y = margin + Math.random() * (height - margin * 2);
        
        // sensor2 목표는 sensor1과 충분히 떨어뜨리기
        do {
            this.targets.sensor2.x = margin + Math.random() * (width - margin * 2);
            this.targets.sensor2.y = margin + Math.random() * (height - margin * 2);
        } while (this.getDistance(this.targets.sensor1, this.targets.sensor2) < 150);
        
        // 완료 상태 초기화
        this.targets.sensor1.completed = false;
        this.targets.sensor2.completed = false;
        
        this.updateMissionDisplay();
        
        console.log('새 미션 생성:', this.targets);
    }
    
    /**
     * 미션 완료 체크
     */
    checkMissionCompletion() {
        // sensor1 볼과 목표 거리 체크
        if (!this.targets.sensor1.completed && this.balls.sensor1.isActive) {
            const distance1 = this.getDistance(this.balls.sensor1, this.targets.sensor1);
            if (distance1 < this.targets.sensor1.radius) {
                this.targets.sensor1.completed = true;
                this.createParticles(this.targets.sensor1.x, this.targets.sensor1.y, 20);
                this.updateTargetDisplay('sensor1', true);
            }
        }
        
        // sensor2 볼과 목표 거리 체크
        if (!this.targets.sensor2.completed && this.balls.sensor2.isActive) {
            const distance2 = this.getDistance(this.balls.sensor2, this.targets.sensor2);
            if (distance2 < this.targets.sensor2.radius) {
                this.targets.sensor2.completed = true;
                this.createParticles(this.targets.sensor2.x, this.targets.sensor2.y, 20);
                this.updateTargetDisplay('sensor2', true);
            }
        }
        
        // 모든 목표 완료 시 미션 성공
        if (this.targets.sensor1.completed && this.targets.sensor2.completed) {
            this.onMissionCompleted();
        }
    }
    
    /**
     * 미션 완료 처리
     */
    onMissionCompleted() {
        this.missionCount++;
        this.score += this.config.missionScoreBonus;
        
        this.updateScoreDisplay();
        this.updateMissionCountDisplay();
        this.showSuccessPanel();
        
        console.log(`미션 ${this.missionCount} 완료! 보너스 점수: ${this.config.missionScoreBonus}`);
        
        // 3초 후 자동으로 새 미션 시작
        setTimeout(() => {
            this.startNewMission();
        }, 3000);
    }
    
    /**
     * 거리 계산
     */
    getDistance(obj1, obj2) {
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // ========== 렌더링 ==========
    
    /**
     * 게임 렌더링
     */
    render() {
        this.clearCanvas();
        this.renderBackground();
        this.renderTargets();
        this.renderBallTrails();
        this.renderBalls();
        this.renderParticles();
    }
    
    /**
     * 캔버스 지우기
     */
    clearCanvas() {
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    
    /**
     * 배경 렌더링
     */
    renderBackground() {
        const gradient = this.ctx.createRadialGradient(
            window.innerWidth / 2, window.innerHeight / 2, 0,
            window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight) / 2
        );
        
        gradient.addColorStop(0, `hsl(${this.backgroundHue}, 15%, 6%)`);
        gradient.addColorStop(1, `hsl(${this.backgroundHue}, 25%, 3%)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    
    /**
     * 목표 렌더링
     */
    renderTargets() {
        // sensor1 목표
        this.renderTarget(this.targets.sensor1, '#3b82f6', this.targets.sensor1.completed);
        
        // sensor2 목표
        this.renderTarget(this.targets.sensor2, '#ef4444', this.targets.sensor2.completed);
    }
    
    /**
     * 개별 목표 렌더링
     */
    renderTarget(target, color, completed) {
        this.ctx.save();
        
        if (completed) {
            this.ctx.globalAlpha = 0.3;
        } else {
            this.ctx.globalAlpha = 0.8;
        }
        
        // 외곽선
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 중앙 점
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 완료 표시
        if (completed) {
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.2;
            this.ctx.beginPath();
            this.ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    /**
     * 볼 궤적들 렌더링
     */
    renderBallTrails() {
        this.renderBallTrail('sensor1');
        this.renderBallTrail('sensor2');
    }
    
    /**
     * 개별 볼 궤적 렌더링
     */
    renderBallTrail(ballId) {
        const ball = this.balls[ballId];
        if (!ball || !ball.isActive || ball.trail.length < 2) return;
        
        this.ctx.save();
        this.ctx.strokeStyle = ball.color;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(ball.trail[0].x, ball.trail[0].y);
        
        for (let i = 1; i < ball.trail.length; i++) {
            const point = ball.trail[i];
            const alpha = point.life / this.config.trailLength;
            
            this.ctx.globalAlpha = alpha * 0.5;
            this.ctx.lineTo(point.x, point.y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    /**
     * 볼들 렌더링
     */
    renderBalls() {
        this.renderBall(this.balls.sensor1);
        this.renderBall(this.balls.sensor2);
    }
    
    /**
     * 개별 볼 렌더링
     */
    renderBall(ball) {
        if (!ball || !ball.isActive) return;
        
        this.ctx.save();
        
        // 그림자
        this.ctx.shadowColor = ball.color;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // 볼 그라디언트
        const gradient = this.ctx.createRadialGradient(
            ball.x - ball.radius * 0.3,
            ball.y - ball.radius * 0.3,
            0,
            ball.x,
            ball.y,
            ball.radius
        );
        
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.4, ball.color);
        gradient.addColorStop(1, '#1e293b');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    /**
     * 파티클 렌더링
     */
    renderParticles() {
        this.particles.forEach(particle => {
            this.ctx.save();
            
            const alpha = particle.life / this.config.particleLifetime;
            this.ctx.globalAlpha = alpha;
            
            this.ctx.fillStyle = particle.color;
            this.ctx.shadowColor = particle.color;
            this.ctx.shadowBlur = 6;
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
        });
    }
    
    // ========== UI 업데이트 ==========
    
    /**
     * 서버 상태 업데이트
     */
    updateServerStatus(connected) {
        const element = document.getElementById('serverStatus');
        if (element) {
            element.classList.toggle('connected', connected);
        }
    }
    
    /**
     * 센서 상태 업데이트
     */
    updateSensorStatus(sensorId, connected) {
        // 기존 상태 표시 업데이트
        const statusElement = document.getElementById(`${sensorId}Status`);
        if (statusElement) {
            statusElement.classList.toggle('connected', connected);
        }
        
        // 새로운 연결 상태 표시 업데이트
        const connectionElement = document.getElementById(`${sensorId}Connection`);
        if (connectionElement) {
            if (connected) {
                connectionElement.textContent = '연결됨';
                connectionElement.style.background = 'var(--success)';
            } else {
                connectionElement.textContent = '대기중';
                connectionElement.style.background = 'var(--error)';
            }
        }
    }
    
    /**
     * 게임 상태 텍스트 업데이트
     */
    updateGameStatus(status) {
        const element = document.getElementById('missionStatus');
        if (element) {
            element.textContent = status;
        }
    }
    
    /**
     * 점수 표시 업데이트
     */
    updateScoreDisplay() {
        const element = document.getElementById('scoreValue');
        if (element) {
            element.textContent = this.score.toLocaleString();
        }
    }
    
    /**
     * 미션 카운트 표시 업데이트
     */
    updateMissionCountDisplay() {
        const element = document.getElementById('missionCount');
        if (element) {
            element.textContent = this.missionCount;
        }
    }
    
    /**
     * 미션 표시 업데이트
     */
    updateMissionDisplay() {
        this.updateTargetDisplay('sensor1', this.targets.sensor1.completed);
        this.updateTargetDisplay('sensor2', this.targets.sensor2.completed);
    }
    
    /**
     * 목표 표시 업데이트
     */
    updateTargetDisplay(sensorId, completed) {
        const element = document.getElementById(`${sensorId}Target`);
        if (element) {
            element.classList.toggle('completed', completed);
        }
    }
    
    /**
     * 게임 패널들 표시
     */
    showGamePanels() {
        document.getElementById('missionPanel')?.classList.remove('hidden');
        document.getElementById('scorePanel')?.classList.remove('hidden');
    }
    
    /**
     * 성공 패널 표시
     */
    showSuccessPanel() {
        const panel = document.getElementById('successPanel');
        const message = document.getElementById('successMessage');
        
        if (panel && message) {
            message.textContent = `미션 ${this.missionCount} 완료! 보너스 ${this.config.missionScoreBonus}점 획득!`;
            panel.classList.remove('hidden');
        }
    }
    
    /**
     * 성공 패널 숨기기
     */
    hideSuccessPanel() {
        const panel = document.getElementById('successPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }
    
    /**
     * 세션 정보 표시
     */
    showSessionInfo(sessionCode) {
        const sessionInfo = document.getElementById('sessionInfo');
        const sessionCodeElement = document.getElementById('sessionCode');
        const qrContainer = document.getElementById('qrCodeContainer');
        
        if (sessionInfo && sessionCodeElement) {
            sessionCodeElement.textContent = sessionCode;
            sessionInfo.classList.remove('hidden');
            
            // QR 코드 생성
            if (typeof QRCode !== 'undefined' && qrContainer) {
                qrContainer.innerHTML = '';
                QRCode.toCanvas(qrContainer, sessionCode, {
                    width: 128,
                    margin: 1,
                    color: {
                        dark: '#3b82f6',
                        light: '#ffffff'
                    }
                }, (error) => {
                    if (error) {
                        console.error('QR 코드 생성 실패:', error);
                    }
                });
            }
        }
    }
    
    // ========== 공개 메서드들 ==========
    
    /**
     * 게임 시작
     */
    async startGame() {
        try {
            if (!this.sdk.isConnected) {
                await this.connectToServer();
            }
            
            // 듀얼 센서 게임 세션 생성
            await this.sdk.startDualGame();
            
        } catch (error) {
            console.error('게임 시작 실패:', error);
            this.updateGameStatus('게임 시작 실패');
        }
    }
    
    /**
     * 게임 세션 시작
     */
    async startGameSession() {
        try {
            if (this.sdk.isGameReady()) {
                await this.sdk.startGame();
            } else {
                console.log('게임 준비가 되지 않았습니다');
            }
        } catch (error) {
            console.error('게임 세션 시작 실패:', error);
            this.updateGameStatus('게임 세션 시작 실패');
        }
    }
    
    /**
     * 게임 리셋
     */
    reset() {
        this.resetBallPositions();
        this.balls.sensor1.vx = 0;
        this.balls.sensor1.vy = 0;
        this.balls.sensor1.trail = [];
        this.balls.sensor2.vx = 0;
        this.balls.sensor2.vy = 0;
        this.balls.sensor2.trail = [];
        this.particles = [];
        this.score = 0;
        this.missionCount = 0;
        this.backgroundHue = 220;
        
        this.generateNewMission();
        this.updateScoreDisplay();
        this.updateMissionCountDisplay();
        
        console.log('🔄 게임 리셋');
    }
    
    /**
     * 새 미션 시작
     */
    startNewMission() {
        this.hideSuccessPanel();
        this.generateNewMission();
        console.log('🎯 새 미션 시작');
    }
    
    /**
     * 허브로 돌아가기
     */
    async returnToHub() {
        try {
            // 게임 종료
            await this.sdk.endGame();
            
            // 네비게이션 매니저를 통해 허브로 이동
            if (this.navigationManager) {
                await this.navigationManager.returnToHub();
            } else {
                // 직접 이동
                window.location.href = '../../client/hub-v6.html';
            }
        } catch (error) {
            console.error('허브 이동 실패:', error);
            // 에러 시 직접 이동
            window.location.href = '../../client/hub-v6.html';
        }
    }
    
    /**
     * 인스트럭션 패널 숨기기
     */
    hideInstructionPanel() {
        const panel = document.getElementById('instructionPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }
    
    /**
     * 게임 정리
     */
    destroy() {
        this.stopGameLoop();
        
        if (this.sdk) {
            this.sdk.disconnect();
        }
        
        console.log('🗑️ 듀얼 센서 테스트 게임 v6.0 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('🎮 듀얼 센서 테스트 게임 v6.0 로딩...');

try {
    window.game = new DualSensorTestGameV6();
    console.log('✅ 듀얼 센서 테스트 게임 v6.0 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
/**
 * 🎯 솔로 센서 테스트 게임 v6.0
 * 
 * v6.0 SDK 기반 솔로 센서 게임
 * - 기울기: 공 움직임
 * - 흔들기: 파티클 효과
 * - 회전: 배경색 변화
 * - 점수 시스템
 */

class SoloSensorTestGameV6 {
    constructor() {
        // v6.0 SDK 초기화
        this.sdk = new SensorGameSDK({
            serverUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
            gameId: 'solo-sensor-test',
            gameTitle: '솔로 센서 테스트',
            debug: true
        });
        
        // 게임 요소들
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        this.isGameRunning = false;
        
        // 게임 오브젝트들
        this.ball = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 25,
            color: '#3b82f6',
            trail: []
        };
        
        this.particles = [];
        this.backgroundHue = 220; // 기본 파란색
        this.score = 0;
        this.showSensorData = false;
        
        // 게임 설정
        this.config = {
            ballSpeed: 8,
            friction: 0.92,
            bounceStrength: 0.7,
            particleCount: 15,
            particleLifetime: 60,
            trailLength: 20,
            scoreMultiplier: 10
        };
        
        // 세션 네비게이션 매니저
        this.navigationManager = null;
        
        this.initializeGame();
    }
    
    /**
     * 게임 초기화
     */
    initializeGame() {
        console.log('🎯 솔로 센서 테스트 게임 v6.0 초기화');
        
        this.setupCanvas();
        this.setupSDKEvents();
        
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
     * 게임 진입시 즉시 세션 생성
     */
    createGameSession() {
        console.log('🎯 솔로 게임 세션 생성 중...');
        
        // 세션 생성 UI 표시
        this.showSessionCreationUI();
        
        // SDK를 통해 세션 생성
        this.sdk.createSession('solo')
            .then(sessionCode => {
                console.log(`✅ 솔로 게임 세션 생성 완료: ${sessionCode}`);
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
     * 캔버스 설정
     */
    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // 볼 초기 위치
        this.ball.x = this.canvas.width / 2;
        this.ball.y = this.canvas.height / 2;
        
        // 키보드 이벤트 (테스트용)
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'r':
                case 'R':
                    this.reset();
                    break;
                case 's':
                case 'S':
                    this.toggleSensorDisplay();
                    break;
                case ' ':
                    e.preventDefault();
                    this.createParticles(this.ball.x, this.ball.y, 10);
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
        
        // 볼 위치 재조정
        if (this.ball.x === 0 && this.ball.y === 0) {
            this.ball.x = window.innerWidth / 2;
            this.ball.y = window.innerHeight / 2;
        }
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
        this.updateGameStatus(`세션 코드: ${data.sessionCode}`);
        this.showSessionInfo(data.sessionCode);
        this.hideInstructionPanel();
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(data) {
        console.log('📱 센서 연결됨:', data);
        
        this.updateSensorStatus(true);
        this.updateGameStatus('센서 연결됨 - 게임 시작!');
        
        // 세션 정보 숨기기
        this.hideSessionInfo();
        
        // 솔로 게임은 센서 연결되면 즉시 게임 시작
        console.log('🎯 솔로 센서 게임 시작!');
        this.startSoloGame();
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
     * 솔로 센서 게임 시작
     */
    startSoloGame() {
        console.log('🎯 솔로 센서 게임 시작!');
        
        // 게임 상태 변경
        this.isGameRunning = true;
        
        // UI 업데이트
        this.updateGameStatus('게임 진행 중...');
        
        // 공 위치 초기화
        this.resetBallPosition();
        
        // 게임 루프 시작
        if (!this.gameLoop) {
            this.startGameLoop();
        }
        
        // 게임 UI 표시
        this.showGameUI();
        
        // 게임 시작 이벤트 전송
        this.sdk.sendGameEvent({
            type: 'solo_game_started',
            timestamp: Date.now()
        });
    }
    
    /**
     * 공 위치 초기화
     */
    resetBallPosition() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.ball.x = centerX;
        this.ball.y = centerY;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.trail = [];
    }
    
    /**
     * 게임 UI 표시
     */
    showGameUI() {
        const gameUI = document.getElementById('gameUI');
        const scorePanel = document.getElementById('scorePanel');
        
        if (gameUI) {
            gameUI.classList.remove('hidden');
        }
        if (scorePanel) {
            scorePanel.classList.remove('hidden');
        }
        
        // 점수 초기화
        this.updateScoreDisplay();
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(data) {
        if (!this.isGameRunning) return;
        
        const sensorData = data.data;
        
        // 센서 데이터 처리
        const processedData = this.processSensorData(sensorData);
        
        // 볼 움직임 업데이트 (기울기)
        this.updateBallMovement(processedData.tilt);
        
        // 흔들기 파티클 효과
        if (processedData.shake && processedData.shake.detected) {
            this.createShakeParticles(processedData.shake.intensity);
        }
        
        // 배경색 변화 (회전)
        this.updateBackgroundColor(processedData.rotation);
        
        // 점수 업데이트
        this.updateScore(processedData);
        
        // UI 업데이트
        this.updateSensorDataDisplay(processedData, sensorData);
    }
    
    /**
     * 게임 시작됨
     */
    onGameStarted(data) {
        this.updateGameStatus('게임 진행 중!');
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
            // beta: 앞뒤 기울기 (-180 ~ 180)
            // gamma: 좌우 기울기 (-90 ~ 90)
            processed.tilt.x = this.normalizeValue(rawData.orientation.gamma, -45, 45) * 0.5;
            processed.tilt.y = this.normalizeValue(rawData.orientation.beta, -45, 45) * 0.5;
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
            if (totalAccel > 15) {
                processed.shake.detected = true;
                processed.shake.intensity = Math.min(totalAccel / 30, 1);
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
        // 볼 물리 업데이트
        this.updateBallPhysics();
        
        // 파티클 업데이트
        this.updateParticles();
        
        // 볼 궤적 업데이트
        this.updateBallTrail();
    }
    
    /**
     * 볼 움직임 업데이트 (센서 기울기 기반)
     */
    updateBallMovement(tilt) {
        // 기울기를 속도로 변환
        this.ball.vx += tilt.x * this.config.ballSpeed;
        this.ball.vy += tilt.y * this.config.ballSpeed;
        
        // 최대 속도 제한
        const maxSpeed = 15;
        this.ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.ball.vx));
        this.ball.vy = Math.max(-maxSpeed, Math.min(maxSpeed, this.ball.vy));
    }
    
    /**
     * 볼 물리 업데이트
     */
    updateBallPhysics() {
        // 위치 업데이트
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        
        // 마찰력 적용
        this.ball.vx *= this.config.friction;
        this.ball.vy *= this.config.friction;
        
        // 경계 충돌 처리
        const radius = this.ball.radius;
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        if (this.ball.x - radius < 0) {
            this.ball.x = radius;
            this.ball.vx *= -this.config.bounceStrength;
            this.createParticles(this.ball.x, this.ball.y, 5);
        }
        
        if (this.ball.x + radius > width) {
            this.ball.x = width - radius;
            this.ball.vx *= -this.config.bounceStrength;
            this.createParticles(this.ball.x, this.ball.y, 5);
        }
        
        if (this.ball.y - radius < 0) {
            this.ball.y = radius;
            this.ball.vy *= -this.config.bounceStrength;
            this.createParticles(this.ball.x, this.ball.y, 5);
        }
        
        if (this.ball.y + radius > height) {
            this.ball.y = height - radius;
            this.ball.vy *= -this.config.bounceStrength;
            this.createParticles(this.ball.x, this.ball.y, 5);
        }
    }
    
    /**
     * 볼 궤적 업데이트
     */
    updateBallTrail() {
        // 현재 위치를 궤적에 추가
        this.ball.trail.push({
            x: this.ball.x,
            y: this.ball.y,
            life: this.config.trailLength
        });
        
        // 오래된 궤적 제거
        this.ball.trail = this.ball.trail.filter(point => {
            point.life--;
            return point.life > 0;
        });
        
        // 최대 길이 제한
        if (this.ball.trail.length > this.config.trailLength) {
            this.ball.trail.shift();
        }
    }
    
    /**
     * 흔들기 파티클 생성
     */
    createShakeParticles(intensity) {
        const count = Math.min(intensity * 3, this.config.particleCount);
        this.createParticles(this.ball.x, this.ball.y, count);
    }
    
    /**
     * 파티클 생성
     */
    createParticles(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: this.config.particleLifetime,
                size: Math.random() * 4 + 2,
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
     * 배경색 업데이트 (회전 기반)
     */
    updateBackgroundColor(rotation) {
        // 회전 강도를 색상 변화로 변환
        const rotationIntensity = Math.abs(rotation.x) + Math.abs(rotation.y) + Math.abs(rotation.z);
        
        if (rotationIntensity > 0.1) {
            this.backgroundHue += rotationIntensity * 2;
            this.backgroundHue = this.backgroundHue % 360;
        }
    }
    
    /**
     * 점수 업데이트
     */
    updateScore(sensorData) {
        // 움직임 강도 계산
        const tiltIntensity = Math.abs(sensorData.tilt.x) + Math.abs(sensorData.tilt.y);
        const shakeIntensity = sensorData.shake.detected ? sensorData.shake.intensity : 0;
        const rotationIntensity = Math.abs(sensorData.rotation.x) + Math.abs(sensorData.rotation.y) + Math.abs(sensorData.rotation.z);
        
        // 점수 증가
        const totalIntensity = tiltIntensity + shakeIntensity + rotationIntensity;
        if (totalIntensity > 0.1) {
            this.score += Math.floor(totalIntensity * this.config.scoreMultiplier);
            this.updateScoreDisplay();
        }
    }
    
    // ========== 렌더링 ==========
    
    /**
     * 게임 렌더링
     */
    render() {
        this.clearCanvas();
        this.renderBackground();
        this.renderBallTrail();
        this.renderBall();
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
        // 그라디언트 배경
        const gradient = this.ctx.createRadialGradient(
            window.innerWidth / 2, window.innerHeight / 2, 0,
            window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight) / 2
        );
        
        gradient.addColorStop(0, `hsl(${this.backgroundHue}, 20%, 8%)`);
        gradient.addColorStop(1, `hsl(${this.backgroundHue}, 30%, 4%)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    
    /**
     * 볼 궤적 렌더링
     */
    renderBallTrail() {
        if (this.ball.trail.length < 2) return;
        
        this.ctx.save();
        this.ctx.strokeStyle = this.ball.color;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.ball.trail[0].x, this.ball.trail[0].y);
        
        for (let i = 1; i < this.ball.trail.length; i++) {
            const point = this.ball.trail[i];
            const alpha = point.life / this.config.trailLength;
            
            this.ctx.globalAlpha = alpha * 0.6;
            this.ctx.lineTo(point.x, point.y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    /**
     * 볼 렌더링
     */
    renderBall() {
        this.ctx.save();
        
        // 그림자
        this.ctx.shadowColor = this.ball.color;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // 볼 그라디언트
        const gradient = this.ctx.createRadialGradient(
            this.ball.x - this.ball.radius * 0.3,
            this.ball.y - this.ball.radius * 0.3,
            0,
            this.ball.x,
            this.ball.y,
            this.ball.radius
        );
        
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, this.ball.color);
        gradient.addColorStop(1, '#1e293b');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
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
            this.ctx.shadowBlur = 8;
            
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
    updateSensorStatus(connected) {
        const element = document.getElementById('sensorStatus');
        if (element) {
            element.classList.toggle('connected', connected);
        }
    }
    
    /**
     * 게임 상태 텍스트 업데이트
     */
    updateGameStatus(status) {
        const element = document.getElementById('gameStatusText');
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
     * 센서 데이터 표시 업데이트
     */
    updateSensorDataDisplay(processed, raw) {
        if (!this.showSensorData) return;
        
        // 기울기
        document.getElementById('tiltX').textContent = processed.tilt.x.toFixed(2);
        document.getElementById('tiltY').textContent = processed.tilt.y.toFixed(2);
        
        // 가속도
        document.getElementById('accelX').textContent = processed.movement.x.toFixed(2);
        document.getElementById('accelY').textContent = processed.movement.y.toFixed(2);
        document.getElementById('accelZ').textContent = processed.movement.z.toFixed(2);
        
        // 회전
        document.getElementById('gyroX').textContent = processed.rotation.x.toFixed(2);
        document.getElementById('gyroY').textContent = processed.rotation.y.toFixed(2);
        document.getElementById('gyroZ').textContent = processed.rotation.z.toFixed(2);
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
            
            // 솔로 게임 세션 생성
            await this.sdk.startSoloGame();
            
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
        this.ball.x = window.innerWidth / 2;
        this.ball.y = window.innerHeight / 2;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.trail = [];
        this.particles = [];
        this.score = 0;
        this.backgroundHue = 220;
        
        this.updateScoreDisplay();
        
        console.log('🔄 게임 리셋');
    }
    
    /**
     * 센서 데이터 표시 토글
     */
    toggleSensorDisplay() {
        this.showSensorData = !this.showSensorData;
        const panel = document.getElementById('sensorPanel');
        if (panel) {
            panel.classList.toggle('hidden', !this.showSensorData);
        }
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
            panel.classList.add('fade-out');
            setTimeout(() => panel.classList.add('hidden'), 300);
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
        
        console.log('🗑️ 솔로 센서 테스트 게임 v6.0 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('🎯 솔로 센서 테스트 게임 v6.0 로딩...');

try {
    window.game = new SoloSensorTestGameV6();
    console.log('✅ 솔로 센서 테스트 게임 v6.0 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
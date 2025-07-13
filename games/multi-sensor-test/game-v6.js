/**
 * 👥 멀티플레이어 센서 테스트 게임 v6.0
 * 
 * v6.0 SDK 기반 멀티플레이어 센서 게임
 * - 최대 10명 실시간 멀티플레이어
 * - 목표 존 수집 경쟁 게임
 * - 실시간 리더보드 및 순위
 */

class MultiplayerSensorTestGameV6 {
    constructor() {
        // v6.0 SDK 초기화
        this.sdk = new SensorGameSDK({
            serverUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
            gameId: 'multi-sensor-test',
            gameTitle: '멀티플레이어 센서 테스트',
            debug: true
        });
        
        // 게임 요소들
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        this.isGameRunning = false;
        
        // 게임 오브젝트들
        this.myBall = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 18,
            color: '#3b82f6',
            trail: []
        };
        
        this.otherPlayers = new Map(); // sessionId -> player data
        this.targets = [];
        this.particles = [];
        this.collectEffects = [];
        
        // 게임 상태
        this.myScore = 0;
        this.myNickname = 'Player';
        this.gameTimer = 180; // 3분
        this.timerInterval = null;
        this.gamePhase = 'lobby'; // lobby, waiting, playing, finished
        
        // 룸 정보
        this.roomId = null;
        this.roomInfo = null;
        this.isHost = false;
        
        // 센서 활동 측정
        this.sensorActivity = {
            tilt: 0,
            shake: 0,
            rotation: 0
        };
        
        // 게임 설정
        this.config = {
            ballSpeed: 5,
            friction: 0.95,
            bounceStrength: 0.8,
            targetCount: 8,
            targetRadius: 25,
            targetValue: 100,
            bonusMultiplier: 1.5,
            trailLength: 12,
            particleLifetime: 30
        };
        
        // 색상 팔레트 (플레이어별)
        this.playerColors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
            '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
            '#ec4899', '#6366f1'
        ];
        
        // 세션 네비게이션 매니저
        this.navigationManager = null;
        
        this.initializeGame();
    }
    
    /**
     * 게임 초기화
     */
    initializeGame() {
        console.log('👥 멀티플레이어 센서 테스트 게임 v6.0 초기화');
        
        this.setupCanvas();
        this.setupSDKEvents();
        this.generateTargets();
        
        // 네비게이션 매니저 설정
        if (typeof SessionNavigationManager !== 'undefined') {
            this.navigationManager = new SessionNavigationManager(this.sdk);
        }
        
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
        
        // 내 볼 초기 위치
        this.resetMyBallPosition();
        
        // 키보드 이벤트
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'r':
                case 'R':
                    if (this.isHost) {
                        this.restartGame();
                    }
                    break;
                case ' ':
                    e.preventDefault();
                    this.activateBoost();
                    break;
            }
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
        this.resetMyBallPosition();
        
        // 목표 재생성
        if (this.gamePhase === 'lobby') {
            this.generateTargets();
        }
    }
    
    /**
     * 내 볼 초기 위치 설정
     */
    resetMyBallPosition() {
        this.myBall.x = window.innerWidth / 2;
        this.myBall.y = window.innerHeight / 2;
        this.myBall.vx = 0;
        this.myBall.vy = 0;
        this.myBall.trail = [];
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
        
        // 룸 이벤트
        this.sdk.on('roomCreated', (data) => {
            console.log('🏠 룸 생성됨:', data);
            this.onRoomCreated(data);
        });
        
        this.sdk.on('roomJoined', (data) => {
            console.log('👥 룸 참가됨:', data);
            this.onRoomJoined(data);
        });
        
        this.sdk.on('playerJoined', (data) => {
            console.log('🎮 플레이어 참가:', data);
            this.onPlayerJoined(data);
        });
        
        this.sdk.on('playerLeft', (data) => {
            console.log('👋 플레이어 퇴장:', data);
            this.onPlayerLeft(data);
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
        this.updateGameStatus(`세션 코드: ${data.sessionCode} - 룸 생성 중...`);
        this.showSessionInfo(data.sessionCode);
        
        // 자동으로 룸 생성
        setTimeout(() => {
            this.createRoom();
        }, 1000);
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(data) {
        this.updateSensorStatus(true);
        this.updateGameStatus('센서 연결됨 - 룸 입장 대기');
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(data) {
        if (!this.isGameRunning) return;
        
        const sensorData = data.data;
        const processedData = this.processSensorData(sensorData);
        
        // 내 볼 움직임 업데이트
        this.updateMyBallMovement(processedData.tilt);
        
        // 센서 활동 업데이트
        this.updateSensorActivity(processedData);
        
        // 목표 수집 체크
        this.checkTargetCollection();
        
        // 흔들기 부스트
        if (processedData.shake.detected) {
            this.activateShakeBoost(processedData.shake.intensity);
        }
    }
    
    /**
     * 룸 생성됨
     */
    onRoomCreated(data) {
        this.roomId = data.roomId;
        this.roomInfo = data.roomInfo;
        this.isHost = data.isHost;
        
        this.updateGameStatus('룸 생성 완료 - 플레이어 대기 중');
        this.showLobbyWithPlayers();
        
        // 내 플레이어 정보 설정
        this.myNickname = this.roomInfo.hostNickname || 'Host';
        this.myBall.color = this.playerColors[0];
    }
    
    /**
     * 룸 참가됨
     */
    onRoomJoined(data) {
        this.roomId = data.roomId;
        this.roomInfo = data.roomInfo;
        this.isHost = data.isHost;
        
        this.updateGameStatus('룸 참가 완료 - 게임 시작 대기');
        this.showLobbyWithPlayers();
        
        // 내 플레이어 정보 설정
        const playerIndex = this.roomInfo.playerCount - 1;
        this.myNickname = `Player${playerIndex + 1}`;
        this.myBall.color = this.playerColors[playerIndex % this.playerColors.length];
    }
    
    /**
     * 플레이어 참가
     */
    onPlayerJoined(data) {
        console.log('새 플레이어 참가:', data.player);
        
        this.roomInfo = data.roomInfo;
        this.updateLobbyPlayersList();
        this.updateGameStatus(`플레이어 ${data.player.nickname} 참가 (${this.roomInfo.playerCount}명)`);
        
        // 호스트인 경우 게임 시작 버튼 표시
        if (this.isHost && this.roomInfo.playerCount >= 2) {
            this.showStartGameButton();
        }
    }
    
    /**
     * 플레이어 퇴장
     */
    onPlayerLeft(data) {
        console.log('플레이어 퇴장:', data.player);
        
        this.roomInfo = data.roomInfo;
        this.updateLobbyPlayersList();
        this.updateGameStatus(`플레이어 ${data.player.nickname} 퇴장 (${this.roomInfo.playerCount}명)`);
        
        // 게임 중이었다면 해당 플레이어 제거
        if (this.gamePhase === 'playing') {
            this.otherPlayers.delete(data.player.sessionId);
        }
    }
    
    /**
     * 게임 시작됨
     */
    onGameStarted(data) {
        console.log('게임 시작:', data);
        
        this.gamePhase = 'playing';
        this.hideLobby();
        this.showGameUI();
        this.startGameTimer();
        this.startGameLoop();
        
        this.updateGameStatus('게임 진행 중!');
        
        // 다른 플레이어들 초기화
        if (data.players) {
            data.players.forEach((player, index) => {
                if (player.sessionId !== this.sdk.sessionId) {
                    this.otherPlayers.set(player.sessionId, {
                        nickname: player.nickname,
                        score: 0,
                        ball: {
                            x: Math.random() * window.innerWidth,
                            y: Math.random() * window.innerHeight,
                            vx: 0,
                            vy: 0,
                            radius: 18,
                            color: this.playerColors[index % this.playerColors.length],
                            trail: []
                        }
                    });
                }
            });
        }
    }
    
    /**
     * 게임 종료됨
     */
    onGameEnded(data) {
        console.log('게임 종료:', data);
        
        this.gamePhase = 'finished';
        this.stopGameLoop();
        this.stopGameTimer();
        this.showGameResults();
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
        
        // 기울기
        if (rawData.orientation) {
            processed.tilt.x = this.normalizeValue(rawData.orientation.gamma, -30, 30) * 0.8;
            processed.tilt.y = this.normalizeValue(rawData.orientation.beta, -30, 30) * 0.8;
        }
        
        // 회전
        if (rawData.motion && rawData.motion.rotationRate) {
            processed.rotation.x = rawData.motion.rotationRate.beta || 0;
            processed.rotation.y = rawData.motion.rotationRate.gamma || 0;
            processed.rotation.z = rawData.motion.rotationRate.alpha || 0;
        }
        
        // 가속도 및 흔들기
        if (rawData.motion && rawData.motion.acceleration) {
            processed.movement.x = rawData.motion.acceleration.x || 0;
            processed.movement.y = rawData.motion.acceleration.y || 0;
            processed.movement.z = rawData.motion.acceleration.z || 0;
            
            const totalAccel = Math.abs(processed.movement.x) + Math.abs(processed.movement.y) + Math.abs(processed.movement.z);
            if (totalAccel > 10) {
                processed.shake.detected = true;
                processed.shake.intensity = Math.min(totalAccel / 20, 1);
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
    
    /**
     * 센서 활동 업데이트
     */
    updateSensorActivity(processedData) {
        const tiltIntensity = Math.abs(processedData.tilt.x) + Math.abs(processedData.tilt.y);
        const shakeIntensity = processedData.shake.detected ? processedData.shake.intensity : 0;
        const rotationIntensity = (Math.abs(processedData.rotation.x) + Math.abs(processedData.rotation.y) + Math.abs(processedData.rotation.z)) / 100;
        
        // 부드럽게 업데이트
        this.sensorActivity.tilt = this.sensorActivity.tilt * 0.8 + tiltIntensity * 0.2;
        this.sensorActivity.shake = this.sensorActivity.shake * 0.7 + shakeIntensity * 0.3;
        this.sensorActivity.rotation = this.sensorActivity.rotation * 0.8 + rotationIntensity * 0.2;
        
        // UI 업데이트
        this.updateActivityBars();
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
        // 내 볼 물리 업데이트
        this.updateMyBallPhysics();
        
        // 다른 플레이어들 업데이트 (예상 위치)
        this.updateOtherPlayers();
        
        // 파티클 업데이트
        this.updateParticles();
        this.updateCollectEffects();
        
        // 볼 궤적 업데이트
        this.updateBallTrail();
    }
    
    /**
     * 내 볼 움직임 업데이트
     */
    updateMyBallMovement(tilt) {
        this.myBall.vx += tilt.x * this.config.ballSpeed;
        this.myBall.vy += tilt.y * this.config.ballSpeed;
        
        // 최대 속도 제한
        const maxSpeed = 10;
        this.myBall.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.myBall.vx));
        this.myBall.vy = Math.max(-maxSpeed, Math.min(maxSpeed, this.myBall.vy));
    }
    
    /**
     * 내 볼 물리 업데이트
     */
    updateMyBallPhysics() {
        // 위치 업데이트
        this.myBall.x += this.myBall.vx;
        this.myBall.y += this.myBall.vy;
        
        // 마찰력
        this.myBall.vx *= this.config.friction;
        this.myBall.vy *= this.config.friction;
        
        // 경계 충돌
        const radius = this.myBall.radius;
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        if (this.myBall.x - radius < 0) {
            this.myBall.x = radius;
            this.myBall.vx *= -this.config.bounceStrength;
        }
        
        if (this.myBall.x + radius > width) {
            this.myBall.x = width - radius;
            this.myBall.vx *= -this.config.bounceStrength;
        }
        
        if (this.myBall.y - radius < 0) {
            this.myBall.y = radius;
            this.myBall.vy *= -this.config.bounceStrength;
        }
        
        if (this.myBall.y + radius > height) {
            this.myBall.y = height - radius;
            this.myBall.vy *= -this.config.bounceStrength;
        }
    }
    
    /**
     * 다른 플레이어들 업데이트
     */
    updateOtherPlayers() {
        // 실제로는 서버에서 위치 데이터를 받아야 하지만
        // 여기서는 예상 이동으로 시뮬레이션
        for (const [sessionId, player] of this.otherPlayers) {
            // 간단한 무작위 움직임 (실제로는 센서 데이터 기반)
            player.ball.vx += (Math.random() - 0.5) * 2;
            player.ball.vy += (Math.random() - 0.5) * 2;
            
            player.ball.vx *= 0.95;
            player.ball.vy *= 0.95;
            
            player.ball.x += player.ball.vx;
            player.ball.y += player.ball.vy;
            
            // 경계 처리
            const radius = player.ball.radius;
            player.ball.x = Math.max(radius, Math.min(window.innerWidth - radius, player.ball.x));
            player.ball.y = Math.max(radius, Math.min(window.innerHeight - radius, player.ball.y));
        }
    }
    
    /**
     * 볼 궤적 업데이트
     */
    updateBallTrail() {
        // 내 볼 궤적
        this.myBall.trail.push({
            x: this.myBall.x,
            y: this.myBall.y,
            life: this.config.trailLength
        });
        
        this.myBall.trail = this.myBall.trail.filter(point => {
            point.life--;
            return point.life > 0;
        });
        
        if (this.myBall.trail.length > this.config.trailLength) {
            this.myBall.trail.shift();
        }
        
        // 다른 플레이어들 궤적
        for (const [sessionId, player] of this.otherPlayers) {
            player.ball.trail.push({
                x: player.ball.x,
                y: player.ball.y,
                life: this.config.trailLength
            });
            
            player.ball.trail = player.ball.trail.filter(point => {
                point.life--;
                return point.life > 0;
            });
            
            if (player.ball.trail.length > this.config.trailLength) {
                player.ball.trail.shift();
            }
        }
    }
    
    /**
     * 목표 수집 체크
     */
    checkTargetCollection() {
        for (let i = this.targets.length - 1; i >= 0; i--) {
            const target = this.targets[i];
            if (target.collected) continue;
            
            const distance = this.getDistance(this.myBall, target);
            if (distance < target.radius + this.myBall.radius) {
                // 목표 수집!
                target.collected = true;
                this.myScore += target.value;
                
                // 수집 효과
                this.createCollectEffect(target.x, target.y, target.value);
                this.createParticles(target.x, target.y, 15);
                
                // 새 목표 생성
                setTimeout(() => {
                    this.targets.splice(i, 1);
                    this.generateSingleTarget();
                }, 500);
                
                this.updateMyScoreDisplay();
                
                console.log(`목표 수집! 점수: +${target.value}, 총점: ${this.myScore}`);
            }
        }
    }
    
    /**
     * 목표 생성
     */
    generateTargets() {
        this.targets = [];
        
        for (let i = 0; i < this.config.targetCount; i++) {
            this.generateSingleTarget();
        }
    }
    
    /**
     * 단일 목표 생성
     */
    generateSingleTarget() {
        const margin = 50;
        
        let x, y;
        let attempts = 0;
        
        do {
            x = margin + Math.random() * (window.innerWidth - margin * 2);
            y = margin + Math.random() * (window.innerHeight - margin * 2);
            attempts++;
        } while (attempts < 20 && this.targets.some(target => 
            this.getDistance({x, y}, target) < target.radius * 3
        ));
        
        const value = this.config.targetValue + Math.floor(Math.random() * 50);
        
        this.targets.push({
            x,
            y,
            radius: this.config.targetRadius,
            value,
            collected: false,
            pulsePhase: Math.random() * Math.PI * 2,
            color: `hsl(${120 + Math.random() * 60}, 70%, 60%)`
        });
    }
    
    /**
     * 수집 효과 생성
     */
    createCollectEffect(x, y, value) {
        this.collectEffects.push({
            x,
            y,
            value,
            life: 60,
            scale: 1,
            alpha: 1
        });
    }
    
    /**
     * 수집 효과 업데이트
     */
    updateCollectEffects() {
        for (let i = this.collectEffects.length - 1; i >= 0; i--) {
            const effect = this.collectEffects[i];
            
            effect.life--;
            effect.y -= 2;
            effect.scale += 0.02;
            effect.alpha = effect.life / 60;
            
            if (effect.life <= 0) {
                this.collectEffects.splice(i, 1);
            }
        }
    }
    
    /**
     * 파티클 생성
     */
    createParticles(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: this.config.particleLifetime,
                size: Math.random() * 3 + 1,
                color: `hsl(${60 + Math.random() * 60}, 80%, 70%)`
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
     * 부스트 활성화
     */
    activateBoost() {
        const boostPower = 3;
        this.myBall.vx *= boostPower;
        this.myBall.vy *= boostPower;
        
        this.createParticles(this.myBall.x, this.myBall.y, 10);
    }
    
    /**
     * 흔들기 부스트 활성화
     */
    activateShakeBoost(intensity) {
        const boostPower = 1 + intensity;
        this.myBall.vx *= boostPower;
        this.myBall.vy *= boostPower;
        
        // 보너스 점수
        const bonusScore = Math.floor(intensity * 10);
        this.myScore += bonusScore;
        this.updateMyScoreDisplay();
        
        this.createParticles(this.myBall.x, this.myBall.y, Math.floor(intensity * 8));
    }
    
    /**
     * 게임 타이머 시작
     */
    startGameTimer() {
        this.gameTimer = 180; // 3분
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            this.gameTimer--;
            this.updateTimerDisplay();
            
            if (this.gameTimer <= 0) {
                this.endGame();
            }
        }, 1000);
    }
    
    /**
     * 게임 타이머 중지
     */
    stopGameTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    /**
     * 게임 종료
     */
    async endGame() {
        if (this.isHost) {
            try {
                await this.sdk.endGame();
            } catch (error) {
                console.error('게임 종료 실패:', error);
            }
        }
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
        this.renderCollectEffects();
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
        
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1e293b');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    
    /**
     * 목표들 렌더링
     */
    renderTargets() {
        this.targets.forEach(target => {
            if (target.collected) return;
            
            this.ctx.save();
            
            // 펄스 효과
            target.pulsePhase += 0.1;
            const pulseScale = 1 + Math.sin(target.pulsePhase) * 0.1;
            
            // 외곽선
            this.ctx.strokeStyle = target.color;
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.8;
            this.ctx.beginPath();
            this.ctx.arc(target.x, target.y, target.radius * pulseScale, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // 중심 점
            this.ctx.fillStyle = target.color;
            this.ctx.globalAlpha = 0.6;
            this.ctx.beginPath();
            this.ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 점수 표시
            this.ctx.globalAlpha = 1;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`+${target.value}`, target.x, target.y + 4);
            
            this.ctx.restore();
        });
    }
    
    /**
     * 볼 궤적들 렌더링
     */
    renderBallTrails() {
        // 내 볼 궤적
        this.renderBallTrail(this.myBall);
        
        // 다른 플레이어들 궤적
        for (const [sessionId, player] of this.otherPlayers) {
            this.renderBallTrail(player.ball);
        }
    }
    
    /**
     * 개별 볼 궤적 렌더링
     */
    renderBallTrail(ball) {
        if (ball.trail.length < 2) return;
        
        this.ctx.save();
        this.ctx.strokeStyle = ball.color;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(ball.trail[0].x, ball.trail[0].y);
        
        for (let i = 1; i < ball.trail.length; i++) {
            const point = ball.trail[i];
            const alpha = point.life / this.config.trailLength;
            
            this.ctx.globalAlpha = alpha * 0.4;
            this.ctx.lineTo(point.x, point.y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    /**
     * 볼들 렌더링
     */
    renderBalls() {
        // 내 볼
        this.renderBall(this.myBall, true);
        
        // 다른 플레이어들 볼
        for (const [sessionId, player] of this.otherPlayers) {
            this.renderBall(player.ball, false);
        }
    }
    
    /**
     * 개별 볼 렌더링
     */
    renderBall(ball, isMe) {
        this.ctx.save();
        
        // 그림자
        if (isMe) {
            this.ctx.shadowColor = ball.color;
            this.ctx.shadowBlur = 20;
        }
        
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
        
        // 내 볼 표시
        if (isMe) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius + 3, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
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
            this.ctx.shadowBlur = 5;
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
        });
    }
    
    /**
     * 수집 효과 렌더링
     */
    renderCollectEffects() {
        this.collectEffects.forEach(effect => {
            this.ctx.save();
            
            this.ctx.globalAlpha = effect.alpha;
            this.ctx.fillStyle = '#10b981';
            this.ctx.font = `bold ${16 * effect.scale}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`+${effect.value}`, effect.x, effect.y);
            
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
     * 내 점수 표시 업데이트
     */
    updateMyScoreDisplay() {
        const element = document.getElementById('myScore');
        if (element) {
            element.textContent = this.myScore.toLocaleString();
        }
    }
    
    /**
     * 타이머 표시 업데이트
     */
    updateTimerDisplay() {
        const element = document.getElementById('timerDisplay');
        const container = document.getElementById('timerContainer');
        
        if (element && container) {
            const minutes = Math.floor(this.gameTimer / 60);
            const seconds = this.gameTimer % 60;
            element.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (this.gamePhase === 'playing') {
                container.classList.remove('hidden');
            }
        }
    }
    
    /**
     * 활동 바 업데이트
     */
    updateActivityBars() {
        const tiltBar = document.getElementById('tiltActivity');
        const shakeBar = document.getElementById('shakeActivity');
        const rotationBar = document.getElementById('rotationActivity');
        
        if (tiltBar) {
            tiltBar.style.width = `${Math.min(this.sensorActivity.tilt * 100, 100)}%`;
        }
        if (shakeBar) {
            shakeBar.style.width = `${Math.min(this.sensorActivity.shake * 100, 100)}%`;
        }
        if (rotationBar) {
            rotationBar.style.width = `${Math.min(this.sensorActivity.rotation * 100, 100)}%`;
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
    
    /**
     * 대기실 표시
     */
    showLobbyWithPlayers() {
        this.hideLobby();
        
        const lobbyPlayers = document.getElementById('lobbyPlayers');
        const roomControls = document.getElementById('roomControls');
        
        if (lobbyPlayers) {
            lobbyPlayers.classList.remove('hidden');
        }
        if (roomControls) {
            roomControls.classList.add('hidden');
        }
        
        this.updateLobbyPlayersList();
    }
    
    /**
     * 대기실 플레이어 목록 업데이트
     */
    updateLobbyPlayersList() {
        const container = document.getElementById('playersListLobby');
        if (!container || !this.roomInfo) return;
        
        container.innerHTML = '';
        
        // 예시 플레이어 목록 (실제로는 서버에서 받아야 함)
        for (let i = 0; i < this.roomInfo.playerCount; i++) {
            const playerDiv = document.createElement('div');
            playerDiv.className = `lobby-player ${i === 0 ? 'host' : ''}`;
            
            const isMe = i === 0 ? this.isHost : false;
            
            playerDiv.innerHTML = `
                <div class="player-name">
                    <div class="player-color" style="background: ${this.playerColors[i]}"></div>
                    ${i === 0 ? (this.isHost ? this.myNickname : 'Host') : `Player${i + 1}`}
                    ${isMe ? ' (나)' : ''}
                    ${i === 0 ? ' 👑' : ''}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.8rem;">
                    ${i === 0 ? '방장' : '참가자'}
                </div>
            `;
            
            container.appendChild(playerDiv);
        }
    }
    
    /**
     * 게임 시작 버튼 표시
     */
    showStartGameButton() {
        const startBtn = document.getElementById('startGameBtn');
        if (startBtn && this.isHost) {
            startBtn.classList.remove('hidden');
        }
    }
    
    /**
     * 게임 UI 표시
     */
    showGameUI() {
        document.getElementById('leaderboardPanel')?.classList.remove('hidden');
        document.getElementById('playerInfoPanel')?.classList.remove('hidden');
    }
    
    /**
     * 대기실 숨기기
     */
    hideLobby() {
        document.getElementById('lobbyPanel')?.classList.add('hidden');
    }
    
    /**
     * 게임 결과 표시
     */
    showGameResults() {
        const resultsPanel = document.getElementById('resultsPanel');
        const winnerText = document.getElementById('winnerText');
        const finalScores = document.getElementById('finalScores');
        
        if (resultsPanel) {
            resultsPanel.classList.remove('hidden');
        }
        
        if (winnerText) {
            winnerText.textContent = `최종 점수: ${this.myScore.toLocaleString()}점`;
        }
        
        if (finalScores) {
            finalScores.innerHTML = `
                <div class="final-score-item winner">
                    <div class="player-name">
                        <div class="player-color" style="background: ${this.myBall.color}"></div>
                        ${this.myNickname} (나)
                    </div>
                    <div class="player-score">${this.myScore.toLocaleString()}</div>
                </div>
            `;
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
            
            // 멀티플레이어 세션 생성
            const nickname = prompt('닉네임을 입력하세요:', 'Player') || 'Player';
            this.myNickname = nickname;
            
            await this.sdk.createMultiplayerRoom({
                maxPlayers: 10,
                isPrivate: false,
                hostNickname: nickname
            });
            
        } catch (error) {
            console.error('게임 시작 실패:', error);
            this.updateGameStatus('게임 시작 실패');
        }
    }
    
    /**
     * 룸 생성
     */
    async createRoom() {
        try {
            // SDK에서 자동으로 룸 생성됨
            console.log('룸 생성 중...');
        } catch (error) {
            console.error('룸 생성 실패:', error);
        }
    }
    
    /**
     * 게임 재시작
     */
    async restartGame() {
        if (!this.isHost) {
            console.log('호스트만 게임을 재시작할 수 있습니다');
            return;
        }
        
        try {
            // 게임 상태 초기화
            this.gamePhase = 'waiting';
            this.myScore = 0;
            this.gameTimer = 180;
            this.otherPlayers.clear();
            this.particles = [];
            this.collectEffects = [];
            
            this.resetMyBallPosition();
            this.generateTargets();
            this.updateMyScoreDisplay();
            
            // 새 게임 시작
            await this.sdk.startGame();
            
        } catch (error) {
            console.error('게임 재시작 실패:', error);
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
     * 게임 정리
     */
    destroy() {
        this.stopGameLoop();
        this.stopGameTimer();
        
        if (this.sdk) {
            this.sdk.disconnect();
        }
        
        console.log('🗑️ 멀티플레이어 센서 테스트 게임 v6.0 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('👥 멀티플레이어 센서 테스트 게임 v6.0 로딩...');

try {
    window.game = new MultiplayerSensorTestGameV6();
    console.log('✅ 멀티플레이어 센서 테스트 게임 v6.0 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
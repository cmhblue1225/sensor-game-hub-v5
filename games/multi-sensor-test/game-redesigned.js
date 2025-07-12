/**
 * 👥 멀티플레이어 센서 테스트 게임 (완전 재설계)
 * 
 * 새로운 서버 및 SDK와 완벽 호환
 * 최대 10명이 동시에 플레이하는 공유 화면 게임
 * - 각 플레이어가 개별 공을 조종
 * - 실시간 점수 경쟁
 * - 3분 타이머 게임
 */

class MultiPlayerSensorTestGame extends SensorGameSDK {
    constructor() {
        super({
            gameId: 'multi-sensor-test',
            gameName: '멀티플레이어 센서 테스트',
            gameType: 'multiplayer',
            sensorTypes: ['orientation', 'accelerometer', 'gyroscope'],
            sensorConfig: {
                smoothing: 0.8,
                sensitivity: 1.2,
                deadzone: 0.1,
                shakeThreshold: 15
            }
        });
        
        // 게임 캔버스 및 렌더링
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        
        // 멀티플레이어 상태
        this.roomId = null;
        this.isHost = false;
        this.players = new Map(); // sessionId -> playerData
        this.myPlayer = null;
        this.playerColors = [
            '#3b82f6', // 파란색
            '#ef4444', // 빨간색  
            '#10b981', // 초록색
            '#f59e0b', // 주황색
            '#8b5cf6', // 보라색
            '#ec4899', // 분홍색
            '#14b8a6', // 청록색
            '#f97316', // 오렌지색
            '#a855f7', // 자주색
            '#06b6d4'  // 하늘색
        ];
        
        // 게임 상태
        this.gameTimer = null;
        this.gameTimeLeft = 180; // 3분
        this.gameStartTime = null;
        this.gameEnded = false;
        
        // 게임 오브젝트들
        this.targetZones = [];
        this.powerUps = [];
        this.particles = [];
        this.backgroundHue = 220;
        
        // 게임 설정
        this.config = {
            ballSpeed: 8,
            friction: 0.92,
            bounceStrength: 0.7,
            playerRadius: 25,
            trailLength: 20,
            particleCount: 15,
            particleLifetime: 60,
            scoreMultiplier: 10,
            targetZoneRadius: 40,
            targetZoneScore: 50,
            shakeBonus: 25,
            maxTargetZones: 3,
            targetZoneLifetime: 5000,
            powerUpSpawnInterval: 15000
        };
        
        this.initialize();
    }
    
    /**
     * 게임 초기화
     */
    initialize() {
        console.log('👥 멀티플레이어 센서 테스트 게임 (재설계) 초기화 중...');
        
        this.setupCanvas();
        this.setupEventListeners();
        
        // 초기 UI 상태
        this.updateGameStatus('세션 연결 대기 중...');
        this.showLobbyPanel();
        
        console.log('✅ 멀티플레이어 센서 테스트 게임 초기화 완료');
    }
    
    /**
     * 캔버스 설정
     */
    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
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
    }
    
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'r':
                case 'R':
                    if (this.isHost && this.state.gameStatus === 'ended') {
                        this.restartGame();
                    }
                    break;
                case ' ':
                    e.preventDefault();
                    if (this.myPlayer && this.state.gameStatus === 'playing') {
                        this.activatePlayerBoost();
                    }
                    break;
                case 's':
                case 'S':
                    // 센서 데이터 시뮬레이션 (테스트용)
                    this.simulateSensorData();
                    break;
            }
        });
    }
    
    // ========== SDK 콜백 메서드들 ==========
    
    /**
     * SDK 초기화 완료
     */
    onInit() {
        console.log('✅ SDK 초기화 완료');
        this.updateServerStatus(true);
    }
    
    /**
     * 세션 생성 완료
     */
    onSessionCreated(data) {
        console.log('🔑 멀티플레이어 세션 생성됨:', data.sessionCode);
        this.updateGameStatus(`세션 ${data.sessionCode} 생성됨. 센서를 연결하세요.`);
        this.showRoomControls();
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(data) {
        console.log('📱 센서 연결됨:', data);
        this.updateSensorStatus(true);
        this.updateGameStatus('센서 연결됨. 룸을 생성하거나 참가하세요.');
    }
    
    /**
     * 룸 생성됨
     */
    onRoomCreated(data) {
        console.log('🏠 룸 생성됨:', data.roomId);
        this.roomId = data.roomId;
        this.isHost = true;
        
        this.updateGameStatus('룸 생성됨 - 플레이어 대기 중');
        this.showWaitingRoom();
        this.showHostControls();
        
        // 나를 첫 번째 플레이어로 추가
        this.addPlayer({
            sessionId: this.state.sessionId,
            nickname: '호스트',
            isHost: true
        });
    }
    
    /**
     * 룸 참가됨
     */
    onRoomJoined(data) {
        console.log('👥 룸 참가됨:', data);
        this.roomId = data.roomId;
        this.isHost = data.isHost;
        
        this.updateGameStatus('룸 참가됨 - 게임 시작 대기');
        this.showWaitingRoom();
        this.hideHostControls();
        
        // 내 플레이어 정보 설정
        this.addPlayer({
            sessionId: this.state.sessionId,
            nickname: `플레이어${Math.floor(Math.random() * 1000)}`,
            isHost: false
        });
    }
    
    /**
     * 플레이어 참가
     */
    onPlayerJoined(data) {
        console.log('👤 플레이어 참가:', data);
        
        if (data.player) {
            this.addPlayer({
                sessionId: data.player.sessionId,
                nickname: data.player.nickname || `플레이어${this.players.size + 1}`,
                isHost: data.player.isHost || false
            });
        }
        
        this.updateWaitingRoomDisplay();
        this.updateGameStatus(`플레이어 ${this.players.size}명 대기 중`);
    }
    
    /**
     * 플레이어 퇴장
     */
    onPlayerLeft(data) {
        console.log('👤 플레이어 퇴장:', data);
        this.removePlayer(data.sessionId);
        this.updateWaitingRoomDisplay();
        this.updateGameStatus(`플레이어 ${this.players.size}명 대기 중`);
    }
    
    /**
     * 게임 시작 알림
     */
    onGameStart(data) {
        console.log('🎮 멀티플레이어 게임 시작!', data);
        this.startGame();
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(processedData, rawData, sensorId) {
        if (!this.gameStarted || !this.myPlayer) return;
        
        // 내 플레이어 업데이트
        this.updateMyPlayer(processedData);
        
        // 다른 플레이어들에게 내 상태 브로드캐스트
        this.broadcastPlayerUpdate();
    }
    
    /**
     * 게임 이벤트 수신 (플레이어간 통신)
     */
    onGameEvent(data) {
        const { eventType, data: eventData, fromSessionId } = data;
        
        switch (eventType) {
            case 'player_update':
                this.updateOtherPlayer(fromSessionId, eventData);
                break;
            case 'target_collected':
                this.handleTargetCollected(eventData);
                break;
            case 'particle_effect':
                this.createParticles(eventData.x, eventData.y, eventData.count, eventData.color);
                break;
        }
    }
    
    /**
     * 오류 처리
     */
    onError(error) {
        console.error('❌ 멀티플레이어 게임 오류:', error);
        this.updateGameStatus(`오류: ${error.error || error.message}`);
    }
    
    // ========== 플레이어 관리 ==========
    
    /**
     * 플레이어 추가
     */
    addPlayer(playerData) {
        const colorIndex = this.players.size % this.playerColors.length;
        
        const player = {
            sessionId: playerData.sessionId,
            nickname: playerData.nickname,
            isHost: playerData.isHost,
            color: this.playerColors[colorIndex],
            score: 0,
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 300,
            y: window.innerHeight / 2 + (Math.random() - 0.5) * 300,
            vx: 0,
            vy: 0,
            trail: [],
            lastSensorData: null,
            targetStreak: 0,
            boostCooldown: 0,
            activity: {
                tilt: 0,
                shake: 0,
                rotation: 0
            }
        };
        
        this.players.set(playerData.sessionId, player);
        
        // 내 플레이어인지 확인
        if (playerData.sessionId === this.state.sessionId) {
            this.myPlayer = player;
        }
        
        console.log(`👥 플레이어 추가: ${player.nickname} (총 ${this.players.size}명)`);
    }
    
    /**
     * 플레이어 제거
     */
    removePlayer(sessionId) {
        const player = this.players.get(sessionId);
        if (player) {
            this.players.delete(sessionId);
            console.log(`👤 플레이어 제거: ${player.nickname}`);
        }
    }
    
    /**
     * 내 플레이어 업데이트
     */
    updateMyPlayer(sensorData) {
        if (!this.myPlayer) return;
        
        // 센서 데이터 저장
        this.myPlayer.lastSensorData = sensorData;
        
        // 기울기를 속도로 변환
        this.myPlayer.vx += sensorData.tilt.x * this.config.ballSpeed;
        this.myPlayer.vy += sensorData.tilt.y * this.config.ballSpeed;
        
        // 최대 속도 제한
        const maxSpeed = 15;
        this.myPlayer.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.myPlayer.vx));
        this.myPlayer.vy = Math.max(-maxSpeed, Math.min(maxSpeed, this.myPlayer.vy));
        
        // 활동 강도 계산
        const tiltIntensity = Math.abs(sensorData.tilt.x) + Math.abs(sensorData.tilt.y);
        const shakeIntensity = sensorData.shake.detected ? sensorData.shake.intensity : 0;
        const rotationIntensity = Math.abs(sensorData.rotation.x) + Math.abs(sensorData.rotation.y) + Math.abs(sensorData.rotation.z);
        
        this.myPlayer.activity = {
            tilt: Math.min(tiltIntensity * 100, 100),
            shake: Math.min(shakeIntensity * 20, 100),
            rotation: Math.min(rotationIntensity * 50, 100)
        };
        
        // 흔들기 파티클 효과
        if (sensorData.shake.detected) {
            this.createParticles(this.myPlayer.x, this.myPlayer.y, Math.min(shakeIntensity * 3, 8), this.myPlayer.color);
            
            // 흔들기 보너스 점수
            this.myPlayer.score += this.config.shakeBonus;
            
            // 다른 플레이어들에게 파티클 효과 전송
            this.sendGameEvent('particle_effect', {
                x: this.myPlayer.x,
                y: this.myPlayer.y,
                count: Math.min(shakeIntensity * 2, 6),
                color: this.myPlayer.color
            });
        }
        
        // 움직임 기반 점수 증가
        const totalActivity = tiltIntensity + shakeIntensity + rotationIntensity;
        if (totalActivity > 0.1) {
            this.myPlayer.score += Math.floor(totalActivity * this.config.scoreMultiplier);
        }
    }
    
    /**
     * 다른 플레이어 업데이트
     */
    updateOtherPlayer(sessionId, data) {
        const player = this.players.get(sessionId);
        if (!player || player === this.myPlayer) return;
        
        // 위치 보간 업데이트
        if (data.position) {
            player.x = data.position.x;
            player.y = data.position.y;
        }
        
        if (data.score !== undefined) {
            player.score = data.score;
        }
        
        if (data.activity) {
            player.activity = data.activity;
        }
        
        if (data.targetStreak !== undefined) {
            player.targetStreak = data.targetStreak;
        }
    }
    
    /**
     * 내 플레이어 상태 브로드캐스트
     */
    broadcastPlayerUpdate() {
        if (!this.myPlayer) return;
        
        this.sendGameEvent('player_update', {
            position: { x: this.myPlayer.x, y: this.myPlayer.y },
            score: this.myPlayer.score,
            activity: this.myPlayer.activity,
            targetStreak: this.myPlayer.targetStreak
        });
    }
    
    /**
     * 플레이어 부스트 활성화
     */
    activatePlayerBoost() {
        if (!this.myPlayer || this.myPlayer.boostCooldown > 0) return;
        
        // 부스트 효과
        this.myPlayer.vx *= 2;
        this.myPlayer.vy *= 2;
        this.myPlayer.boostCooldown = 60; // 1초 쿨다운
        
        // 부스트 파티클
        this.createParticles(this.myPlayer.x, this.myPlayer.y, 12, this.myPlayer.color);
    }
    
    // ========== 게임 로직 ==========
    
    /**
     * 게임 시작
     */
    startGame() {
        if (this.gameStarted) return;
        
        this.gameStarted = true;
        this.gameEnded = false;
        this.state.gameStatus = 'playing';
        this.gameStartTime = Date.now();
        this.gameTimeLeft = 180;
        
        // UI 업데이트
        this.hideLobbyPanel();
        this.showGameUI();
        
        // 게임 오브젝트 초기화
        this.resetPlayersPositions();
        this.generateTargetZones();
        
        // 게임 루프 시작
        this.startGameLoop();
        this.startGameTimer();
        
        this.updateGameStatus('게임 진행 중 - 목표를 수집하세요!');
        console.log('🎮 멀티플레이어 게임 시작!');
    }
    
    /**
     * 게임 루프 시작
     */
    startGameLoop() {
        const loop = () => {
            if (this.gameStarted && this.state.gameStatus === 'playing') {
                this.update();
                this.render();
                this.gameLoop = requestAnimationFrame(loop);
            }
        };
        
        this.gameLoop = requestAnimationFrame(loop);
    }
    
    /**
     * 게임 타이머 시작
     */
    startGameTimer() {
        this.gameTimer = setInterval(() => {
            this.gameTimeLeft--;
            this.updateTimerDisplay();
            
            if (this.gameTimeLeft <= 0) {
                this.endGame();
            }
        }, 1000);
    }
    
    /**
     * 게임 업데이트
     */
    update() {
        // 플레이어 물리 업데이트
        this.updatePlayersPhysics();
        
        // 충돌 검사
        this.checkTargetCollisions();
        
        // 파티클 업데이트
        this.updateParticles();
        
        // 배경색 업데이트
        this.updateBackgroundColor();
        
        // 목표 존 관리
        this.manageTargetZones();
        
        // UI 업데이트
        this.updateLeaderboard();
        this.updatePlayerInfo();
    }
    
    /**
     * 플레이어들 물리 업데이트
     */
    updatePlayersPhysics() {
        this.players.forEach(player => {
            // 위치 업데이트
            player.x += player.vx;
            player.y += player.vy;
            
            // 마찰력 적용
            player.vx *= this.config.friction;
            player.vy *= this.config.friction;
            
            // 경계 충돌 처리
            this.handlePlayerBoundaries(player);
            
            // 궤적 업데이트
            this.updatePlayerTrail(player);
            
            // 쿨다운 감소
            if (player.boostCooldown > 0) {
                player.boostCooldown--;
            }
        });
    }
    
    /**
     * 플레이어 경계 처리
     */
    handlePlayerBoundaries(player) {
        const radius = this.config.playerRadius;
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        if (player.x - radius < 0) {
            player.x = radius;
            player.vx *= -this.config.bounceStrength;
            this.createParticles(player.x, player.y, 5, player.color);
        }
        
        if (player.x + radius > width) {
            player.x = width - radius;
            player.vx *= -this.config.bounceStrength;
            this.createParticles(player.x, player.y, 5, player.color);
        }
        
        if (player.y - radius < 0) {
            player.y = radius;
            player.vy *= -this.config.bounceStrength;
            this.createParticles(player.x, player.y, 5, player.color);
        }
        
        if (player.y + radius > height) {
            player.y = height - radius;
            player.vy *= -this.config.bounceStrength;
            this.createParticles(player.x, player.y, 5, player.color);
        }
    }
    
    /**
     * 플레이어 궤적 업데이트
     */
    updatePlayerTrail(player) {
        player.trail.push({
            x: player.x,
            y: player.y,
            life: this.config.trailLength
        });
        
        player.trail = player.trail.filter(point => {
            point.life--;
            return point.life > 0;
        });
        
        if (player.trail.length > this.config.trailLength) {
            player.trail.shift();
        }
    }
    
    /**
     * 목표 존 생성
     */
    generateTargetZones() {
        this.targetZones = [];
        
        for (let i = 0; i < this.config.maxTargetZones; i++) {
            this.createTargetZone();
        }
    }
    
    /**
     * 단일 목표 존 생성
     */
    createTargetZone() {
        const margin = 100;
        const zone = {
            id: Date.now() + Math.random(),
            x: margin + Math.random() * (window.innerWidth - 2 * margin),
            y: margin + Math.random() * (window.innerHeight - 2 * margin),
            radius: this.config.targetZoneRadius,
            score: this.config.targetZoneScore,
            pulseSize: 0,
            pulseDirection: 1,
            lifetime: this.config.targetZoneLifetime,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`
        };
        
        this.targetZones.push(zone);
    }
    
    /**
     * 목표 존 관리
     */
    manageTargetZones() {
        // 목표 존 펄스 애니메이션
        this.targetZones.forEach(zone => {
            zone.pulseSize += zone.pulseDirection * 0.05;
            
            if (zone.pulseSize >= 1) {
                zone.pulseSize = 1;
                zone.pulseDirection = -1;
            } else if (zone.pulseSize <= 0) {
                zone.pulseSize = 0;
                zone.pulseDirection = 1;
            }
            
            // 수명 감소
            zone.lifetime -= 16; // 60fps 기준
        });
        
        // 수명이 다한 목표 존 제거 및 새로 생성
        this.targetZones = this.targetZones.filter(zone => zone.lifetime > 0);
        
        while (this.targetZones.length < this.config.maxTargetZones) {
            this.createTargetZone();
        }
    }
    
    /**
     * 목표 충돌 검사
     */
    checkTargetCollisions() {
        if (!this.myPlayer) return;
        
        this.targetZones.forEach((zone, index) => {
            const dist = Math.sqrt(
                Math.pow(this.myPlayer.x - zone.x, 2) + 
                Math.pow(this.myPlayer.y - zone.y, 2)
            );
            
            if (dist <= zone.radius + this.config.playerRadius) {
                this.collectTarget(zone, index);
            }
        });
    }
    
    /**
     * 목표 수집
     */
    collectTarget(zone, index) {
        // 점수 추가
        this.myPlayer.score += zone.score;
        this.myPlayer.targetStreak++;
        
        // 연속 수집 보너스
        if (this.myPlayer.targetStreak > 1) {
            const bonus = this.myPlayer.targetStreak * 10;
            this.myPlayer.score += bonus;
        }
        
        // 성공 파티클
        this.createSuccessParticles(zone.x, zone.y);
        
        // 목표 존 제거 및 새로 생성
        this.targetZones.splice(index, 1);
        this.createTargetZone();
        
        // 다른 플레이어들에게 수집 알림
        this.sendGameEvent('target_collected', {
            playerId: this.myPlayer.sessionId,
            score: zone.score,
            position: { x: zone.x, y: zone.y }
        });
        
        console.log(`🎯 목표 수집! 점수: ${this.myPlayer.score}, 연속: ${this.myPlayer.targetStreak}`);
    }
    
    /**
     * 목표 수집 처리 (다른 플레이어)
     */
    handleTargetCollected(data) {
        const player = this.players.get(data.playerId);
        if (player && player !== this.myPlayer) {
            // 다른 플레이어의 수집 파티클 효과
            this.createSuccessParticles(data.position.x, data.position.y);
        }
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        if (this.gameEnded) return;
        
        this.gameEnded = true;
        this.gameStarted = false;
        this.state.gameStatus = 'ended';
        
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        
        this.showGameResults();
        console.log('🏁 멀티플레이어 게임 종료');
    }
    
    /**
     * 플레이어 위치 초기화
     */
    resetPlayersPositions() {
        this.players.forEach(player => {
            player.x = window.innerWidth / 2 + (Math.random() - 0.5) * 300;
            player.y = window.innerHeight / 2 + (Math.random() - 0.5) * 300;
            player.vx = 0;
            player.vy = 0;
            player.trail = [];
            player.targetStreak = 0;
            player.boostCooldown = 0;
        });
    }
    
    /**
     * 파티클 생성
     */
    createParticles(x, y, count, color = null) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
                life: this.config.particleLifetime,
                size: Math.random() * 4 + 2,
                color: color || `hsl(${this.backgroundHue}, 70%, 60%)`
            });
        }
    }
    
    /**
     * 성공 파티클 생성
     */
    createSuccessParticles(x, y) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 60,
                y: y + (Math.random() - 0.5) * 60,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15,
                life: this.config.particleLifetime * 1.5,
                size: Math.random() * 6 + 3,
                color: `hsl(${Math.random() * 60 + 40}, 70%, 60%)`
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
    updateBackgroundColor() {
        // 모든 플레이어의 활동에 따라 배경색 변화
        let totalActivity = 0;
        this.players.forEach(player => {
            if (player.activity) {
                totalActivity += (player.activity.rotation || 0);
            }
        });
        
        if (totalActivity > 20) {
            this.backgroundHue += totalActivity * 0.05;
            this.backgroundHue = this.backgroundHue % 360;
        }
    }
    
    /**
     * 센서 데이터 시뮬레이션 (테스트용)
     */
    simulateSensorData() {
        if (!this.gameStarted || !this.myPlayer) return;
        
        const testData = {
            tilt: {
                x: (Math.random() - 0.5) * 0.8,
                y: (Math.random() - 0.5) * 0.8
            },
            movement: {
                x: (Math.random() - 0.5) * 3,
                y: (Math.random() - 0.5) * 3,
                z: (Math.random() - 0.5) * 3
            },
            rotation: {
                x: (Math.random() - 0.5) * 4,
                y: (Math.random() - 0.5) * 4,
                z: (Math.random() - 0.5) * 4
            },
            shake: {
                detected: Math.random() > 0.85,
                intensity: Math.random() * 2
            }
        };
        
        this.onSensorData(testData, testData, 'primary');
    }
    
    // ========== 렌더링 ==========
    
    /**
     * 게임 렌더링
     */
    render() {
        this.clearCanvas();
        this.renderBackground();
        this.renderTargetZones();
        this.renderAllPlayerTrails();
        this.renderAllPlayers();
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
        
        gradient.addColorStop(0, `hsl(${this.backgroundHue}, 20%, 8%)`);
        gradient.addColorStop(1, `hsl(${this.backgroundHue}, 30%, 4%)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    
    /**
     * 목표 존 렌더링
     */
    renderTargetZones() {
        this.targetZones.forEach(zone => {
            this.ctx.save();
            
            // 펄스 원
            const pulseRadius = zone.radius + zone.pulseSize * 30;
            this.ctx.globalAlpha = 0.3 * (1 - zone.pulseSize);
            this.ctx.strokeStyle = zone.color;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(zone.x, zone.y, pulseRadius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // 메인 목표 원
            this.ctx.globalAlpha = 0.6;
            this.ctx.fillStyle = `${zone.color}40`;
            this.ctx.beginPath();
            this.ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = zone.color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 점수 표시
            this.ctx.globalAlpha = 1;
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`+${zone.score}`, zone.x, zone.y + 5);
            
            this.ctx.restore();
        });
    }
    
    /**
     * 모든 플레이어 궤적 렌더링
     */
    renderAllPlayerTrails() {
        this.players.forEach(player => {
            this.renderPlayerTrail(player);
        });
    }
    
    /**
     * 플레이어 궤적 렌더링
     */
    renderPlayerTrail(player) {
        if (player.trail.length < 2) return;
        
        this.ctx.save();
        this.ctx.strokeStyle = player.color;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(player.trail[0].x, player.trail[0].y);
        
        for (let i = 1; i < player.trail.length; i++) {
            const point = player.trail[i];
            const alpha = point.life / this.config.trailLength;
            
            this.ctx.globalAlpha = alpha * 0.7;
            this.ctx.lineTo(point.x, point.y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    /**
     * 모든 플레이어 렌더링
     */
    renderAllPlayers() {
        this.players.forEach(player => {
            this.renderPlayer(player);
        });
    }
    
    /**
     * 플레이어 렌더링
     */
    renderPlayer(player) {
        this.ctx.save();
        
        const radius = this.config.playerRadius;
        const isMe = player === this.myPlayer;
        
        // 내 플레이어는 글로우 효과
        if (isMe) {
            this.ctx.shadowColor = player.color;
            this.ctx.shadowBlur = 30;
        }
        
        // 부스트 상태 표시
        if (player.boostCooldown > 0) {
            this.ctx.shadowColor = '#ffffff';
            this.ctx.shadowBlur = 20;
        }
        
        // 플레이어 그라디언트
        const gradient = this.ctx.createRadialGradient(
            player.x - radius * 0.3,
            player.y - radius * 0.3,
            0,
            player.x,
            player.y,
            radius
        );
        
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, player.color);
        gradient.addColorStop(1, '#1e293b');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 테두리
        this.ctx.strokeStyle = player.color;
        this.ctx.lineWidth = isMe ? 4 : 2;
        this.ctx.stroke();
        
        // 닉네임
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.nickname, player.x, player.y - radius - 15);
        
        // 점수
        this.ctx.font = '10px Arial';
        this.ctx.fillText(player.score.toLocaleString(), player.x, player.y - radius - 5);
        
        // 연속 수집 표시
        if (player.targetStreak > 1) {
            this.ctx.fillStyle = '#f59e0b';
            this.ctx.fillText(`x${player.targetStreak}`, player.x, player.y + radius + 15);
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
     * 게임 상태 업데이트
     */
    updateGameStatus(status) {
        const element = document.getElementById('gameStatusText');
        if (element) {
            element.textContent = status;
        }
    }
    
    /**
     * 타이머 표시 업데이트
     */
    updateTimerDisplay() {
        const element = document.getElementById('timerDisplay');
        if (element) {
            const minutes = Math.floor(this.gameTimeLeft / 60);
            const seconds = this.gameTimeLeft % 60;
            element.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    /**
     * 리더보드 업데이트
     */
    updateLeaderboard() {
        const element = document.getElementById('playersList');
        if (!element) return;
        
        // 점수 순으로 정렬
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => b.score - a.score);
        
        element.innerHTML = sortedPlayers.map((player, index) => `
            <div class="player-item ${player === this.myPlayer ? 'me' : ''}">
                <div class="player-name">
                    <div class="player-color" style="background: ${player.color}"></div>
                    ${index + 1}. ${player.nickname}
                </div>
                <div class="player-score">${player.score.toLocaleString()}</div>
            </div>
        `).join('');
    }
    
    /**
     * 내 플레이어 정보 업데이트
     */
    updatePlayerInfo() {
        if (!this.myPlayer) return;
        
        // 점수
        const scoreElement = document.getElementById('myScore');
        if (scoreElement) {
            scoreElement.textContent = this.myPlayer.score.toLocaleString();
        }
        
        // 활동 바
        const tiltBar = document.getElementById('tiltActivity');
        const shakeBar = document.getElementById('shakeActivity');
        const rotationBar = document.getElementById('rotationActivity');
        
        if (tiltBar) tiltBar.style.width = `${this.myPlayer.activity.tilt}%`;
        if (shakeBar) shakeBar.style.width = `${this.myPlayer.activity.shake}%`;
        if (rotationBar) rotationBar.style.width = `${this.myPlayer.activity.rotation}%`;
    }
    
    /**
     * 대기실 표시 업데이트
     */
    updateWaitingRoomDisplay() {
        const element = document.getElementById('playersListLobby');
        if (!element) return;
        
        element.innerHTML = Array.from(this.players.values()).map(player => `
            <div class="lobby-player ${player.isHost ? 'host' : ''}">
                <div class="player-name">
                    <div class="player-color" style="background: ${player.color}"></div>
                    ${player.nickname} ${player.isHost ? '(호스트)' : ''}
                </div>
            </div>
        `).join('');
    }
    
    /**
     * 게임 결과 표시
     */
    showGameResults() {
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => b.score - a.score);
        const winner = sortedPlayers[0];
        
        // 우승자 표시
        const winnerElement = document.getElementById('winnerText');
        if (winnerElement) {
            winnerElement.textContent = `🏆 ${winner.nickname} 우승! (${winner.score.toLocaleString()}점)`;
        }
        
        // 최종 점수 표시
        const scoresElement = document.getElementById('finalScores');
        if (scoresElement) {
            scoresElement.innerHTML = sortedPlayers.map((player, index) => `
                <div class="final-score-item ${index === 0 ? 'winner' : ''}">
                    <div class="player-name">
                        <div class="player-color" style="background: ${player.color}"></div>
                        ${index + 1}. ${player.nickname}
                    </div>
                    <div class="player-score">${player.score.toLocaleString()}</div>
                </div>
            `).join('');
        }
        
        this.hideGameUI();
        this.showPanel('resultsPanel');
    }
    
    // ========== UI 제어 ==========
    
    /**
     * 패널 표시
     */
    showPanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('hidden');
        }
    }
    
    /**
     * 패널 숨기기
     */
    hidePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.add('hidden');
        }
    }
    
    /**
     * 로비 패널 표시
     */
    showLobbyPanel() {
        this.showPanel('lobbyPanel');
        this.showPanel('createSessionBtn');
    }
    
    /**
     * 로비 패널 숨기기
     */
    hideLobbyPanel() {
        this.hidePanel('lobbyPanel');
    }
    
    /**
     * 룸 컨트롤 표시
     */
    showRoomControls() {
        this.hidePanel('createSessionBtn');
        this.showPanel('roomControls');
    }
    
    /**
     * 대기실 표시
     */
    showWaitingRoom() {
        this.hidePanel('roomControls');
        this.showPanel('lobbyPlayers');
    }
    
    /**
     * 호스트 컨트롤 표시
     */
    showHostControls() {
        this.showPanel('startGameBtn');
    }
    
    /**
     * 호스트 컨트롤 숨기기
     */
    hideHostControls() {
        this.hidePanel('startGameBtn');
    }
    
    /**
     * 게임 UI 표시
     */
    showGameUI() {
        this.showPanel('leaderboardPanel');
        this.showPanel('playerInfoPanel');
        this.showPanel('timerContainer');
    }
    
    /**
     * 게임 UI 숨기기
     */
    hideGameUI() {
        this.hidePanel('leaderboardPanel');
        this.hidePanel('playerInfoPanel');
        this.hidePanel('timerContainer');
    }
    
    // ========== 공개 메서드들 ==========
    
    /**
     * 세션 생성
     */
    createSession() {
        try {
            super.createSession();
        } catch (error) {
            console.error('❌ 세션 생성 실패:', error);
            this.updateGameStatus('세션 생성 실패');
        }
    }
    
    /**
     * 룸 생성
     */
    createRoom() {
        try {
            super.createRoom('멀티플레이어 센서 테스트 룸');
        } catch (error) {
            console.error('❌ 룸 생성 실패:', error);
            this.updateGameStatus('룸 생성 실패');
        }
    }
    
    /**
     * 룸 참가 (프롬프트)
     */
    promptJoinRoom() {
        const roomId = prompt('참가할 룸 ID를 입력하세요:');
        if (roomId) {
            try {
                super.joinRoom(roomId.trim(), `플레이어${Math.floor(Math.random() * 1000)}`);
            } catch (error) {
                console.error('❌ 룸 참가 실패:', error);
                this.updateGameStatus('룸 참가 실패');
            }
        }
    }
    
    /**
     * 게임 시작 (호스트)
     */
    startGame() {
        if (this.isHost) {
            try {
                super.startGame();
            } catch (error) {
                console.error('❌ 게임 시작 실패:', error);
                this.updateGameStatus('게임 시작 실패');
            }
        }
    }
    
    /**
     * 게임 재시작
     */
    restartGame() {
        if (!this.isHost) return;
        
        // 게임 상태 초기화
        this.gameEnded = false;
        this.gameStarted = false;
        this.gameTimeLeft = 180;
        
        // 플레이어 상태 초기화
        this.players.forEach(player => {
            player.score = 0;
            player.targetStreak = 0;
            player.trail = [];
        });
        
        // 게임 오브젝트 초기화
        this.targetZones = [];
        this.particles = [];
        this.backgroundHue = 220;
        
        // UI 업데이트
        this.hidePanel('resultsPanel');
        this.showWaitingRoom();
        this.showHostControls();
        this.updateLeaderboard();
        this.updatePlayerInfo();
        
        this.updateGameStatus('게임 재시작 준비 완료');
        console.log('🔄 멀티플레이어 게임 재시작 준비');
    }
    
    /**
     * 대기실로 돌아가기
     */
    returnToLobby() {
        this.hidePanel('resultsPanel');
        this.showWaitingRoom();
        
        if (this.isHost) {
            this.showHostControls();
        }
        
        this.updateGameStatus('대기실로 돌아감');
    }
    
    /**
     * 게임 정리
     */
    destroy() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        
        this.gameStarted = false;
        super.destroy();
        console.log('🗑️ 멀티플레이어 센서 테스트 게임 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('👥 멀티플레이어 센서 테스트 게임 (재설계) 로딩...');

try {
    window.game = new MultiPlayerSensorTestGame();
    console.log('✅ 멀티플레이어 센서 테스트 게임 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
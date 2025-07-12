/**
 * 👥 멀티플레이어 센서 테스트 게임
 * 
 * 최대 4명이 함께 플레이하는 멀티플레이어 센서 테스트 게임
 * - 실시간 멀티플레이어
 * - 경쟁적 점수 시스템
 * - 플레이어별 시각화
 * - 3분 타이머
 */

class MultiSensorTestGame extends SensorGameSDK {
    constructor() {
        super({
            gameId: 'multi-sensor-test',
            gameName: '멀티플레이어 센서 테스트',
            gameType: 'multiplayer',
            sensorTypes: ['orientation', 'accelerometer', 'gyroscope'],
            sensorConfig: {
                smoothing: 0.8,
                sensitivity: 1.0,
                deadzone: 0.1,
                shakeThreshold: 15
            },
            multiplayerConfig: {
                maxPlayers: 4,
                autoStart: false
            }
        });
        
        // 게임 요소들
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        
        // 플레이어 관리
        this.players = new Map(); // sessionId -> playerData
        this.myPlayer = null;
        this.playerColors = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b']; // 파란, 분홍, 초록, 주황
        
        // 게임 상태
        this.gameTimer = null;
        this.gameTimeLeft = 180; // 3분
        this.gameStartTime = null;
        
        // 시각 효과
        this.particles = [];
        this.backgroundHue = 220;
        
        // 게임 설정
        this.config = {
            ballSpeed: 6,
            friction: 0.90,
            bounceStrength: 0.6,
            particleCount: 12,
            particleLifetime: 50,
            trailLength: 15,
            scoreMultiplier: 8,
            playerRadius: 20
        };
        
        this.initializeGame();
    }
    
    /**
     * 게임 초기화
     */
    initializeGame() {
        console.log('👥 멀티플레이어 센서 테스트 게임 초기화');
        
        this.setupCanvas();
        this.setupEventListeners();
        this.updateGameStatus('세션 생성 대기');
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
                    this.reset();
                    break;
                case ' ':
                    e.preventDefault();
                    if (this.myPlayer) {
                        this.createParticles(this.myPlayer.x, this.myPlayer.y, 8);
                    }
                    break;
            }
        });
    }
    
    // ========== SDK 콜백 메서드들 ==========
    
    /**
     * SDK 준비 완료
     */
    onInit() {
        console.log('✅ SDK 초기화 완료');
        this.updateServerStatus(true);
    }
    
    /**
     * 세션 생성됨
     */
    onSessionCreated(data) {
        console.log('🔑 세션 생성됨:', data.sessionCode);
        this.updateGameStatus(`세션 코드: ${data.sessionCode}`);
        this.showRoomControls();
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(data) {
        console.log('📱 센서 연결됨');
        this.updateSensorStatus(true);
        this.updateGameStatus('센서 연결됨');
    }
    
    /**
     * 룸 생성됨
     */
    onRoomCreated(data) {
        console.log('🏠 룸 생성됨:', data.roomId);
        this.updateGameStatus(`룸 생성됨: ${data.roomId}`);
        this.showLobbyPlayers();
        this.showStartGameButton();
        
        // 룸 상태 업데이트
        if (data.roomStatus) {
            this.updateRoomStatus(data.roomStatus);
        }
    }
    
    /**
     * 룸 참가됨
     */
    onRoomJoined(data) {
        console.log('👥 룸 참가됨:', data.roomId);
        this.updateGameStatus('룸 참가됨');
        this.showLobbyPlayers();
        this.hideStartGameButton();
    }
    
    /**
     * 플레이어 참가
     */
    onPlayerJoined(data) {
        console.log('👤 플레이어 참가:', data.player.nickname);
        
        this.addPlayer({
            sessionId: data.player.sessionId,
            nickname: data.player.nickname,
            isHost: data.player.isHost || false,
            color: this.playerColors[this.players.size % this.playerColors.length]
        });
        
        this.updateLobbyDisplay();
        this.updateGameStatus(`플레이어 ${this.players.size}명 대기 중`);
    }
    
    /**
     * 플레이어 퇴장
     */
    onPlayerLeft(data) {
        console.log('👤 플레이어 퇴장');
        this.removePlayer(data.sessionId);
        this.updateLobbyDisplay();
        this.updateLeaderboard();
    }
    
    /**
     * 게임 시작
     */
    onGameStart(data) {
        console.log('🎮 게임 시작!');
        this.hideAllPanels();
        this.showGameUI();
        this.startGameplay();
    }
    
    /**
     * 룸 상태 업데이트
     */
    onRoomStatusUpdate(roomStatus) {
        console.log('🏠 룸 상태 업데이트:', roomStatus);
        this.updateRoomStatus(roomStatus);
    }
    
    /**
     * 플레이어 센서 연결
     */
    onPlayerSensorConnected(data) {
        console.log('📱 플레이어 센서 연결:', data);
        this.updateRoomStatus(data.roomStatus);
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(processedData, rawData) {
        if (this.state.gameStatus !== 'playing' || !this.myPlayer) return;
        
        // 내 플레이어 업데이트
        this.updateMyPlayer(processedData);
        
        // 다른 플레이어들에게 내 상태 전송
        this.sendGameEvent('player_update', {
            position: { x: this.myPlayer.x, y: this.myPlayer.y },
            score: this.myPlayer.score,
            activity: this.myPlayer.activity
        });
        
        // UI 업데이트
        this.updatePlayerInfo();
    }
    
    /**
     * 게임 이벤트 수신
     */
    onGameEvent(data) {
        const { eventType, data: eventData, fromSessionId } = data;
        
        switch (eventType) {
            case 'player_update':
                this.updateOtherPlayer(fromSessionId, eventData);
                break;
            case 'particle_effect':
                this.createParticles(eventData.x, eventData.y, eventData.count);
                break;
        }
    }
    
    /**
     * 오류 발생
     */
    onError(error) {
        console.error('❌ 게임 오류:', error.message);
        this.updateGameStatus(`오류: ${error.message}`);
    }
    
    // ========== 플레이어 관리 ==========
    
    /**
     * 룸 상태 업데이트
     */
    updateRoomStatus(roomStatus) {
        if (!roomStatus) return;
        
        console.log('🏠 룸 상태 업데이트:', roomStatus);
        
        // 플레이어 목록 업데이트
        this.players.clear();
        
        roomStatus.players.forEach(playerData => {
            this.addPlayer({
                sessionId: playerData.sessionId,
                nickname: playerData.nickname,
                isHost: playerData.isHost,
                sensorConnected: playerData.sensorConnected,
                color: this.playerColors[this.players.size % this.playerColors.length]
            });
        });
        
        // UI 업데이트
        this.updateLobbyDisplay();
        this.updateGameStatus(`플레이어 ${roomStatus.playerCount}/${roomStatus.maxPlayers}명 (${roomStatus.state})`);
        
        // 게임 시작 버튼 표시/숨김
        if (roomStatus.canStart && roomStatus.hostSessionId === this.state.sessionId) {
            this.showStartGameButton();
        } else {
            this.hideStartGameButton();
        }
    }
    
    /**
     * 플레이어 추가
     */
    addPlayer(playerData) {
        const player = {
            sessionId: playerData.sessionId,
            nickname: playerData.nickname,
            isHost: playerData.isHost,
            color: playerData.color,
            sensorConnected: playerData.sensorConnected || false,
            score: 0,
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
            y: window.innerHeight / 2 + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0,
            trail: [],
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
        
        // 움직임 업데이트
        this.myPlayer.vx += sensorData.tilt.x * this.config.ballSpeed;
        this.myPlayer.vy += sensorData.tilt.y * this.config.ballSpeed;
        
        // 최대 속도 제한
        const maxSpeed = 12;
        this.myPlayer.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.myPlayer.vx));
        this.myPlayer.vy = Math.max(-maxSpeed, Math.min(maxSpeed, this.myPlayer.vy));
        
        // 위치 업데이트
        this.myPlayer.x += this.myPlayer.vx;
        this.myPlayer.y += this.myPlayer.vy;
        
        // 마찰력
        this.myPlayer.vx *= this.config.friction;
        this.myPlayer.vy *= this.config.friction;
        
        // 경계 처리
        this.handlePlayerBoundaries(this.myPlayer);
        
        // 활동 강도 계산
        const tiltIntensity = Math.abs(sensorData.tilt.x) + Math.abs(sensorData.tilt.y);
        const shakeIntensity = sensorData.shake.detected ? sensorData.shake.intensity : 0;
        const rotationIntensity = Math.abs(sensorData.rotation.x) + Math.abs(sensorData.rotation.y) + Math.abs(sensorData.rotation.z);
        
        this.myPlayer.activity = {
            tilt: Math.min(tiltIntensity * 100, 100),
            shake: Math.min(shakeIntensity * 20, 100),
            rotation: Math.min(rotationIntensity * 50, 100)
        };
        
        // 점수 업데이트
        const totalActivity = tiltIntensity + shakeIntensity + rotationIntensity;
        if (totalActivity > 0.1) {
            this.myPlayer.score += Math.floor(totalActivity * this.config.scoreMultiplier);
        }
        
        // 흔들기 파티클
        if (sensorData.shake.detected) {
            this.createParticles(this.myPlayer.x, this.myPlayer.y, Math.min(shakeIntensity * 2, 10));
            
            // 다른 플레이어들에게 파티클 효과 전송
            this.sendGameEvent('particle_effect', {
                x: this.myPlayer.x,
                y: this.myPlayer.y,
                count: Math.min(shakeIntensity * 2, 8)
            });
        }
        
        // 궤적 업데이트
        this.updatePlayerTrail(this.myPlayer);
    }
    
    /**
     * 다른 플레이어 업데이트
     */
    updateOtherPlayer(sessionId, data) {
        const player = this.players.get(sessionId);
        if (!player || player === this.myPlayer) return;
        
        // 위치 보간
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
        
        // 궤적 업데이트
        this.updatePlayerTrail(player);
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
        }
        
        if (player.x + radius > width) {
            player.x = width - radius;
            player.vx *= -this.config.bounceStrength;
        }
        
        if (player.y - radius < 0) {
            player.y = radius;
            player.vy *= -this.config.bounceStrength;
        }
        
        if (player.y + radius > height) {
            player.y = height - radius;
            player.vy *= -this.config.bounceStrength;
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
    
    // ========== 게임 로직 ==========
    
    /**
     * 게임플레이 시작
     */
    startGameplay() {
        this.state.gameStatus = 'playing';
        this.gameStartTime = Date.now();
        this.gameTimeLeft = 180;
        
        this.startGameLoop();
        this.startGameTimer();
        
        console.log('🎮 멀티플레이어 게임 시작!');
    }
    
    /**
     * 게임 루프 시작
     */
    startGameLoop() {
        const loop = () => {
            if (this.state.gameStatus === 'playing') {
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
        // 파티클 업데이트
        this.updateParticles();
        
        // 배경색 업데이트
        this.updateBackgroundColor();
        
        // 리더보드 업데이트
        this.updateLeaderboard();
    }
    
    /**
     * 파티클 생성
     */
    createParticles(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: this.config.particleLifetime,
                size: Math.random() * 3 + 2,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`
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
            totalActivity += (player.activity.rotation || 0);
        });
        
        if (totalActivity > 10) {
            this.backgroundHue += totalActivity * 0.1;
            this.backgroundHue = this.backgroundHue % 360;
        }
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        this.state.gameStatus = 'ended';
        
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        
        this.showGameResults();
        console.log('🏁 게임 종료');
    }
    
    // ========== 렌더링 ==========
    
    /**
     * 게임 렌더링
     */
    render() {
        this.clearCanvas();
        this.renderBackground();
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
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(player.trail[0].x, player.trail[0].y);
        
        for (let i = 1; i < player.trail.length; i++) {
            const point = player.trail[i];
            const alpha = point.life / this.config.trailLength;
            
            this.ctx.globalAlpha = alpha * 0.6;
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
        
        // 그림자
        if (isMe) {
            this.ctx.shadowColor = player.color;
            this.ctx.shadowBlur = 25;
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
        
        // 테두리 (내 플레이어는 굵게)
        this.ctx.strokeStyle = player.color;
        this.ctx.lineWidth = isMe ? 3 : 1;
        this.ctx.stroke();
        
        // 닉네임
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.nickname, player.x, player.y - radius - 10);
        
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
     * 대기실 표시 업데이트
     */
    updateLobbyDisplay() {
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
            winnerElement.textContent = `🏆 ${winner.nickname} 우승!`;
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
        
        this.showPanel('resultsPanel');
    }
    
    // ========== UI 제어 ==========
    
    /**
     * 패널 표시
     */
    showPanel(panelId) {
        document.getElementById(panelId).classList.remove('hidden');
    }
    
    /**
     * 패널 숨기기
     */
    hidePanel(panelId) {
        document.getElementById(panelId).classList.add('hidden');
    }
    
    /**
     * 모든 패널 숨기기
     */
    hideAllPanels() {
        ['lobbyPanel', 'resultsPanel'].forEach(id => this.hidePanel(id));
    }
    
    /**
     * 룸 컨트롤 표시
     */
    showRoomControls() {
        this.hidePanel('createSessionBtn');
        this.showPanel('roomControls');
    }
    
    /**
     * 대기실 플레이어 목록 표시
     */
    showLobbyPlayers() {
        this.hidePanel('roomControls');
        this.showPanel('lobbyPlayers');
    }
    
    /**
     * 게임 시작 버튼 표시
     */
    showStartGameButton() {
        this.showPanel('startGameBtn');
    }
    
    /**
     * 게임 시작 버튼 숨기기
     */
    hideStartGameButton() {
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
    
    // ========== 공개 메서드들 ==========
    
    /**
     * 세션 생성
     */
    createSession() {
        try {
            // 멀티플레이어 게임용 세션 생성
            this.createGameSession('multiplayer');
        } catch (error) {
            console.error('세션 생성 실패:', error);
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
            console.error('룸 생성 실패:', error);
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
                super.joinRoom(roomId.trim(), 'Player');
            } catch (error) {
                console.error('룸 참가 실패:', error);
                this.updateGameStatus('룸 참가 실패');
            }
        }
    }
    
    /**
     * 게임 시작 (호스트)
     */
    startGame() {
        try {
            super.startGame();
        } catch (error) {
            console.error('게임 시작 실패:', error);
            this.updateGameStatus('게임 시작 실패');
        }
    }
    
    /**
     * 게임 리셋
     */
    reset() {
        this.players.forEach(player => {
            player.score = 0;
            player.x = window.innerWidth / 2 + (Math.random() - 0.5) * 200;
            player.y = window.innerHeight / 2 + (Math.random() - 0.5) * 200;
            player.vx = 0;
            player.vy = 0;
            player.trail = [];
        });
        
        this.particles = [];
        this.backgroundHue = 220;
        
        this.updateLeaderboard();
        this.updatePlayerInfo();
        
        console.log('🔄 게임 리셋');
    }
    
    /**
     * 대기실로 돌아가기
     */
    returnToLobby() {
        this.hideAllPanels();
        this.showPanel('lobbyPanel');
        
        this.state.gameStatus = 'waiting';
        this.reset();
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
        
        super.destroy();
        console.log('🗑️ 멀티플레이어 센서 테스트 게임 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('👥 멀티플레이어 센서 테스트 게임 로딩...');

try {
    window.game = new MultiSensorTestGame();
    console.log('✅ 멀티플레이어 센서 테스트 게임 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
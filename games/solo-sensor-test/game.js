/**
 * 🎯 솔로 센서 테스트 게임
 * 
 * 센서 기능을 테스트하는 기본 싱글플레이어 게임
 * - 기울기: 공 움직임
 * - 흔들기: 파티클 효과
 * - 회전: 배경색 변화
 * - 점수 시스템
 */

class SoloSensorTestGame extends SensorGameSDK {
    constructor() {
        super({
            gameId: 'solo-sensor-test',
            gameName: '솔로 센서 테스트',
            gameType: 'solo',
            sensorTypes: ['orientation', 'accelerometer', 'gyroscope'],
            sensorConfig: {
                smoothing: 0.8,
                sensitivity: 1.0,
                deadzone: 0.1,
                shakeThreshold: 15
            }
        });
        
        // 게임 요소들
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        
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
        
        this.initializeGame();
    }
    
    /**
     * 게임 초기화
     */
    initializeGame() {
        console.log('🎯 솔로 센서 테스트 게임 초기화');
        
        this.setupCanvas();
        this.setupEventListeners();
        
        // 초기 UI 상태
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
        
        // 볼 초기 위치
        this.ball.x = this.canvas.width / 2;
        this.ball.y = this.canvas.height / 2;
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
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
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
    
    // ========== SDK 콜백 메서드들 ==========
    
    /**
     * SDK 준비 완료
     */
    onInit() {
        console.log('✅ SDK 초기화 완료');
        this.updateServerStatus(true);
    }
    
    /**
     * 서버 연결됨
     */
    onServerConnected() {
        this.updateServerStatus(true);
        this.updateGameStatus('세션 생성 준비 완료');
    }
    
    /**
     * 세션 생성됨
     */
    onSessionCreated(data) {
        console.log('🔑 세션 생성됨:', data.sessionCode);
        this.updateGameStatus(`세션 코드: ${data.sessionCode}`);
        this.hideInstructionPanel();
    }
    
    /**
     * 센서 연결됨
     */
    onSensorConnected(data) {
        console.log('📱 센서 연결됨');
        this.updateSensorStatus(true);
        this.updateGameStatus('게임 시작!');
        this.startGame();
    }
    
    /**
     * 센서 데이터 수신
     */
    onSensorData(processedData, rawData) {
        console.log('🎮 게임에서 센서 데이터 수신:', processedData);
        
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
        this.updateSensorDataDisplay(processedData, rawData);
    }
    
    /**
     * 오류 발생
     */
    onError(error) {
        console.error('❌ 게임 오류:', error.message);
        this.updateGameStatus(`오류: ${error.message}`);
    }
    
    // ========== 게임 로직 ==========
    
    /**
     * 게임 시작
     */
    startGame() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        this.state.gameStatus = 'playing';
        this.startGameLoop();
        
        console.log('🎮 게임 시작!');
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
    
    // ========== 공개 메서드들 ==========
    
    /**
     * 세션 생성 (버튼 클릭)
     */
    createSession() {
        try {
            super.createSession();
        } catch (error) {
            console.error('세션 생성 실패:', error);
            this.updateGameStatus('세션 생성 실패');
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
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        super.destroy();
        console.log('🗑️ 솔로 센서 테스트 게임 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('🎯 솔로 센서 테스트 게임 로딩...');

try {
    window.game = new SoloSensorTestGame();
    console.log('✅ 솔로 센서 테스트 게임 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
/**
 * 🎮 듀얼 센서 테스트 게임
 * 
 * 두 개의 센서를 동시에 사용하여 협조 플레이를 하는 게임
 * - 센서 1: 파란색 공 조종
 * - 센서 2: 빨간색 공 조종
 * - 목표: 두 공을 목표 지점에 동시에 도달시키기
 */

class DualSensorTestGame extends SensorGameSDK {
    constructor() {
        super({
            gameId: 'dual-sensor-test',
            gameName: '듀얼 센서 테스트',
            gameType: 'dual',
            sensorTypes: ['orientation', 'accelerometer', 'gyroscope'],
            sensorConfig: {
                smoothing: 0.8,
                sensitivity: 1.0,
                deadzone: 0.1,
                shakeThreshold: 15
            },
            dualSensorConfig: {
                requiresBothSensors: true,
                sensor1Label: '센서 1 (파란공)',
                sensor2Label: '센서 2 (빨간공)'
            }
        });
        
        // 게임 요소들
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        
        // 센서 상태 관리
        this.sensor1Connected = false;
        this.sensor2Connected = false;
        this.sensorData = {
            sensor1: null,
            sensor2: null
        };
        
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
                isAtTarget: false
            },
            sensor2: {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                radius: 20,
                color: '#ef4444',
                trail: [],
                isAtTarget: false
            }
        };
        
        this.target = {
            x: 0,
            y: 0,
            radius: 40,
            pulseSize: 0,
            pulseDirection: 1
        };
        
        this.particles = [];
        this.backgroundHue = 220;
        this.score = 0;
        this.missionCount = 0;
        
        // 게임 설정
        this.config = {
            ballSpeed: 6,
            friction: 0.94,
            bounceStrength: 0.6,
            particleCount: 12,
            particleLifetime: 60,
            trailLength: 15,
            targetTolerance: 30, // 목표 도달 허용 거리
            scorePerMission: 100,
            targetPulseSpeed: 0.1
        };
        
        this.initializeGame();
    }
    
    /**
     * 게임 초기화
     */
    initializeGame() {
        console.log('🎮 듀얼 센서 테스트 게임 초기화');
        
        this.setupCanvas();
        this.setupEventListeners();
        this.generateNewTarget();
        
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
        if (this.balls.sensor1.x === 0 && this.balls.sensor1.y === 0) {
            this.resetBallPositions();
        }
    }
    
    /**
     * 볼 위치 초기화
     */
    resetBallPositions() {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // 센서 1 볼 (왼쪽)
        this.balls.sensor1.x = centerX - 100;
        this.balls.sensor1.y = centerY;
        this.balls.sensor1.vx = 0;
        this.balls.sensor1.vy = 0;
        this.balls.sensor1.trail = [];
        this.balls.sensor1.isAtTarget = false;
        
        // 센서 2 볼 (오른쪽)
        this.balls.sensor2.x = centerX + 100;
        this.balls.sensor2.y = centerY;
        this.balls.sensor2.vx = 0;
        this.balls.sensor2.vy = 0;
        this.balls.sensor2.trail = [];
        this.balls.sensor2.isAtTarget = false;
    }
    
    /**
     * 새 목표 지점 생성
     */
    generateNewTarget() {
        const margin = 80;
        this.target.x = margin + Math.random() * (window.innerWidth - 2 * margin);
        this.target.y = margin + Math.random() * (window.innerHeight - 2 * margin);
        this.target.pulseSize = 0;
        
        // 볼들의 목표 도달 상태 초기화
        this.balls.sensor1.isAtTarget = false;
        this.balls.sensor2.isAtTarget = false;
        
        this.updateTargetIndicators();
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
                    this.generateNewTarget();
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
        this.hideInstructionPanel();
    }
    
    /**
     * 센서 연결됨 (듀얼 센서 지원)
     */
    onSensorConnected(data) {
        console.log('📱 센서 연결됨:', data);
        
        // 센서 ID로 구분
        if (data.sensorId === 'sensor1') {
            this.sensor1Connected = true;
            this.updateSensorStatus('sensor1', true);
            console.log('📱 센서 1 연결됨');
        } else if (data.sensorId === 'sensor2') {
            this.sensor2Connected = true;
            this.updateSensorStatus('sensor2', true);
            console.log('📱 센서 2 연결됨');
        }
        
        // 두 센서가 모두 연결되면 게임 시작
        if (this.sensor1Connected && this.sensor2Connected) {
            this.startGame();
        } else {
            this.updateGameStatus('추가 센서 연결 대기 중...');
        }
    }
    
    /**
     * 센서 연결 해제됨
     */
    onSensorDisconnected(data) {
        console.log('📱 센서 연결 해제됨:', data);
        
        if (data.sensorId === 'sensor1') {
            this.sensor1Connected = false;
            this.updateSensorStatus('sensor1', false);
        } else if (data.sensorId === 'sensor2') {
            this.sensor2Connected = false;
            this.updateSensorStatus('sensor2', false);
        }
        
        this.updateGameStatus('센서 재연결 대기 중...');
    }
    
    /**
     * 센서 데이터 수신 (듀얼 센서)
     */
    onSensorData(processedData, rawData, sensorId) {
        if (this.state.gameStatus !== 'playing') return;
        
        // 센서별 데이터 저장
        this.sensorData[sensorId] = processedData;
        
        // 해당 센서의 볼 업데이트
        if (sensorId === 'sensor1') {
            this.updateBall('sensor1', processedData);
        } else if (sensorId === 'sensor2') {
            this.updateBall('sensor2', processedData);
        }
        
        // 목표 도달 확인
        this.checkTargetReached();
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
        this.showGameUI();
        this.startGameLoop();
        
        this.updateGameStatus('게임 진행 중');
        console.log('🎮 듀얼 센서 게임 시작!');
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
        this.updateBallPhysics('sensor1');
        this.updateBallPhysics('sensor2');
        
        // 파티클 업데이트
        this.updateParticles();
        
        // 목표 펄스 애니메이션 업데이트
        this.updateTargetPulse();
        
        // 볼 궤적 업데이트
        this.updateBallTrails();
    }
    
    /**
     * 볼 업데이트 (센서 데이터 기반)
     */
    updateBall(sensorId, sensorData) {
        const ball = this.balls[sensorId];
        if (!ball) return;
        
        // 기울기를 속도로 변환
        ball.vx += sensorData.tilt.x * this.config.ballSpeed;
        ball.vy += sensorData.tilt.y * this.config.ballSpeed;
        
        // 최대 속도 제한
        const maxSpeed = 12;
        ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vx));
        ball.vy = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vy));
        
        // 흔들기 파티클 효과
        if (sensorData.shake.detected) {
            this.createParticles(ball.x, ball.y, Math.min(sensorData.shake.intensity * 2, 8), ball.color);
        }
    }
    
    /**
     * 볼 물리 업데이트
     */
    updateBallPhysics(sensorId) {
        const ball = this.balls[sensorId];
        if (!ball) return;
        
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
            this.createParticles(ball.x, ball.y, 3, ball.color);
        }
        
        if (ball.x + radius > width) {
            ball.x = width - radius;
            ball.vx *= -this.config.bounceStrength;
            this.createParticles(ball.x, ball.y, 3, ball.color);
        }
        
        if (ball.y - radius < 0) {
            ball.y = radius;
            ball.vy *= -this.config.bounceStrength;
            this.createParticles(ball.y, ball.y, 3, ball.color);
        }
        
        if (ball.y + radius > height) {
            ball.y = height - radius;
            ball.vy *= -this.config.bounceStrength;
            this.createParticles(ball.x, ball.y, 3, ball.color);
        }
    }
    
    /**
     * 볼 궤적 업데이트
     */
    updateBallTrails() {
        Object.values(this.balls).forEach(ball => {
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
        });
    }
    
    /**
     * 목표 도달 확인
     */
    checkTargetReached() {
        const ball1 = this.balls.sensor1;
        const ball2 = this.balls.sensor2;
        
        // 각 볼이 목표에 도달했는지 확인
        const dist1 = Math.sqrt(Math.pow(ball1.x - this.target.x, 2) + Math.pow(ball1.y - this.target.y, 2));
        const dist2 = Math.sqrt(Math.pow(ball2.x - this.target.x, 2) + Math.pow(ball2.y - this.target.y, 2));
        
        ball1.isAtTarget = dist1 <= this.config.targetTolerance;
        ball2.isAtTarget = dist2 <= this.config.targetTolerance;
        
        // UI 업데이트
        this.updateTargetIndicators();
        
        // 두 볼이 모두 목표에 도달했을 때
        if (ball1.isAtTarget && ball2.isAtTarget) {
            this.missionComplete();
        }
    }
    
    /**
     * 미션 완료 처리
     */
    missionComplete() {
        this.missionCount++;
        this.score += this.config.scorePerMission;
        
        // 성공 파티클 효과
        this.createSuccessParticles();
        
        // UI 업데이트
        this.updateScoreDisplay();
        this.updateMissionDisplay();
        
        // 성공 패널 표시
        this.showSuccessPanel();
        
        console.log(`🎉 미션 ${this.missionCount} 완료! 점수: ${this.score}`);
    }
    
    /**
     * 성공 파티클 생성
     */
    createSuccessParticles() {
        const centerX = this.target.x;
        const centerY = this.target.y;
        
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: centerX + (Math.random() - 0.5) * 60,
                y: centerY + (Math.random() - 0.5) * 60,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15,
                life: this.config.particleLifetime * 1.5,
                size: Math.random() * 6 + 3,
                color: `hsl(${Math.random() * 60 + 40}, 70%, 60%)` // 황금색 계열
            });
        }
    }
    
    /**
     * 파티클 생성
     */
    createParticles(x, y, count, color = null) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: this.config.particleLifetime,
                size: Math.random() * 3 + 2,
                color: color || `hsl(${this.backgroundHue}, 70%, 60%)`
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
     * 목표 펄스 애니메이션 업데이트
     */
    updateTargetPulse() {
        this.target.pulseSize += this.target.pulseDirection * this.config.targetPulseSpeed;
        
        if (this.target.pulseSize >= 1) {
            this.target.pulseSize = 1;
            this.target.pulseDirection = -1;
        } else if (this.target.pulseSize <= 0) {
            this.target.pulseSize = 0;
            this.target.pulseDirection = 1;
        }
    }
    
    // ========== 렌더링 ==========
    
    /**
     * 게임 렌더링
     */
    render() {
        this.clearCanvas();
        this.renderBackground();
        this.renderTarget();
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
        
        gradient.addColorStop(0, `hsl(${this.backgroundHue}, 20%, 8%)`);
        gradient.addColorStop(1, `hsl(${this.backgroundHue}, 30%, 4%)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    
    /**
     * 목표 지점 렌더링
     */
    renderTarget() {
        this.ctx.save();
        
        const x = this.target.x;
        const y = this.target.y;
        const baseRadius = this.target.radius;
        const pulseRadius = baseRadius + this.target.pulseSize * 15;
        
        // 외곽 펄스 원
        this.ctx.globalAlpha = 0.3 * (1 - this.target.pulseSize);
        this.ctx.strokeStyle = '#10b981';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 메인 목표 원
        this.ctx.globalAlpha = 0.8;
        this.ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#10b981';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // 중앙 점
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = '#10b981';
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    /**
     * 볼 궤적 렌더링
     */
    renderBallTrails() {
        Object.values(this.balls).forEach(ball => {
            if (ball.trail.length < 2) return;
            
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
        });
    }
    
    /**
     * 볼 렌더링
     */
    renderBalls() {
        Object.values(this.balls).forEach(ball => {
            this.ctx.save();
            
            // 목표에 도달한 볼은 글로우 효과
            if (ball.isAtTarget) {
                this.ctx.shadowColor = ball.color;
                this.ctx.shadowBlur = 25;
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
            gradient.addColorStop(0.3, ball.color);
            gradient.addColorStop(1, '#1e293b');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 테두리
            this.ctx.strokeStyle = ball.color;
            this.ctx.lineWidth = ball.isAtTarget ? 3 : 1;
            this.ctx.stroke();
            
            this.ctx.restore();
        });
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
        const element = document.getElementById(`${sensorId}Status`);
        if (element) {
            element.classList.toggle('connected', connected);
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
     * 목표 도달 인디케이터 업데이트
     */
    updateTargetIndicators() {
        const sensor1Target = document.getElementById('sensor1Target');
        const sensor2Target = document.getElementById('sensor2Target');
        
        if (sensor1Target) {
            sensor1Target.classList.toggle('completed', this.balls.sensor1.isAtTarget);
        }
        
        if (sensor2Target) {
            sensor2Target.classList.toggle('completed', this.balls.sensor2.isAtTarget);
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
     * 미션 카운터 업데이트
     */
    updateMissionDisplay() {
        const element = document.getElementById('missionCount');
        if (element) {
            element.textContent = this.missionCount;
        }
    }
    
    // ========== UI 제어 ==========
    
    /**
     * 게임 UI 표시
     */
    showGameUI() {
        document.getElementById('missionPanel').classList.remove('hidden');
        document.getElementById('scorePanel').classList.remove('hidden');
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
     * 성공 패널 표시
     */
    showSuccessPanel() {
        const panel = document.getElementById('successPanel');
        const message = document.getElementById('successMessage');
        
        if (panel && message) {
            message.textContent = `미션 ${this.missionCount} 완료! 점수: ${this.score}점`;
            panel.classList.remove('hidden');
            
            // 3초 후 자동으로 숨기기
            setTimeout(() => {
                this.hideSuccessPanel();
            }, 3000);
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
    
    // ========== 공개 메서드들 ==========
    
    /**
     * 세션 생성
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
     * 새 미션 시작
     */
    startNewMission() {
        this.generateNewTarget();
        this.hideSuccessPanel();
        this.resetBallPositions();
    }
    
    /**
     * 게임 리셋
     */
    reset() {
        // 볼 위치 초기화
        this.resetBallPositions();
        
        // 새 목표 생성
        this.generateNewTarget();
        
        // 파티클 정리
        this.particles = [];
        
        // 점수 및 미션 초기화
        this.score = 0;
        this.missionCount = 0;
        
        // UI 업데이트
        this.updateScoreDisplay();
        this.updateMissionDisplay();
        this.updateTargetIndicators();
        this.hideSuccessPanel();
        
        console.log('🔄 듀얼 센서 게임 리셋');
    }
    
    /**
     * 게임 정리
     */
    destroy() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        super.destroy();
        console.log('🗑️ 듀얼 센서 테스트 게임 정리 완료');
    }
}

// 게임 인스턴스 생성
console.log('🎮 듀얼 센서 테스트 게임 로딩...');

try {
    window.game = new DualSensorTestGame();
    console.log('✅ 듀얼 센서 테스트 게임 로드 완료');
} catch (error) {
    console.error('❌ 게임 로드 실패:', error);
}
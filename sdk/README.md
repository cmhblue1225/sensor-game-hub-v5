# 🎮 센서 게임 SDK v6.0

모바일 센서를 활용한 게임 개발을 위한 완전한 JavaScript SDK입니다.

## ✨ 주요 특징

- **🎯 간단한 API**: 복잡한 센서 매칭 시스템을 간단한 API로 추상화
- **🎮 다양한 게임 모드**: 솔로, 듀얼 센서, 멀티플레이어 지원
- **🔄 자동 연결 관리**: 자동 재연결 및 에러 복구
- **📱 실시간 센서 데이터**: 가속도계, 자이로스코프, 방향 센서 지원
- **🎨 완전한 예제**: 각 게임 모드별 완전한 구현 예제 제공

## 🚀 빠른 시작

### 1. SDK 포함

```html
<script src="sdk/core/SensorGameSDK.js"></script>
```

### 2. SDK 초기화

```javascript
const sdk = createSensorGameSDK({
    serverUrl: 'wss://localhost:3000',
    gameId: 'my-awesome-game',
    gameTitle: '나의 멋진 게임',
    debug: true
});
```

### 3. 서버 연결

```javascript
await sdk.connect();
```

### 4. 게임 시작

```javascript
// 솔로 게임
await sdk.startSoloGame();

// 듀얼 센서 게임
await sdk.startDualGame();

// 멀티플레이어 게임
await sdk.createMultiplayerRoom({
    maxPlayers: 4,
    hostNickname: 'Host'
});
```

## 📖 API 문서

### SensorGameSDK 클래스

#### 생성자 옵션

```javascript
const options = {
    serverUrl: 'wss://localhost:3000',    // WebSocket 서버 URL
    gameId: 'my-game',                    // 게임 고유 ID
    gameTitle: 'My Game',                 // 게임 제목
    autoReconnect: true,                  // 자동 재연결 (기본: true)
    reconnectInterval: 3000,              // 재연결 간격 (기본: 3초)
    heartbeatInterval: 30000,             // 하트비트 간격 (기본: 30초)
    debug: false                          // 디버그 모드 (기본: false)
};
```

#### 주요 메서드

##### 연결 관리
```javascript
await sdk.connect()           // 서버 연결
sdk.disconnect()              // 연결 해제
```

##### 게임 시작
```javascript
await sdk.startSoloGame(config)                    // 솔로 게임 시작
await sdk.startDualGame(config)                    // 듀얼 센서 게임 시작
await sdk.createMultiplayerRoom(options)           // 멀티플레이어 룸 생성
await sdk.joinMultiplayerRoom(roomId, options)     // 멀티플레이어 룸 참가
```

##### 게임 제어
```javascript
await sdk.startGame()         // 게임 플레이 시작
await sdk.endGame(reason)     // 게임 종료
```

##### 데이터 조회
```javascript
sdk.getSensorData(sensorId)   // 센서 데이터 조회
sdk.getConnectedSensors()     // 연결된 센서 목록
sdk.isGameReady()             // 게임 준비 상태
sdk.getSessionInfo()          // 세션 정보
sdk.getStats()                // 통계 정보
```

### 이벤트 시스템

#### 연결 이벤트
```javascript
sdk.on('connected', () => {
    console.log('서버에 연결되었습니다');
});

sdk.on('disconnected', (data) => {
    console.log('연결 끊김:', data.reason);
});
```

#### 세션 이벤트
```javascript
sdk.on('sessionCreated', (data) => {
    console.log('세션 생성:', data.sessionCode);
});

sdk.on('sensorConnected', (data) => {
    console.log('센서 연결:', data.sensorId);
});
```

#### 센서 데이터 이벤트
```javascript
sdk.on('sensorData', (data) => {
    const { sensorId, data: sensorData } = data;
    
    // 가속도계 데이터
    if (sensorData.accelerometer) {
        const { x, y, z } = sensorData.accelerometer;
        console.log('가속도:', x, y, z);
    }
    
    // 자이로스코프 데이터
    if (sensorData.gyroscope) {
        const { x, y, z } = sensorData.gyroscope;
        console.log('자이로:', x, y, z);
    }
    
    // 방향 센서 데이터
    if (sensorData.orientation) {
        const { alpha, beta, gamma } = sensorData.orientation;
        console.log('방향:', alpha, beta, gamma);
    }
});
```

#### 게임 이벤트
```javascript
sdk.on('gameStarted', (data) => {
    console.log('게임 시작!');
});

sdk.on('gameEnded', (data) => {
    console.log('게임 종료:', data.reason);
});
```

#### 멀티플레이어 이벤트
```javascript
sdk.on('roomCreated', (data) => {
    console.log('룸 생성:', data.roomId);
});

sdk.on('playerJoined', (data) => {
    console.log('플레이어 참가:', data.player.nickname);
});

sdk.on('playerLeft', (data) => {
    console.log('플레이어 퇴장:', data.player.nickname);
});
```

## 🎮 게임 모드별 가이드

### 솔로 게임

단일 센서를 사용하는 게임입니다.

```javascript
// 1. 솔로 게임 시작
await sdk.startSoloGame({
    gameMode: 'tilt-ball',
    difficulty: 'normal'
});

// 2. 세션 코드 표시 (사용자가 모바일에서 입력)
sdk.on('sessionCreated', (data) => {
    displaySessionCode(data.sessionCode);
});

// 3. 센서 연결 대기
sdk.on('sensorConnected', (data) => {
    if (data.isReady) {
        showStartButton();
    }
});

// 4. 게임 시작
await sdk.startGame();

// 5. 센서 데이터 처리
sdk.on('sensorData', (data) => {
    updatePlayer(data.data);
});
```

### 듀얼 센서 게임

두 개의 센서를 사용하는 협력/경쟁 게임입니다.

```javascript
// 1. 듀얼 게임 시작 (2개 센서 필요)
await sdk.startDualGame({
    gameMode: 'cooperative',
    difficulty: 'normal'
});

// 2. 센서 연결 확인 (2개 모두 연결되어야 함)
sdk.on('sensorConnected', (data) => {
    console.log(`센서 연결: ${data.connectedCount}/2`);
    if (data.isReady) {
        // 2개 센서 모두 연결됨
        showStartButton();
    }
});

// 3. 센서별 데이터 처리
sdk.on('sensorData', (data) => {
    const connectedSensors = sdk.getConnectedSensors();
    
    if (data.sensorId === connectedSensors[0]) {
        updatePlayer1(data.data);
    } else if (data.sensorId === connectedSensors[1]) {
        updatePlayer2(data.data);
    }
});
```

### 멀티플레이어 게임

여러 플레이어가 참여하는 실시간 게임입니다.

```javascript
// 1. 룸 생성 (호스트)
await sdk.createMultiplayerRoom({
    maxPlayers: 4,
    hostNickname: 'Host',
    isPrivate: false
});

// 또는 룸 참가 (게스트)
await sdk.joinMultiplayerRoom('ABCD1234', {
    nickname: 'Player1'
});

// 2. 플레이어 입장/퇴장 처리
sdk.on('playerJoined', (data) => {
    addPlayerToLobby(data.player);
});

sdk.on('playerLeft', (data) => {
    removePlayerFromLobby(data.player);
});

// 3. 게임 시작 (호스트만 가능)
await sdk.startGame();

// 4. 멀티플레이어 센서 데이터
sdk.on('sensorData', (data) => {
    if (data.fromSessionId) {
        // 다른 플레이어의 센서 데이터
        updateOtherPlayer(data.fromSessionId, data.data);
    } else {
        // 내 센서 데이터
        updateMyPlayer(data.data);
    }
});
```

## 📱 센서 데이터 구조

```javascript
{
    accelerometer: {
        x: number,    // X축 가속도 (m/s²)
        y: number,    // Y축 가속도 (m/s²)
        z: number     // Z축 가속도 (m/s²)
    },
    gyroscope: {
        x: number,    // X축 각속도 (rad/s)
        y: number,    // Y축 각속도 (rad/s)
        z: number     // Z축 각속도 (rad/s)
    },
    orientation: {
        alpha: number,  // Z축 회전 (0-360°)
        beta: number,   // X축 회전 (-180-180°)
        gamma: number   // Y축 회전 (-90-90°)
    },
    timestamp: number   // 타임스탬프
}
```

## 🎯 실제 예제

### 완전한 솔로 게임 예제

```html
<!DOCTYPE html>
<html>
<head>
    <title>솔로 틸트 게임</title>
    <script src="sdk/core/SensorGameSDK.js"></script>
</head>
<body>
    <div id="game-container"></div>
    <script src="sdk/examples/SoloGameExample.js"></script>
</body>
</html>
```

### 완전한 듀얼 게임 예제

```html
<!DOCTYPE html>
<html>
<head>
    <title>듀얼 협력 게임</title>
    <script src="sdk/core/SensorGameSDK.js"></script>
</head>
<body>
    <div id="game-container"></div>
    <script src="sdk/examples/DualGameExample.js"></script>
</body>
</html>
```

### 완전한 멀티플레이어 예제

```html
<!DOCTYPE html>
<html>
<head>
    <title>멀티플레이어 레이싱</title>
    <script src="sdk/core/SensorGameSDK.js"></script>
</head>
<body>
    <div id="game-container"></div>
    <script src="sdk/examples/MultiplayerGameExample.js"></script>
</body>
</html>
```

## 🔧 고급 설정

### 센서 데이터 필터링

```javascript
sdk.on('sensorData', (data) => {
    const sensorData = data.data;
    
    // 가속도 필터링 (노이즈 제거)
    if (sensorData.accelerometer) {
        const threshold = 0.1;
        const accel = sensorData.accelerometer;
        
        if (Math.abs(accel.x) < threshold) accel.x = 0;
        if (Math.abs(accel.y) < threshold) accel.y = 0;
        if (Math.abs(accel.z) < threshold) accel.z = 0;
    }
    
    // 자이로스코프 민감도 조정
    if (sensorData.gyroscope) {
        const sensitivity = 0.5;
        const gyro = sensorData.gyroscope;
        
        gyro.x *= sensitivity;
        gyro.y *= sensitivity;
        gyro.z *= sensitivity;
    }
});
```

### 커스텀 게임 로직

```javascript
class MyCustomGame {
    constructor() {
        this.sdk = createSensorGameSDK({
            gameId: 'my-custom-game',
            debug: true
        });
        
        this.gameState = {
            score: 0,
            playerPosition: { x: 0, y: 0 },
            gameTime: 0
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.sdk.on('sensorData', (data) => {
            this.handleSensorInput(data.data);
        });
        
        this.sdk.on('gameStarted', () => {
            this.startGameLoop();
        });
    }
    
    handleSensorInput(sensorData) {
        if (sensorData.accelerometer) {
            const { x, y } = sensorData.accelerometer;
            
            // 플레이어 이동
            this.gameState.playerPosition.x += x * 10;
            this.gameState.playerPosition.y += y * 10;
            
            // 경계 제한
            this.gameState.playerPosition.x = Math.max(0, Math.min(800, this.gameState.playerPosition.x));
            this.gameState.playerPosition.y = Math.max(0, Math.min(600, this.gameState.playerPosition.y));
            
            this.updatePlayerVisual();
        }
    }
    
    startGameLoop() {
        const gameLoop = () => {
            this.updateGame();
            
            if (this.sdk.getSessionInfo().state === 'game_running') {
                requestAnimationFrame(gameLoop);
            }
        };
        
        requestAnimationFrame(gameLoop);
    }
    
    updateGame() {
        // 게임 로직 업데이트
        this.gameState.gameTime += 16; // ~60fps
        this.checkCollisions();
        this.updateScore();
    }
}
```

## 🐛 트러블슈팅

### 일반적인 문제들

1. **센서가 연결되지 않는 경우**
   ```javascript
   // 연결 상태 확인
   console.log('SDK 상태:', sdk.getSessionInfo());
   console.log('연결된 센서:', sdk.getConnectedSensors());
   ```

2. **센서 데이터가 수신되지 않는 경우**
   ```javascript
   // 모든 이벤트 로깅
   sdk.on('message', (message) => {
       console.log('수신된 메시지:', message);
   });
   ```

3. **게임이 시작되지 않는 경우**
   ```javascript
   // 게임 준비 상태 확인
   if (!sdk.isGameReady()) {
       console.log('게임 준비되지 않음');
       console.log('세션 정보:', sdk.getSessionInfo());
   }
   ```

### 디버그 모드

```javascript
const sdk = createSensorGameSDK({
    debug: true  // 모든 로그 출력
});

// 추가 디버깅
sdk.on('stateChanged', (data) => {
    console.log('상태 변경:', data.from, '->', data.to);
});

sdk.on('error', (error) => {
    console.error('SDK 에러:', error);
});
```

## 📚 더 많은 리소스

- [서버 설정 가이드](../server/README.md)
- [센서 클라이언트 가이드](../public/sensor-client.html)
- [게임 예제 모음](./examples/)
- [API 레퍼런스](./docs/api-reference.md)

## 🤝 기여하기

이 SDK는 오픈소스입니다. 버그 리포트, 기능 제안, 풀 리퀘스트를 환영합니다!

## 📄 라이선스

MIT License - 자유롭게 사용하세요!

---

**센서 게임 SDK v6.0으로 놀라운 모바일 센서 게임을 만들어보세요! 🎮📱**
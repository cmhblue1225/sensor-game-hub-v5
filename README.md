# 🎮 Sensor Game Hub v6.0

모바일 센서를 활용한 웹 게임 플랫폼의 완전히 재설계된 최신 버전입니다.

## 🆕 v6.0 새로운 기능

- 🔄 **게임별 독립 세션 시스템**: 각 게임이 자체 세션 생성 및 관리
- 📱 **즉시 연결 플로우**: 게임 진입시 자동 세션 생성, 센서 연결시 즉시 게임 시작
- 🎯 **통합 세션 관리**: 세션 지속성, 크로스 탭 동기화, 자동 복구
- 🌟 **완벽한 UX**: QR 코드 자동 생성, 실시간 연결 상태 표시
- 🚀 **강화된 SDK**: SessionPersistence, SessionNavigationManager 통합

## ✨ 주요 기능

- 📱 **간편한 센서 연결**: QR 코드 스캔 또는 세션 코드 입력
- 🎯 **다양한 게임 모드**: 솔로, 듀얼 센서, 멀티플레이어 (최대 10명)
- 🌐 **실시간 통신**: WebSocket 기반 안정적인 데이터 전송
- 🚀 **모듈형 아키텍처**: v6.0 SDK 기반 확장 가능한 게임 시스템
- 📊 **관리자 대시보드**: 실시간 모니터링 및 시스템 관리

## 🏗️ v6.0 아키텍처

```
sensor-game-hub-v6/
├── server/                  # 서버 시스템
│   ├── core/               # 핵심 서버 엔진
│   │   └── GameServer.js   # 메인 게임 서버
│   ├── services/           # 서비스 레이어
│   │   ├── SessionManager.js    # 세션 관리
│   │   ├── ConnectionManager.js # 연결 관리
│   │   └── GameStateManager.js  # 게임 상태 관리
│   └── handlers/           # 메시지 핸들러
│       └── MessageRouter.js     # 메시지 라우팅
├── sdk/                    # v6.0 SDK
│   └── core/
│       ├── SensorGameSDK.js         # 메인 SDK
│       ├── SessionPersistence.js    # 세션 지속성
│       └── SessionNavigationManager.js # 네비게이션 관리
├── client/                 # 클라이언트 파일들
│   ├── hub-v6.html         # PC 허브 페이지 (v6.0)
│   ├── sensor-v6.html      # 모바일 센서 페이지 (v6.0)
│   └── admin.html          # 관리자 대시보드
├── games/                  # 게임 디렉터리
│   ├── solo-sensor-test/   # 솔로 센서 테스트
│   │   ├── index.html      # 게임 페이지
│   │   └── game-v6.js      # v6.0 게임 로직
│   ├── dual-sensor-test/   # 듀얼 센서 테스트
│   │   ├── index.html      # 게임 페이지
│   │   └── game-v6.js      # v6.0 게임 로직
│   └── multi-sensor-test/  # 멀티플레이어 테스트
│       ├── index.html      # 게임 페이지
│       └── game-v6.js      # v6.0 게임 로직
└── server.js               # 서버 진입점
```

## 🚀 실행 방법

### 로컬 개발
```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
# 또는
node server.js

# 접속 URL
# PC Hub: http://localhost:3000/client/hub-v6.html
# 모바일: http://localhost:3000/client/sensor-v6.html
```

### 프로덕션 배포
```bash
# Render.com 배포용
npm start

# 접속 URL
# PC Hub: https://your-app.onrender.com/client/hub-v6.html
# 모바일: https://your-app.onrender.com/client/sensor-v6.html
```

## 🎮 게임 모드

### 🎯 솔로 센서 테스트
- **1개 센서** 사용
- 기울기, 흔들기, 회전 센서 테스트
- 실시간 점수 시스템

### 🎮 듀얼 센서 테스트  
- **2개 센서** 협조 플레이
- 각 센서로 다른 공 조종
- 협조 미션 완료 시스템

### 👥 멀티플레이어 테스트
- **최대 10명** 실시간 경쟁
- 목표 존 수집 경쟁 게임
- 실시간 리더보드

## 📱 새로운 사용법 (v6.0)

### 🚀 **간단한 플로우**
1. **PC에서 게임 선택** → 자동으로 세션 생성
2. **모바일에서 센서 연결** → QR 스캔 또는 코드 입력  
3. **즉시 게임 시작** → 연결 완료시 바로 플레이

### 📝 **단계별 가이드**

#### PC (게임 호스트)
1. 브라우저에서 허브 페이지 접속: `https://your-app.onrender.com/client/hub-v6.html`
2. 원하는 게임 모드 선택 (솔로/듀얼/멀티)
3. 자동 생성된 세션 코드 및 QR 코드 확인
4. 센서 연결 완료시 자동으로 게임 시작

#### 모바일 (센서 클라이언트)  
1. 브라우저에서 센서 페이지 접속: `https://your-app.onrender.com/client/sensor-v6.html`
2. QR 코드 스캔 또는 세션 코드 직접 입력
3. 센서 권한 허용 (자이로스코프, 가속도계)
4. 연결 완료시 즉시 게임 플레이 가능

## 🔧 개발자 가이드

### SDK 사용법
```javascript
// v6.0 SDK 초기화
const sdk = new SensorGameSDK({
    serverUrl: 'wss://your-server.com',
    gameId: 'your-game-id',
    gameTitle: '게임 제목',
    debug: true
});

// 세션 생성
sdk.createSession('solo|dual|multiplayer')
    .then(sessionCode => {
        console.log('세션 생성됨:', sessionCode);
    });

// 이벤트 리스너
sdk.on('sensorConnected', (data) => {
    console.log('센서 연결됨:', data);
});

sdk.on('sensorData', (data) => {
    // 센서 데이터 처리
});
```

### 새 게임 추가
1. `/games/` 폴더에 새 게임 디렉터리 생성
2. `index.html` 및 `game-v6.js` 파일 생성
3. v6.0 SDK를 활용한 게임 로직 구현
4. 허브 페이지에 게임 등록

## 🌐 배포 정보

- **플랫폼**: Render.com
- **배포 URL**: https://sensor-game-hub-v5.onrender.com
- **PC Hub**: https://sensor-game-hub-v5.onrender.com/client/hub-v6.html
- **모바일 센서**: https://sensor-game-hub-v5.onrender.com/client/sensor-v6.html

## 📝 버전 히스토리

### v6.0 (2024년 최신)
- 🔄 게임별 독립 세션 생성 시스템
- 📱 즉시 연결 및 게임 시작 플로우
- 🎯 완벽한 세션 관리 및 지속성
- 🌟 QR 코드 자동 생성 및 실시간 상태 표시

### v5.0
- 🚀 완전 재설계된 아키텍처
- 📱 4자리 세션 코드 시스템
- 🎮 멀티플레이어 시스템 구축

## 🎯 주요 특징

- ✅ **무료 체험 가능**: 별도 설치 없이 웹 브라우저에서 즉시 플레이
- ✅ **크로스 플랫폼**: iOS, Android 모든 모바일 기기 지원
- ✅ **실시간 동기화**: WebSocket 기반 지연 없는 센서 데이터 전송
- ✅ **확장 가능**: 모듈형 SDK로 새로운 게임 쉽게 추가 가능

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 지원

문제가 있거나 제안사항이 있으시면 Issues 탭에서 알려주세요.

---

**🎮 Sensor Game Hub v6.0 - 차세대 모바일 센서 게임 플랫폼**
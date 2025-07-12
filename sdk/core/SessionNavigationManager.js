/**
 * 🔄 세션 네비게이션 관리자
 * 
 * 메인 허브와 게임 페이지 간의 완벽한 세션 연속성 보장
 * - 페이지 이동 시 세션 유지
 * - 뒤로가기/앞으로가기 지원  
 * - 새로고침 시 상태 복구
 * - 탭 간 세션 동기화
 */

/**
 * 페이지 타입 정의
 */
const PAGE_TYPES = {
    MAIN_HUB: 'main_hub',
    GAME: 'game',
    SENSOR_CLIENT: 'sensor_client',
    ADMIN: 'admin',
    UNKNOWN: 'unknown'
};

/**
 * 네비게이션 이벤트 타입
 */
const NAV_EVENTS = {
    BEFORE_NAVIGATE: 'before_navigate',
    AFTER_NAVIGATE: 'after_navigate',
    SESSION_PRESERVED: 'session_preserved',
    SESSION_RESTORED: 'session_restored',
    NAVIGATION_BLOCKED: 'navigation_blocked'
};

/**
 * 세션 네비게이션 관리자
 */
class SessionNavigationManager {
    constructor(sdk) {
        this.sdk = sdk;
        this.persistenceManager = sdk.persistenceManager;
        this.isEnabled = true;
        
        // 현재 페이지 정보
        this.currentPage = this.detectCurrentPage();
        this.previousPage = null;
        
        // 네비게이션 상태
        this.isNavigating = false;
        this.navigationPromise = null;
        
        // 이벤트 리스너
        this.eventListeners = new Map();
        
        // 설정
        this.options = {
            autoPreserve: true,          // 자동 세션 보존
            autoRestore: true,           // 자동 세션 복원
            confirmNavigation: false,    // 네비게이션 확인 다이얼로그
            preserveGameState: true,     // 게임 상태 보존
            syncAcrossTabs: true         // 탭 간 동기화
        };
        
        this.setupNavigation();
        this.log('세션 네비게이션 관리자 초기화 완료');
    }
    
    /**
     * 네비게이션 설정
     */
    setupNavigation() {
        // 페이지 로드 시 복원 시도
        if (this.options.autoRestore) {
            this.attemptSessionRestore();
        }
        
        // beforeunload 이벤트 (페이지 떠나기 전)
        window.addEventListener('beforeunload', (e) => {
            this.handleBeforeUnload(e);
        });
        
        // popstate 이벤트 (뒤로가기/앞으로가기)
        window.addEventListener('popstate', (e) => {
            this.handlePopState(e);
        });
        
        // 페이지 가시성 변경 (탭 전환)
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
        
        // 링크 클릭 인터셉트
        this.interceptNavigationLinks();
    }
    
    /**
     * 현재 페이지 타입 감지
     */
    detectCurrentPage() {
        const path = window.location.pathname;
        const search = window.location.search;
        
        // URL 기반 페이지 타입 판단
        if (path.includes('/game') || path.includes('/games/')) {
            return PAGE_TYPES.GAME;
        } else if (path.includes('/sensor-client') || search.includes('mode=sensor')) {
            return PAGE_TYPES.SENSOR_CLIENT;
        } else if (path.includes('/admin')) {
            return PAGE_TYPES.ADMIN;
        } else if (path === '/' || path.includes('/hub') || path.includes('/index')) {
            return PAGE_TYPES.MAIN_HUB;
        }
        
        return PAGE_TYPES.UNKNOWN;
    }
    
    /**
     * 세션 복원 시도
     */
    async attemptSessionRestore() {
        if (!this.persistenceManager) return false;
        
        try {
            // 네비게이션으로부터 복원 시도
            const navigationRestore = this.sdk.restoreSessionFromNavigation();
            if (navigationRestore) {
                this.log('네비게이션 세션 복원 성공', { 
                    sessionCode: navigationRestore.sessionCode 
                });
                this.emit(NAV_EVENTS.SESSION_RESTORED, {
                    source: 'navigation',
                    session: navigationRestore
                });
                return true;
            }
            
            // 일반 세션 복원 시도
            const generalRestore = await this.sdk.attemptSessionRecovery();
            if (generalRestore && generalRestore.success) {
                this.log('일반 세션 복원 성공', { 
                    sessionCode: generalRestore.session.sessionCode 
                });
                this.emit(NAV_EVENTS.SESSION_RESTORED, {
                    source: 'persistence',
                    session: generalRestore.session
                });
                return true;
            }
            
            return false;
            
        } catch (error) {
            this.log('세션 복원 실패', { error: error.message });
            return false;
        }
    }
    
    /**
     * 페이지 이동 전 처리
     */
    handleBeforeUnload(event) {
        if (!this.isEnabled || !this.sdk.sessionCode) return;
        
        // 세션 보존
        if (this.options.autoPreserve) {
            const preserved = this.preserveCurrentSession();
            
            if (preserved) {
                this.log('페이지 이동 전 세션 보존 완료');
                this.emit(NAV_EVENTS.SESSION_PRESERVED, {
                    sessionCode: this.sdk.sessionCode,
                    fromPage: this.currentPage
                });
            }
        }
        
        // 네비게이션 확인 (옵션)
        if (this.options.confirmNavigation && this.sdk.state === 'game_running') {
            event.preventDefault();
            event.returnValue = '게임이 진행 중입니다. 정말 페이지를 떠나시겠습니까?';
            return event.returnValue;
        }
    }
    
    /**
     * 브라우저 히스토리 변경 처리
     */
    handlePopState(event) {
        const newPage = this.detectCurrentPage();
        
        this.log('히스토리 네비게이션 감지', {
            from: this.currentPage,
            to: newPage
        });
        
        // 페이지 변경 시 복원 시도
        if (newPage !== this.currentPage) {
            this.previousPage = this.currentPage;
            this.currentPage = newPage;
            
            if (this.options.autoRestore) {
                setTimeout(() => {
                    this.attemptSessionRestore();
                }, 100);
            }
        }
    }
    
    /**
     * 탭 가시성 변경 처리
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // 탭이 백그라운드로 이동
            if (this.options.autoPreserve && this.sdk.sessionCode) {
                this.preserveCurrentSession();
            }
        } else {
            // 탭이 포그라운드로 복귀
            if (this.options.syncAcrossTabs) {
                // 다른 탭에서 세션 변경이 있었는지 확인
                setTimeout(() => {
                    this.syncWithOtherTabs();
                }, 100);
            }
        }
    }
    
    /**
     * 네비게이션 링크 인터셉트
     */
    interceptNavigationLinks() {
        // 허브 링크들에 이벤트 리스너 추가
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (this.isInternalNavigation(href)) {
                this.handleLinkClick(e, link, href);
            }
        });
    }
    
    /**
     * 내부 네비게이션 여부 확인
     */
    isInternalNavigation(href) {
        // 상대 URL이거나 같은 도메인의 URL인 경우
        return href.startsWith('/') || 
               href.startsWith('./') || 
               href.startsWith('../') ||
               href.includes(window.location.hostname);
    }
    
    /**
     * 링크 클릭 처리
     */
    async handleLinkClick(event, link, href) {
        // 세션이 없으면 일반 네비게이션
        if (!this.sdk.sessionCode) return;
        
        const targetPage = this.getPageTypeFromUrl(href);
        
        // 같은 페이지 타입으로의 이동이면 무시
        if (targetPage === this.currentPage) return;
        
        this.log('링크 클릭 감지', {
            href,
            fromPage: this.currentPage,
            toPage: targetPage
        });
        
        // 네비게이션 확인
        if (this.options.confirmNavigation && this.sdk.state === 'game_running') {
            if (!confirm('게임이 진행 중입니다. 정말 이동하시겠습니까?')) {
                event.preventDefault();
                this.emit(NAV_EVENTS.NAVIGATION_BLOCKED, {
                    href,
                    reason: 'user_cancelled'
                });
                return;
            }
        }
        
        // 이벤트 발생
        this.emit(NAV_EVENTS.BEFORE_NAVIGATE, {
            from: this.currentPage,
            to: targetPage,
            href
        });
        
        // 세션 보존
        if (this.options.autoPreserve) {
            this.preserveCurrentSession({
                targetPage,
                targetUrl: href
            });
        }
    }
    
    /**
     * URL에서 페이지 타입 추출
     */
    getPageTypeFromUrl(url) {
        if (url.includes('/game') || url.includes('/games/')) {
            return PAGE_TYPES.GAME;
        } else if (url.includes('/sensor-client')) {
            return PAGE_TYPES.SENSOR_CLIENT;
        } else if (url.includes('/admin')) {
            return PAGE_TYPES.ADMIN;
        } else if (url === '/' || url.includes('/hub') || url.includes('/index')) {
            return PAGE_TYPES.MAIN_HUB;
        }
        return PAGE_TYPES.UNKNOWN;
    }
    
    /**
     * 현재 세션 보존
     */
    preserveCurrentSession(additionalData = {}) {
        if (!this.sdk.sessionCode) return false;
        
        const gameState = this.options.preserveGameState ? 
            this.collectCurrentGameState() : null;
        
        return this.sdk.preserveSessionForNavigation({
            ...additionalData,
            fromPage: this.currentPage,
            gameState,
            preservedAt: Date.now(),
            userAgent: navigator.userAgent
        });
    }
    
    /**
     * 현재 게임 상태 수집
     */
    collectCurrentGameState() {
        const state = {
            sessionInfo: this.sdk.getSessionInfo(),
            sensorData: Object.fromEntries(this.sdk.sensorData),
            sensorStatus: Object.fromEntries(this.sdk.sensorStatus)
        };
        
        // 페이지별 추가 상태 수집
        switch (this.currentPage) {
            case PAGE_TYPES.GAME:
                state.gameSpecific = this.collectGamePageState();
                break;
            case PAGE_TYPES.MAIN_HUB:
                state.hubSpecific = this.collectHubPageState();
                break;
        }
        
        return state;
    }
    
    /**
     * 게임 페이지 상태 수집
     */
    collectGamePageState() {
        // DOM에서 게임 상태 정보 수집
        const gameState = {};
        
        // 게임 컨테이너에서 상태 추출
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            // 게임별 상태 수집 로직
            const scoreElements = gameContainer.querySelectorAll('[id*="score"]');
            scoreElements.forEach(el => {
                if (el.textContent) {
                    gameState[el.id] = el.textContent;
                }
            });
        }
        
        return gameState;
    }
    
    /**
     * 허브 페이지 상태 수집
     */
    collectHubPageState() {
        // 허브에서의 사용자 선택사항, UI 상태 등
        return {
            lastSelectedGame: this.getLastSelectedGame(),
            uiPreferences: this.getUIPreferences()
        };
    }
    
    /**
     * 마지막 선택된 게임 정보
     */
    getLastSelectedGame() {
        const activeGameBtn = document.querySelector('.game-btn.active');
        return activeGameBtn ? activeGameBtn.dataset.gameId : null;
    }
    
    /**
     * UI 선호 설정
     */
    getUIPreferences() {
        return {
            theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
            language: document.documentElement.lang || 'ko'
        };
    }
    
    /**
     * 다른 탭과 동기화
     */
    async syncWithOtherTabs() {
        if (!this.persistenceManager) return;
        
        try {
            // 저장된 세션 정보 확인
            const savedSession = this.persistenceManager.loadSession();
            if (!savedSession) return;
            
            // 현재 SDK 세션과 비교
            if (this.sdk.sessionCode !== savedSession.sessionCode) {
                this.log('다른 탭에서 세션 변경 감지', {
                    current: this.sdk.sessionCode,
                    saved: savedSession.sessionCode
                });
                
                // 세션 업데이트 또는 사용자에게 알림
                await this.handleSessionChangeFromOtherTab(savedSession);
            }
        } catch (error) {
            this.log('탭 동기화 실패', { error: error.message });
        }
    }
    
    /**
     * 다른 탭에서의 세션 변경 처리
     */
    async handleSessionChangeFromOtherTab(newSession) {
        // 사용자에게 선택권 제공
        const shouldSwitch = await this.confirmSessionSwitch(newSession);
        
        if (shouldSwitch) {
            // 새 세션으로 전환
            await this.switchToSession(newSession);
        } else {
            // 현재 세션 유지하고 저장소 업데이트
            this.preserveCurrentSession();
        }
    }
    
    /**
     * 세션 전환 확인
     */
    async confirmSessionSwitch(newSession) {
        return new Promise((resolve) => {
            // 모달이나 알림으로 사용자 선택 받기
            const modal = this.createSessionSwitchModal(newSession);
            document.body.appendChild(modal);
            
            modal.querySelector('.confirm-switch').onclick = () => {
                document.body.removeChild(modal);
                resolve(true);
            };
            
            modal.querySelector('.keep-current').onclick = () => {
                document.body.removeChild(modal);
                resolve(false);
            };
            
            // 10초 후 자동으로 현재 세션 유지
            setTimeout(() => {
                if (document.body.contains(modal)) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            }, 10000);
        });
    }
    
    /**
     * 세션 전환 모달 생성
     */
    createSessionSwitchModal(newSession) {
        const modal = document.createElement('div');
        modal.className = 'session-switch-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>🔄 세션 변경 감지</h3>
                <p>다른 탭에서 새로운 게임 세션이 시작되었습니다.</p>
                <div class="session-info">
                    <p><strong>새 세션:</strong> ${newSession.sessionCode} (${newSession.gameType})</p>
                    <p><strong>현재 세션:</strong> ${this.sdk.sessionCode || '없음'}</p>
                </div>
                <div class="modal-buttons">
                    <button class="confirm-switch btn primary">새 세션으로 전환</button>
                    <button class="keep-current btn secondary">현재 세션 유지</button>
                </div>
                <div class="auto-close">10초 후 자동으로 현재 세션을 유지합니다.</div>
            </div>
        `;
        
        // 스타일 추가
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        return modal;
    }
    
    /**
     * 세션 전환
     */
    async switchToSession(sessionData) {
        try {
            // 현재 세션 정리
            await this.sdk.cleanupSession();
            
            // 새 세션으로 복원
            this.sdk.sessionCode = sessionData.sessionCode;
            this.sdk.sessionId = sessionData.sessionId;
            this.sdk.gameType = sessionData.gameType;
            this.sdk.roomId = sessionData.roomId;
            this.sdk.setState(sessionData.state);
            
            // 센서 상태 복원
            if (sessionData.sensorConnections) {
                sessionData.sensorConnections.forEach(sensorId => {
                    this.sdk.sensorStatus.set(sensorId, 'connected');
                });
            }
            
            this.log('세션 전환 완료', { 
                newSessionCode: sessionData.sessionCode 
            });
            
            this.emit(NAV_EVENTS.SESSION_RESTORED, {
                source: 'tab_switch',
                session: sessionData
            });
            
            // 서버 재연결 시도
            if (!this.sdk.isConnected) {
                await this.sdk.connect();
            }
            
        } catch (error) {
            this.log('세션 전환 실패', { error: error.message });
            throw error;
        }
    }
    
    /**
     * 프로그래밍적 네비게이션
     */
    async navigateTo(url, options = {}) {
        if (this.isNavigating) {
            this.log('이미 네비게이션 중');
            return this.navigationPromise;
        }
        
        this.isNavigating = true;
        
        this.navigationPromise = this.performNavigation(url, options);
        
        try {
            const result = await this.navigationPromise;
            return result;
        } finally {
            this.isNavigating = false;
            this.navigationPromise = null;
        }
    }
    
    /**
     * 네비게이션 수행
     */
    async performNavigation(url, options) {
        const targetPage = this.getPageTypeFromUrl(url);
        
        this.emit(NAV_EVENTS.BEFORE_NAVIGATE, {
            from: this.currentPage,
            to: targetPage,
            url,
            programmatic: true
        });
        
        // 세션 보존
        if (options.preserveSession !== false && this.sdk.sessionCode) {
            this.preserveCurrentSession({
                targetPage,
                targetUrl: url,
                programmatic: true
            });
        }
        
        // 네비게이션 실행
        if (options.replace) {
            window.location.replace(url);
        } else {
            window.location.href = url;
        }
        
        return { success: true, url, targetPage };
    }
    
    /**
     * 허브로 돌아가기
     */
    async returnToHub(preserveSession = true) {
        return this.navigateTo('/', { preserveSession });
    }
    
    /**
     * 게임으로 이동
     */
    async navigateToGame(gameId, preserveSession = true) {
        const gameUrl = `/games/${gameId}/`;
        return this.navigateTo(gameUrl, { preserveSession });
    }
    
    /**
     * 이벤트 리스너 등록
     */
    on(event, handler) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(handler);
    }
    
    /**
     * 이벤트 발생
     */
    emit(event, data) {
        const handlers = this.eventListeners.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    this.log('네비게이션 이벤트 핸들러 오류', { event, error: error.message });
                }
            });
        }
    }
    
    /**
     * 설정 업데이트
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
    }
    
    /**
     * 관리자 활성화/비활성화
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.log(`세션 네비게이션 관리자 ${enabled ? '활성화' : '비활성화'}`);
    }
    
    /**
     * 로깅
     */
    log(message, data = {}) {
        if (this.sdk.options.debug) {
            console.log(`[SessionNavigation] ${message}`, data);
        }
    }
    
    /**
     * 정리
     */
    cleanup() {
        // 이벤트 리스너 제거는 필요 시 구현
        this.eventListeners.clear();
    }
}

// 브라우저 환경에서 전역 등록
if (typeof window !== 'undefined') {
    window.SessionNavigationManager = SessionNavigationManager;
    window.PAGE_TYPES = PAGE_TYPES;
    window.NAV_EVENTS = NAV_EVENTS;
}

// Node.js 환경에서 모듈로 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SessionNavigationManager,
        PAGE_TYPES,
        NAV_EVENTS
    };
}
/**
 * 🔄 세션 지속성 관리자
 * 
 * 브라우저 세션 전반에 걸친 세션 정보 지속성 관리
 * - localStorage 기반 세션 저장
 * - 페이지 이동 시 세션 복구
 * - 자동 재연결 및 상태 동기화
 * - 다중 탭 지원
 */

/**
 * 세션 저장소 키 정의
 */
const STORAGE_KEYS = {
    ACTIVE_SESSION: 'sensorGameHub_activeSession',
    SESSION_HISTORY: 'sensorGameHub_sessionHistory',
    USER_PREFERENCES: 'sensorGameHub_userPrefs',
    TEMP_DATA: 'sensorGameHub_tempData'
};

/**
 * 세션 지속성 관리자 클래스
 */
class SessionPersistenceManager {
    constructor() {
        this.storageAvailable = this.checkStorageAvailability();
        this.sessionListeners = new Map();
        this.syncInterval = null;
        
        // 세션 복구 시 사용할 콜백들
        this.recoveryCallbacks = {
            onSessionRecovered: null,
            onSensorReconnected: null,
            onGameStateRestored: null
        };
        
        this.setupStorageListener();
        this.startPeriodicSync();
    }
    
    /**
     * localStorage 사용 가능 여부 확인
     */
    checkStorageAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            console.warn('localStorage not available, session persistence disabled');
            return false;
        }
    }
    
    /**
     * 세션 정보 저장
     */
    saveSession(sessionInfo) {
        if (!this.storageAvailable) return false;
        
        try {
            const sessionData = {
                ...sessionInfo,
                savedAt: Date.now(),
                tabId: this.getTabId(),
                version: '6.0.0'
            };
            
            localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(sessionData));
            this.addToHistory(sessionData);
            
            // 다른 탭에 알림
            this.notifyOtherTabs('session_saved', sessionData);
            
            return true;
        } catch (error) {
            console.error('세션 저장 실패:', error);
            return false;
        }
    }
    
    /**
     * 세션 정보 로드
     */
    loadSession() {
        if (!this.storageAvailable) return null;
        
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
            if (!saved) return null;
            
            const sessionData = JSON.parse(saved);
            
            // 세션 유효성 검사
            if (!this.isSessionValid(sessionData)) {
                this.clearSession();
                return null;
            }
            
            return sessionData;
        } catch (error) {
            console.error('세션 로드 실패:', error);
            this.clearSession();
            return null;
        }
    }
    
    /**
     * 세션 유효성 검사
     */
    isSessionValid(sessionData) {
        if (!sessionData || !sessionData.sessionCode) {
            return false;
        }
        
        // 만료 시간 확인 (기본 1시간)
        const maxAge = 60 * 60 * 1000; // 1시간
        const age = Date.now() - sessionData.savedAt;
        
        if (age > maxAge) {
            return false;
        }
        
        // 필수 필드 확인
        const requiredFields = ['sessionCode', 'gameType', 'sessionId'];
        return requiredFields.every(field => sessionData[field]);
    }
    
    /**
     * 세션 정보 업데이트
     */
    updateSession(updates) {
        const current = this.loadSession();
        if (!current) return false;
        
        const updated = {
            ...current,
            ...updates,
            lastUpdated: Date.now()
        };
        
        return this.saveSession(updated);
    }
    
    /**
     * 세션 상태 업데이트
     */
    updateSessionState(newState, additionalData = {}) {
        return this.updateSession({
            state: newState,
            stateChangedAt: Date.now(),
            ...additionalData
        });
    }
    
    /**
     * 센서 연결 정보 업데이트
     */
    updateSensorConnections(sensorConnections) {
        return this.updateSession({
            sensorConnections: Array.from(sensorConnections.keys()),
            sensorCount: sensorConnections.size,
            sensorsUpdatedAt: Date.now()
        });
    }
    
    /**
     * 게임 상태 저장
     */
    saveGameState(gameState) {
        return this.updateSession({
            gameState,
            gameStateUpdatedAt: Date.now()
        });
    }
    
    /**
     * 임시 데이터 저장 (페이지 이동 시 잠시 보관)
     */
    saveTempData(key, data) {
        if (!this.storageAvailable) return false;
        
        try {
            const tempData = this.getTempData();
            tempData[key] = {
                data,
                savedAt: Date.now(),
                tabId: this.getTabId()
            };
            
            localStorage.setItem(STORAGE_KEYS.TEMP_DATA, JSON.stringify(tempData));
            
            // 임시 데이터는 10분 후 자동 삭제
            setTimeout(() => {
                this.clearTempData(key);
            }, 10 * 60 * 1000);
            
            return true;
        } catch (error) {
            console.error('임시 데이터 저장 실패:', error);
            return false;
        }
    }
    
    /**
     * 임시 데이터 로드
     */
    loadTempData(key) {
        if (!this.storageAvailable) return null;
        
        try {
            const tempData = this.getTempData();
            const item = tempData[key];
            
            if (!item) return null;
            
            // 10분 이상 된 데이터는 무효
            const maxAge = 10 * 60 * 1000;
            if (Date.now() - item.savedAt > maxAge) {
                delete tempData[key];
                localStorage.setItem(STORAGE_KEYS.TEMP_DATA, JSON.stringify(tempData));
                return null;
            }
            
            return item.data;
        } catch (error) {
            console.error('임시 데이터 로드 실패:', error);
            return null;
        }
    }
    
    /**
     * 전체 임시 데이터 가져오기
     */
    getTempData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.TEMP_DATA);
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            return {};
        }
    }
    
    /**
     * 임시 데이터 삭제
     */
    clearTempData(key) {
        if (!this.storageAvailable) return;
        
        try {
            const tempData = this.getTempData();
            delete tempData[key];
            localStorage.setItem(STORAGE_KEYS.TEMP_DATA, JSON.stringify(tempData));
        } catch (error) {
            console.error('임시 데이터 삭제 실패:', error);
        }
    }
    
    /**
     * 세션 기록에 추가
     */
    addToHistory(sessionData) {
        try {
            const history = this.getSessionHistory();
            
            // 최대 10개 세션까지 보관
            if (history.length >= 10) {
                history.shift();
            }
            
            history.push({
                sessionCode: sessionData.sessionCode,
                gameType: sessionData.gameType,
                createdAt: sessionData.createdAt || sessionData.savedAt,
                endedAt: sessionData.state === 'ended' ? Date.now() : null
            });
            
            localStorage.setItem(STORAGE_KEYS.SESSION_HISTORY, JSON.stringify(history));
        } catch (error) {
            console.error('세션 기록 저장 실패:', error);
        }
    }
    
    /**
     * 세션 기록 가져오기
     */
    getSessionHistory() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SESSION_HISTORY);
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            return [];
        }
    }
    
    /**
     * 세션 복구 시도
     */
    async attemptSessionRecovery(sdk) {
        const savedSession = this.loadSession();
        if (!savedSession) {
            return { success: false, reason: 'no_saved_session' };
        }
        
        try {
            // 서버에 세션 유효성 확인
            const isValid = await this.validateSessionWithServer(sdk, savedSession);
            if (!isValid) {
                this.clearSession();
                return { success: false, reason: 'session_invalid_on_server' };
            }
            
            // SDK 상태 복구
            await this.restoreSDKState(sdk, savedSession);
            
            // 콜백 실행
            if (this.recoveryCallbacks.onSessionRecovered) {
                this.recoveryCallbacks.onSessionRecovered(savedSession);
            }
            
            return { 
                success: true, 
                session: savedSession,
                recoveredAt: Date.now()
            };
            
        } catch (error) {
            console.error('세션 복구 실패:', error);
            return { success: false, reason: 'recovery_error', error };
        }
    }
    
    /**
     * 서버에서 세션 유효성 확인
     */
    async validateSessionWithServer(sdk, sessionData) {
        try {
            // 서버에 세션 상태 요청
            await sdk.send({
                type: 'session:validate',
                sessionCode: sessionData.sessionCode,
                sessionId: sessionData.sessionId,
                lastKnownState: sessionData.state
            });
            
            // 응답 대기 (Promise 패턴으로 구현)
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(false);
                }, 5000); // 5초 타임아웃
                
                const handler = (message) => {
                    if (message.type === 'session:validation_result') {
                        clearTimeout(timeout);
                        sdk.off('message', handler);
                        resolve(message.isValid);
                    }
                };
                
                sdk.on('message', handler);
            });
            
        } catch (error) {
            return false;
        }
    }
    
    /**
     * SDK 상태 복구
     */
    async restoreSDKState(sdk, sessionData) {
        // 기본 세션 정보 복구
        sdk.sessionCode = sessionData.sessionCode;
        sdk.sessionId = sessionData.sessionId;
        sdk.gameType = sessionData.gameType;
        sdk.roomId = sessionData.roomId;
        
        // 상태 복구
        if (sessionData.state) {
            sdk.setState(sessionData.state);
        }
        
        // 센서 연결 정보 복구
        if (sessionData.sensorConnections) {
            sessionData.sensorConnections.forEach(sensorId => {
                sdk.sensorStatus.set(sensorId, 'connected');
            });
        }
        
        // 게임 상태 복구
        if (sessionData.gameState) {
            // 게임별 상태 복구 로직
            if (this.recoveryCallbacks.onGameStateRestored) {
                this.recoveryCallbacks.onGameStateRestored(sessionData.gameState);
            }
        }
    }
    
    /**
     * 페이지 이동 전 데이터 보존
     */
    preserveForNavigation(additionalData = {}) {
        const currentSession = this.loadSession();
        if (!currentSession) return false;
        
        // 현재 상태를 임시 저장
        this.saveTempData('navigation_preserve', {
            ...currentSession,
            ...additionalData,
            preservedAt: Date.now(),
            fromPage: window.location.pathname
        });
        
        return true;
    }
    
    /**
     * 페이지 이동 후 데이터 복원
     */
    restoreFromNavigation() {
        const preserved = this.loadTempData('navigation_preserve');
        if (!preserved) return null;
        
        // 임시 데이터를 메인 세션으로 복원
        this.saveSession(preserved);
        this.clearTempData('navigation_preserve');
        
        return preserved;
    }
    
    /**
     * 다중 탭 지원을 위한 탭 ID 생성
     */
    getTabId() {
        if (!this.tabId) {
            this.tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        return this.tabId;
    }
    
    /**
     * 다른 탭에 이벤트 알림
     */
    notifyOtherTabs(eventType, data) {
        if (!this.storageAvailable) return;
        
        try {
            const event = {
                type: eventType,
                data,
                timestamp: Date.now(),
                fromTab: this.getTabId()
            };
            
            // localStorage 이벤트를 통한 탭 간 통신
            localStorage.setItem('__tab_communication__', JSON.stringify(event));
            
            // 즉시 삭제 (이벤트 트리거용)
            setTimeout(() => {
                localStorage.removeItem('__tab_communication__');
            }, 100);
        } catch (error) {
            console.error('탭 간 통신 실패:', error);
        }
    }
    
    /**
     * 다른 탭으로부터의 이벤트 수신
     */
    setupStorageListener() {
        if (!this.storageAvailable) return;
        
        window.addEventListener('storage', (e) => {
            if (e.key === '__tab_communication__' && e.newValue) {
                try {
                    const event = JSON.parse(e.newValue);
                    
                    // 자신이 보낸 이벤트는 무시
                    if (event.fromTab === this.getTabId()) return;
                    
                    // 이벤트 처리
                    this.handleTabEvent(event);
                } catch (error) {
                    console.error('탭 이벤트 처리 실패:', error);
                }
            }
        });
    }
    
    /**
     * 탭 이벤트 처리
     */
    handleTabEvent(event) {
        switch (event.type) {
            case 'session_saved':
                // 다른 탭에서 세션이 저장됨
                this.emit('session_updated_by_other_tab', event.data);
                break;
                
            case 'session_ended':
                // 다른 탭에서 세션이 종료됨
                this.emit('session_ended_by_other_tab', event.data);
                break;
                
            case 'game_state_changed':
                // 다른 탭에서 게임 상태 변경
                this.emit('game_state_changed_by_other_tab', event.data);
                break;
        }
    }
    
    /**
     * 주기적 동기화 시작
     */
    startPeriodicSync() {
        // 30초마다 세션 상태 동기화
        this.syncInterval = setInterval(() => {
            this.syncWithServer();
        }, 30000);
    }
    
    /**
     * 서버와 세션 상태 동기화
     */
    async syncWithServer() {
        const session = this.loadSession();
        if (!session) return;
        
        // 서버에 현재 상태 전송 (구현은 SDK에서)
        this.emit('sync_requested', session);
    }
    
    /**
     * 세션 완전 삭제
     */
    clearSession() {
        if (!this.storageAvailable) return;
        
        try {
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
            
            // 다른 탭에 알림
            this.notifyOtherTabs('session_ended', { clearedAt: Date.now() });
        } catch (error) {
            console.error('세션 삭제 실패:', error);
        }
    }
    
    /**
     * 모든 데이터 삭제
     */
    clearAllData() {
        if (!this.storageAvailable) return;
        
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        
        localStorage.removeItem('__tab_communication__');
    }
    
    /**
     * 이벤트 리스너 등록
     */
    on(event, handler) {
        if (!this.sessionListeners.has(event)) {
            this.sessionListeners.set(event, []);
        }
        this.sessionListeners.get(event).push(handler);
    }
    
    /**
     * 이벤트 리스너 제거
     */
    off(event, handler) {
        const handlers = this.sessionListeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    /**
     * 이벤트 발생
     */
    emit(event, data) {
        const handlers = this.sessionListeners.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error('세션 이벤트 핸들러 오류:', error);
                }
            });
        }
    }
    
    /**
     * 복구 콜백 설정
     */
    setRecoveryCallbacks(callbacks) {
        this.recoveryCallbacks = { ...this.recoveryCallbacks, ...callbacks };
    }
    
    /**
     * 정리 작업
     */
    cleanup() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        // 만료된 임시 데이터 정리
        const tempData = this.getTempData();
        const now = Date.now();
        const maxAge = 10 * 60 * 1000;
        
        Object.keys(tempData).forEach(key => {
            if (now - tempData[key].savedAt > maxAge) {
                delete tempData[key];
            }
        });
        
        if (this.storageAvailable) {
            localStorage.setItem(STORAGE_KEYS.TEMP_DATA, JSON.stringify(tempData));
        }
    }
}

// 전역 인스턴스
let globalPersistenceManager = null;

/**
 * 전역 세션 지속성 관리자 인스턴스 반환
 */
function getSessionPersistenceManager() {
    if (!globalPersistenceManager) {
        globalPersistenceManager = new SessionPersistenceManager();
    }
    return globalPersistenceManager;
}

// 브라우저 환경에서 전역 등록
if (typeof window !== 'undefined') {
    window.SessionPersistenceManager = SessionPersistenceManager;
    window.getSessionPersistenceManager = getSessionPersistenceManager;
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
        if (globalPersistenceManager) {
            globalPersistenceManager.cleanup();
        }
    });
}

// Node.js 환경에서 모듈로 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SessionPersistenceManager,
        getSessionPersistenceManager,
        STORAGE_KEYS
    };
}
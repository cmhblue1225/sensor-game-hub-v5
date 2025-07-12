/**
 * ⚙️ 설정 관리 시스템
 * 
 * 환경별 설정 및 기본값 관리
 * - 환경 변수 기반 설정
 * - 기본값 정의
 * - 설정 검증
 * - 런타임 설정 변경
 */

const fs = require('fs');
const path = require('path');

/**
 * 기본 설정 정의
 */
const DEFAULT_CONFIG = {
    // 서버 설정
    server: {
        port: 3000,
        host: '0.0.0.0',
        enableHttps: false,
        maxConnections: 1000,
        heartbeatInterval: 30000,
        cleanupInterval: 60000
    },
    
    // 세션 설정
    session: {
        codeLength: 4,
        sessionTimeout: 30 * 60 * 1000, // 30분
        maxSensorsPerSession: 10,
        autoStartGame: true
    },
    
    // 게임 설정
    game: {
        maxRooms: 100,
        maxPlayersPerRoom: 10,
        gameTimeout: 60 * 60 * 1000, // 1시간
        enableSpectators: false
    },
    
    // 로깅 설정
    logging: {
        level: 'INFO',
        enableConsole: true,
        enableFile: false,
        logDir: './logs',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
    },
    
    // 보안 설정
    security: {
        enableRateLimit: true,
        rateLimitWindow: 60000, // 1분
        rateLimitMax: 100,
        enableCors: true,
        corsOrigins: ['*']
    },
    
    // 성능 설정
    performance: {
        enableMetrics: true,
        metricsInterval: 5000,
        enableProfiler: false,
        maxMemoryUsage: 512 * 1024 * 1024 // 512MB
    },
    
    // WebSocket 설정
    websocket: {
        maxPayload: 16 * 1024, // 16KB
        compression: false,
        pingInterval: 30000,
        pongTimeout: 5000
    },
    
    // 개발 설정
    development: {
        enableHotReload: false,
        enableDebugMode: false,
        mockSensorData: false,
        bypassAuth: false
    }
};

/**
 * 환경별 설정 오버라이드
 */
const ENVIRONMENT_CONFIGS = {
    development: {
        logging: {
            level: 'DEBUG',
            enableConsole: true
        },
        development: {
            enableDebugMode: true,
            mockSensorData: true
        },
        security: {
            enableRateLimit: false
        }
    },
    
    production: {
        logging: {
            level: 'INFO',
            enableFile: true
        },
        security: {
            enableRateLimit: true,
            corsOrigins: ['https://yourdomain.com']
        },
        performance: {
            enableMetrics: true,
            enableProfiler: false
        }
    },
    
    test: {
        server: {
            port: 0 // 랜덤 포트
        },
        logging: {
            level: 'ERROR',
            enableConsole: false
        },
        session: {
            sessionTimeout: 5000 // 5초
        }
    }
};

/**
 * 설정 관리 클래스
 */
class ConfigManager {
    constructor() {
        this.config = {};
        this.watchers = new Map();
        this.environment = process.env.NODE_ENV || 'development';
        
        this.loadConfig();
    }
    
    /**
     * 설정 로드
     */
    loadConfig() {
        // 기본 설정으로 시작
        this.config = this.deepClone(DEFAULT_CONFIG);
        
        // 환경별 설정 적용
        if (ENVIRONMENT_CONFIGS[this.environment]) {
            this.config = this.deepMerge(this.config, ENVIRONMENT_CONFIGS[this.environment]);
        }
        
        // 환경 변수 적용
        this.applyEnvironmentVariables();
        
        // 설정 파일 로드 (있는 경우)
        this.loadConfigFile();
        
        // 설정 검증
        this.validateConfig();
    }
    
    /**
     * 환경 변수를 설정에 적용
     */
    applyEnvironmentVariables() {
        const envMappings = {
            'PORT': 'server.port',
            'HOST': 'server.host',
            'LOG_LEVEL': 'logging.level',
            'ENABLE_FILE_LOGGING': 'logging.enableFile',
            'LOG_DIR': 'logging.logDir',
            'MAX_CONNECTIONS': 'server.maxConnections',
            'SESSION_TIMEOUT': 'session.sessionTimeout',
            'ENABLE_RATE_LIMIT': 'security.enableRateLimit',
            'RATE_LIMIT_MAX': 'security.rateLimitMax',
            'ENABLE_METRICS': 'performance.enableMetrics',
            'ENABLE_DEBUG': 'development.enableDebugMode'
        };
        
        for (const [envVar, configPath] of Object.entries(envMappings)) {
            const value = process.env[envVar];
            if (value !== undefined) {
                this.setNestedValue(this.config, configPath, this.parseValue(value));
            }
        }
    }
    
    /**
     * 설정 파일 로드
     */
    loadConfigFile() {
        const configFiles = [
            `config.${this.environment}.json`,
            'config.json',
            '.sensorhubrc.json'
        ];
        
        for (const configFile of configFiles) {
            const configPath = path.join(process.cwd(), configFile);
            
            if (fs.existsSync(configPath)) {
                try {
                    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    this.config = this.deepMerge(this.config, fileConfig);
                    console.log(`설정 파일 로드: ${configFile}`);
                    break;
                } catch (error) {
                    console.warn(`설정 파일 로드 실패: ${configFile}`, error.message);
                }
            }
        }
    }
    
    /**
     * 설정 검증
     */
    validateConfig() {
        const validations = [
            {
                path: 'server.port',
                validator: (value) => Number.isInteger(value) && value > 0 && value < 65536,
                message: 'server.port는 1-65535 사이의 정수여야 합니다'
            },
            {
                path: 'server.maxConnections',
                validator: (value) => Number.isInteger(value) && value > 0,
                message: 'server.maxConnections는 양의 정수여야 합니다'
            },
            {
                path: 'session.codeLength',
                validator: (value) => Number.isInteger(value) && value >= 3 && value <= 8,
                message: 'session.codeLength는 3-8 사이의 정수여야 합니다'
            },
            {
                path: 'logging.level',
                validator: (value) => ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].includes(value),
                message: 'logging.level은 ERROR, WARN, INFO, DEBUG, TRACE 중 하나여야 합니다'
            }
        ];
        
        for (const validation of validations) {
            const value = this.getNestedValue(this.config, validation.path);
            if (!validation.validator(value)) {
                throw new Error(`설정 검증 실패: ${validation.message} (현재값: ${value})`);
            }
        }
    }
    
    /**
     * 설정값 가져오기
     */
    get(path, defaultValue = undefined) {
        return this.getNestedValue(this.config, path) || defaultValue;
    }
    
    /**
     * 설정값 설정
     */
    set(path, value) {
        this.setNestedValue(this.config, path, value);
        this.notifyWatchers(path, value);
    }
    
    /**
     * 전체 설정 반환
     */
    getAll() {
        return this.deepClone(this.config);
    }
    
    /**
     * 설정 감시자 등록
     */
    watch(path, callback) {
        if (!this.watchers.has(path)) {
            this.watchers.set(path, []);
        }
        this.watchers.get(path).push(callback);
    }
    
    /**
     * 설정 감시자 해제
     */
    unwatch(path, callback) {
        const callbacks = this.watchers.get(path);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    /**
     * 감시자들에게 알림
     */
    notifyWatchers(path, value) {
        const callbacks = this.watchers.get(path);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(value, path);
                } catch (error) {
                    console.error('설정 감시자 콜백 오류:', error);
                }
            });
        }
    }
    
    /**
     * 중첩된 객체에서 값 가져오기
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }
    
    /**
     * 중첩된 객체에 값 설정
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        
        target[lastKey] = value;
    }
    
    /**
     * 문자열 값을 적절한 타입으로 파싱
     */
    parseValue(value) {
        // 불린 값
        if (value === 'true') return true;
        if (value === 'false') return false;
        
        // 숫자 값
        if (/^\d+$/.test(value)) return parseInt(value, 10);
        if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
        
        // JSON 값 시도
        try {
            return JSON.parse(value);
        } catch {
            // 문자열 그대로 반환
            return value;
        }
    }
    
    /**
     * 깊은 복사
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.deepClone(item));
        }
        
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        
        return cloned;
    }
    
    /**
     * 깊은 병합
     */
    deepMerge(target, source) {
        const result = this.deepClone(target);
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this.deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }
    
    /**
     * 설정을 파일로 저장
     */
    saveToFile(filename = `config.${this.environment}.json`) {
        try {
            const configPath = path.join(process.cwd(), filename);
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
            console.log(`설정 저장 완료: ${filename}`);
        } catch (error) {
            console.error('설정 저장 실패:', error.message);
            throw error;
        }
    }
    
    /**
     * 현재 환경 반환
     */
    getEnvironment() {
        return this.environment;
    }
    
    /**
     * 개발 환경 여부
     */
    isDevelopment() {
        return this.environment === 'development';
    }
    
    /**
     * 프로덕션 환경 여부
     */
    isProduction() {
        return this.environment === 'production';
    }
    
    /**
     * 테스트 환경 여부
     */
    isTest() {
        return this.environment === 'test';
    }
}

// 전역 설정 인스턴스
const config = new ConfigManager();

module.exports = config;
module.exports.ConfigManager = ConfigManager;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
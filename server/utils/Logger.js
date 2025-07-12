/**
 * 🔍 통합 로깅 시스템
 * 
 * 구조화된 로깅 및 모니터링
 * - 레벨별 로깅
 * - 구조화된 메타데이터
 * - 성능 모니터링
 * - 에러 추적
 */

const fs = require('fs');
const path = require('path');

/**
 * 로그 레벨 정의
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

/**
 * 색상 정의 (콘솔 출력용)
 */
const COLORS = {
    ERROR: '\x1b[31m', // 빨간색
    WARN: '\x1b[33m',  // 노란색
    INFO: '\x1b[36m',  // 청록색
    DEBUG: '\x1b[35m', // 자주색
    TRACE: '\x1b[37m', // 흰색
    RESET: '\x1b[0m'
};

/**
 * 로거 클래스
 */
class Logger {
    constructor(component = 'Unknown', options = {}) {
        this.component = component;
        this.options = {
            level: options.level || process.env.LOG_LEVEL || 'INFO',
            enableConsole: options.enableConsole !== false,
            enableFile: options.enableFile || false,
            logDir: options.logDir || './logs',
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
            maxFiles: options.maxFiles || 5,
            enableColors: options.enableColors !== false,
            ...options
        };
        
        this.logLevel = LOG_LEVELS[this.options.level.toUpperCase()] || LOG_LEVELS.INFO;
        
        // 파일 로깅 활성화 시 디렉토리 생성
        if (this.options.enableFile) {
            this.ensureLogDirectory();
        }
    }
    
    /**
     * 로그 디렉토리 생성
     */
    ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.options.logDir)) {
                fs.mkdirSync(this.options.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('로그 디렉토리 생성 실패:', error.message);
        }
    }
    
    /**
     * 로그 메시지 포맷팅
     */
    formatMessage(level, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        
        const logEntry = {
            timestamp,
            level,
            component: this.component,
            message,
            ...metadata
        };
        
        return logEntry;
    }
    
    /**
     * 콘솔 출력 포맷팅
     */
    formatConsoleMessage(logEntry) {
        const color = this.options.enableColors ? COLORS[logEntry.level] : '';
        const reset = this.options.enableColors ? COLORS.RESET : '';
        
        let output = `${color}[${logEntry.timestamp}] ${logEntry.level.padEnd(5)} [${logEntry.component}] ${logEntry.message}${reset}`;
        
        // 메타데이터가 있으면 추가
        const metadata = { ...logEntry };
        delete metadata.timestamp;
        delete metadata.level;
        delete metadata.component;
        delete metadata.message;
        
        if (Object.keys(metadata).length > 0) {
            output += `\n${color}  ${JSON.stringify(metadata, null, 2)}${reset}`;
        }
        
        return output;
    }
    
    /**
     * 파일에 로그 작성
     */
    async writeToFile(logEntry) {
        if (!this.options.enableFile) {
            return;
        }
        
        try {
            const logFile = path.join(
                this.options.logDir,
                `${new Date().toISOString().split('T')[0]}.log`
            );
            
            const logLine = JSON.stringify(logEntry) + '\n';
            
            // 파일 크기 확인 및 로테이션
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size > this.options.maxFileSize) {
                    await this.rotateLogFile(logFile);
                }
            }
            
            fs.appendFileSync(logFile, logLine);
            
        } catch (error) {
            console.error('파일 로깅 실패:', error.message);
        }
    }
    
    /**
     * 로그 파일 로테이션
     */
    async rotateLogFile(logFile) {
        try {
            const baseName = path.basename(logFile, '.log');
            const dir = path.dirname(logFile);
            
            // 기존 파일들 이름 변경
            for (let i = this.options.maxFiles - 1; i > 0; i--) {
                const oldFile = path.join(dir, `${baseName}.${i}.log`);
                const newFile = path.join(dir, `${baseName}.${i + 1}.log`);
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.options.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // 가장 오래된 파일 삭제
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }
            
            // 현재 파일을 .1로 이름 변경
            const rotatedFile = path.join(dir, `${baseName}.1.log`);
            fs.renameSync(logFile, rotatedFile);
            
        } catch (error) {
            console.error('로그 파일 로테이션 실패:', error.message);
        }
    }
    
    /**
     * 로그 출력
     */
    async log(level, message, metadata = {}) {
        const levelNum = LOG_LEVELS[level];
        
        // 로그 레벨 확인
        if (levelNum > this.logLevel) {
            return;
        }
        
        const logEntry = this.formatMessage(level, message, metadata);
        
        // 콘솔 출력
        if (this.options.enableConsole) {
            const consoleMessage = this.formatConsoleMessage(logEntry);
            console.log(consoleMessage);
        }
        
        // 파일 출력
        if (this.options.enableFile) {
            await this.writeToFile(logEntry);
        }
    }
    
    /**
     * 에러 로그
     */
    async error(message, metadata = {}) {
        return this.log('ERROR', message, metadata);
    }
    
    /**
     * 경고 로그
     */
    async warn(message, metadata = {}) {
        return this.log('WARN', message, metadata);
    }
    
    /**
     * 정보 로그
     */
    async info(message, metadata = {}) {
        return this.log('INFO', message, metadata);
    }
    
    /**
     * 디버그 로그
     */
    async debug(message, metadata = {}) {
        return this.log('DEBUG', message, metadata);
    }
    
    /**
     * 추적 로그
     */
    async trace(message, metadata = {}) {
        return this.log('TRACE', message, metadata);
    }
    
    /**
     * 성능 측정 시작
     */
    startTimer(label) {
        const timer = {
            label,
            start: process.hrtime.bigint(),
            component: this.component
        };
        
        this.debug(`성능 측정 시작: ${label}`);
        
        return {
            end: () => {
                const end = process.hrtime.bigint();
                const duration = Number(end - timer.start) / 1000000; // 밀리초로 변환
                
                this.info(`성능 측정 완료: ${label}`, {
                    duration: `${duration.toFixed(2)}ms`,
                    performanceTimer: true
                });
                
                return duration;
            }
        };
    }
    
    /**
     * 자식 로거 생성
     */
    child(childComponent, additionalOptions = {}) {
        const childName = `${this.component}:${childComponent}`;
        return new Logger(childName, {
            ...this.options,
            ...additionalOptions
        });
    }
}

/**
 * 전역 로거 인스턴스
 */
const globalLogger = new Logger('Global', {
    level: process.env.LOG_LEVEL || 'INFO',
    enableFile: process.env.ENABLE_FILE_LOGGING === 'true',
    logDir: process.env.LOG_DIR || './logs'
});

module.exports = Logger;
module.exports.globalLogger = globalLogger;
module.exports.LOG_LEVELS = LOG_LEVELS;
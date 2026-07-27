/**
 * PERN Backend Logger
 * Simple structured logging with levels
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = process.env.LOG_LEVEL || 'info';

function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  });
}

const logger = {
  debug: (message, meta = {}) => {
    if (shouldLog('debug')) {
      console.log(formatLog('debug', message, meta));
    }
  },
  
  info: (message, meta = {}) => {
    if (shouldLog('info')) {
      console.log(formatLog('info', message, meta));
    }
  },
  
  warn: (message, meta = {}) => {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, meta));
    }
  },
  
  error: (message, meta = {}) => {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, meta));
    }
  }
};

module.exports = logger;
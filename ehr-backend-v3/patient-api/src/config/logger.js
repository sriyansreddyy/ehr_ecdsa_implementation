'use strict';
const { createLogger, format, transports } = require('winston');
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const meta_keys = Object.keys(meta);
      const m = meta_keys.length ? ' ' + JSON.stringify(meta, (key, value) => 
        typeof value === 'object' && value !== null ? 
          (key === 'error' || key === 'err' ? { message: value.message, stack: value.stack } : '[Object]') : value
      ) : '';
      return `${timestamp} [${level.toUpperCase()}] [patient-api] ${message}${m}`;
    })
  ),
  transports: [new transports.Console()],
});
module.exports = logger;

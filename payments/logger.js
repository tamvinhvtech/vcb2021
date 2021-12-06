const path = require('path');
const moment = require('moment-timezone');
const winston = require('winston');
const tsFormat = () => moment().format('YYYY-MM-DD hh:mm:ss').trim();
const myFormat = winston.format.printf(({ level, message }) => {
  return `${tsFormat()}|${level}| ${message}`;
});
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: 'debug',
      handleExceptions: true,
      json: false,
      colorize: true,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      level: 'error',
      filename: path.normalize(__dirname + '/../logs/payments.log'),
      handleExceptions: true,
      json: true,
      maxsize: 5242880, // 5MB
      maxFiles: 500,
      colorize: false,
      timestamp: tsFormat,
      format: winston.format.combine(
        myFormat,
        // winston.format.simple()
      )
    }),
  ],
  exitOnError: false,
  exceptionHandlers: [
    new winston.transports.File({ filename: path.normalize(__dirname + '/../logs/payments_exceptions.log') })
  ]
});


module.exports = logger;

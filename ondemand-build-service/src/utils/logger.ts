import winston from 'winston';

/**
 * アプリケーションのロギングを担当するロガーモジュール
 * 開発環境ではdebugレベル、本番環境ではinfoレベルのログを出力
 * コンソールと専用ログファイルの両方に出力する
 */
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${
        Object.keys(rest).length ? JSON.stringify(rest) : ''
      }`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});
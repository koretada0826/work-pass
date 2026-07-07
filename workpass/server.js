'use strict';
// WORK PASS ローカル用 HTTPサーバー（依存ゼロ）。ルーティングは handler.js を共用。
const http = require('http');
const { handle } = require('./handler');

const PORT = process.env.PORT || 4000;
// バインド先：既定はループバックのみ（ローカルでPIIを外に見せない）。
// 本番はVercel（サーバーレス）なのでこのファイルは使わない。LAN公開したい時のみ HOST=0.0.0.0。
const HOST = process.env.HOST || '127.0.0.1';

http.createServer(handle).listen(PORT, HOST, () => {
  console.log(`\n  WORK PASS 起動 →  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n  （backend: ${require('./db').__backend} / 停止： Ctrl + C ）\n`);
});

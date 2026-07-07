// Vercel サーバーレス関数：/api/* の全リクエストを共通ハンドラで処理
const { handle } = require('../handler');
module.exports = (req, res) => handle(req, res);

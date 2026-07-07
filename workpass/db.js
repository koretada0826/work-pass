'use strict';
// データ層のディスパッチャ：
//  SUPABASE_URL が設定されていれば Supabase(PostgREST)、無ければローカル内蔵SQLite を使う。
//  どちらも同じ関数名をエクスポート（呼び出し側は await で統一）。
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
module.exports = useSupabase ? require('./db_supabase') : require('./db_sqlite');
module.exports.__backend = useSupabase ? 'supabase' : 'sqlite';

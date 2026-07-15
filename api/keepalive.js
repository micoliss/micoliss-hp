// Supabase無料枠は、約7日間まったくアクセスが無いとプロジェクトが自動停止する。
// このendpointを外部スケジューラ(GitHub Actions・毎日1回)が叩き、Supabaseへ軽いDBアクセスを1回送って
// 「稼働中」に保つ＝自動停止を予防する。Supabaseの外(GitHub→Vercel→Supabase)から叩くので、
// pg_cronが万一止まっていても効く独立した保険。送信など副作用は一切なし。
const { SUPABASE_URL, svcHeaders } = require('../lib/line');

module.exports = async (req, res) => {
  try {
    if (!process.env.SUPABASE_SERVICE_KEY) { res.status(200).json({ ok: false, reason: 'no service key' }); return; }
    // いちばん軽い読み取り（1行だけ）でDBに触れる。これがSupabaseへの「アクセス」になる。
    const r = await fetch(`${SUPABASE_URL}/rest/v1/reminder_settings?select=type&limit=1`, { headers: svcHeaders() });
    res.status(200).json({ ok: r.ok, status: r.status, ts: new Date().toISOString() });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};

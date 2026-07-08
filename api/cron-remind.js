// 予約リマインドの自動送信（Vercel Cronから1日2回呼ばれる）。
//   slot=eve     … 夕方(18:00 JST)：翌日が予約日の人へ「前日リマインド」
//   slot=morning … 朝(8:00 JST)：今日が予約日の人へ「当日」＋昨日来た人へ「お礼」＋14日前の人へ「フォロー」
// 送信済みフラグ(rem_*)で二重送信を防止。LINE連携済み(line_user_idあり)の予約だけが対象。

const { SUPABASE_URL, buildText, pushLine, svcHeaders } = require('../lib/line');

// JST基準の「今」（UTCで動くので+9時間）。日付や時刻の計算に使う。
function nowJst() { return new Date(Date.now() + 9 * 3600 * 1000); }
function jstDateStr(offsetDays) {
  const d = new Date(nowJst().getTime() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  // CRON_SECRETを設定していれば呼び出しを制限する（未設定なら誰でも可＝後方互換）。
  //   Vercelの定時cron → Authorization: Bearer <CRON_SECRET> を自動付与
  //   外部スケジューラ(cron-job.org等) → URLに ?key=<CRON_SECRET> を付ける
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const okHeader = (req.headers.authorization || '') === `Bearer ${secret}`;
    const okQuery = req.query && req.query.key === secret;
    if (!okHeader && !okQuery) { res.status(401).json({ ok: false }); return; }
  }
  if (!process.env.SUPABASE_SERVICE_KEY) { res.status(200).json({ ok: false, reason: 'no service key' }); return; }

  const slot = (req.query && req.query.slot) || 'morning';
  const h = svcHeaders();
  const results = [];

  // 指定日(dateStr)で未送信の予約に、typeのリマインドを送り、送信できたらcolをtrueにする
  async function sendFor(dateStr, type, col) {
    const q = `${SUPABASE_URL}/rest/v1/reservations?date=eq.${dateStr}`
      + `&status=neq.cancelled&line_user_id=not.is.null&${col}=is.false`
      + `&select=id,name,date,time,menu_name,line_user_id`;
    const rows = await (await fetch(q, { headers: h })).json();
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const pr = await pushLine(r.line_user_id, buildText(type, r));
      if (pr.ok) {
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
          method: 'PATCH', headers: h, body: JSON.stringify({ [col]: true }),
        });
      }
      results.push({ id: r.id, type, ok: pr.ok });
    }
  }

  // slot=soon：今日の予約のうち「開始まで約1時間以内」で未送信の人へ「まもなく」通知。
  // 外部スケジューラが数分おきに叩く想定。rem_hourフラグで一度だけ送る。
  async function sendSoon() {
    const n = nowJst();
    const nowMin = n.getUTCHours() * 60 + n.getUTCMinutes(); // +9時間済みなのでこれがJSTの時計
    const q = `${SUPABASE_URL}/rest/v1/reservations?date=eq.${jstDateStr(0)}`
      + `&status=neq.cancelled&line_user_id=not.is.null&rem_hour=is.false`
      + `&select=id,name,date,time,menu_name,line_user_id`;
    const rows = await (await fetch(q, { headers: h })).json();
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const [hh, mm] = String(r.time || '').slice(0, 5).split(':').map(Number);
      const startMin = (hh || 0) * 60 + (mm || 0);
      const diff = startMin - nowMin;               // 開始まであと何分か
      if (diff > 0 && diff <= 60) {                 // 開始1時間前〜直前
        const pr = await pushLine(r.line_user_id, buildText('soon', r));
        if (pr.ok) {
          await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
            method: 'PATCH', headers: h, body: JSON.stringify({ rem_hour: true }),
          });
        }
        results.push({ id: r.id, type: 'soon', ok: pr.ok });
      }
    }
  }

  try {
    if (slot === 'eve') {
      await sendFor(jstDateStr(1), 'prev', 'rem_prev');        // 明日が予約日 → 前日リマインド
    } else if (slot === 'soon') {
      await sendSoon();                                        // 開始1時間前 → まもなく通知
    } else {
      await sendFor(jstDateStr(0),   'today',  'rem_today');   // 今日が予約日 → 当日リマインド
      await sendFor(jstDateStr(-1),  'thanks', 'rem_thanks');  // 昨日が予約日 → お礼
      await sendFor(jstDateStr(-14), 'follow', 'rem_follow');  // 14日前が予約日 → フォロー
    }
    res.status(200).json({ ok: true, slot, count: results.length, sent: results });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception', slot, sent: results });
  }
};

// 予約リマインドの自動送信（Vercel Cronから1日2回呼ばれる）。
//   slot=eve     … 夕方(18:00 JST)：翌日が予約日の人へ「前日リマインド」
//   slot=morning … 朝(8:00 JST)：今日が予約日の人へ「当日」＋昨日来た人へ「お礼」＋14日前の人へ「フォロー」
// 送信済みフラグ(rem_*)で二重送信を防止。LINE連携済み(line_user_idあり)の予約だけが対象。

const { SUPABASE_URL, buildText, pushLine, svcHeaders } = require('../lib/line');

// JSTの日付文字列 'YYYY-MM-DD'（offsetDays日ずらし）。関数はUTCで動くので+9時間して計算。
function jstDateStr(offsetDays) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  // CRON_SECRETを設定していれば、Vercel Cron以外からの呼び出しを弾く
  if (process.env.CRON_SECRET) {
    if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ ok: false }); return;
    }
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

  try {
    if (slot === 'eve') {
      await sendFor(jstDateStr(1), 'prev', 'rem_prev');        // 明日が予約日 → 前日リマインド
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

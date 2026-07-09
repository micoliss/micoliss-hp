// リマインドの自動送信。GitHub Actionsが10分おきに叩く（Vercel cronもバックアップで叩く）。
// 送信可否・時刻・文面はすべて reminder_settings テーブル（管理ページで編集）を読む。
// 各予約の rem_* フラグで、1日に何度叩かれても二重送信しない。

const { SUPABASE_URL, pushLine, svcHeaders, renderTemplate, buildText, fetchSettings } = require('../lib/line');
const { sendMail, buildSubject } = require('../lib/mail');

// 1件のリマインドを届ける。LINE連携済みならLINE、無ければメール（どちらも無ければ何もしない）。
async function deliver(type, r, text) {
  if (r.line_user_id) { const pr = await pushLine(r.line_user_id, text); return { ok: pr.ok, via: 'line' }; }
  if (r.mail)         { const mr = await sendMail(r.mail, buildSubject(type), text); return { ok: mr.ok, via: 'mail' }; }
  return { ok: false, via: 'none' };
}

// 設定テーブルが未作成/空でも動くための既定値
const DEFAULTS = {
  soon:   { enabled: true, offset_min: 60 },
  prev:   { enabled: true, send_time: '18:00' },
  today:  { enabled: true, send_time: '08:00' },
  thanks: { enabled: true, send_time: '10:00' },
  follow: { enabled: true, send_time: '10:00', offset_days: 14 },
};

function nowJst() { return new Date(Date.now() + 9 * 3600 * 1000); }
function jstDateStr(offsetDays) {
  const d = new Date(nowJst().getTime() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}
function toMin(hhmm) { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

module.exports = async (req, res) => {
  // CRON_SECRETを設定していれば呼び出しを制限（未設定なら開放）
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const okHeader = (req.headers.authorization || '') === `Bearer ${secret}`;
    const okQuery = req.query && req.query.key === secret;
    if (!okHeader && !okQuery) { res.status(401).json({ ok: false }); return; }
  }
  if (!process.env.SUPABASE_SERVICE_KEY) { res.status(200).json({ ok: false, reason: 'no service key' }); return; }

  const h = svcHeaders();
  const settings = await fetchSettings(h);
  const cfg = (type) => settings[type] || DEFAULTS[type] || {};
  const n = nowJst();
  const nowMin = n.getUTCHours() * 60 + n.getUTCMinutes(); // +9時間済みなのでJSTの時計
  const results = [];

  // 指定日で未送信の予約に、その文面を送り、成功したらフラグを立てる
  async function sendBatch(type, dateStr, col) {
    const s = cfg(type);
    if (s.enabled === false) return;
    const q = `${SUPABASE_URL}/rest/v1/reservations?date=eq.${dateStr}`
      + `&status=neq.cancelled&${col}=is.false`
      + `&or=(line_user_id.not.is.null,mail.not.is.null)`
      + `&select=id,name,date,time,menu_name,line_user_id,mail`;
    const rows = await (await fetch(q, { headers: h })).json();
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const text = s.template ? renderTemplate(s.template, r) : buildText(type, r);
      const pr = await deliver(type, r, text);
      if (pr.ok) {
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
          method: 'PATCH', headers: h, body: JSON.stringify({ [col]: true }),
        });
      }
      results.push({ id: r.id, type, ok: pr.ok, via: pr.via });
    }
  }

  // 開始まで「offset_min分以内」で未送信の当日予約に「まもなく」を送る（時刻ゲートなし・常に評価）
  async function sendSoon() {
    const s = cfg('soon');
    if (s.enabled === false) return;
    const off = s.offset_min || 60;
    const q = `${SUPABASE_URL}/rest/v1/reservations?date=eq.${jstDateStr(0)}`
      + `&status=neq.cancelled&rem_hour=is.false`
      + `&or=(line_user_id.not.is.null,mail.not.is.null)`
      + `&select=id,name,date,time,menu_name,line_user_id,mail`;
    const rows = await (await fetch(q, { headers: h })).json();
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const [hh, mm] = String(r.time || '').slice(0, 5).split(':').map(Number);
      const diff = (hh || 0) * 60 + (mm || 0) - nowMin;
      if (diff > 0 && diff <= off) {
        const text = s.template ? renderTemplate(s.template, r) : buildText('soon', r);
        const pr = await deliver('soon', r, text);
        if (pr.ok) {
          await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
            method: 'PATCH', headers: h, body: JSON.stringify({ rem_hour: true }),
          });
        }
        results.push({ id: r.id, type: 'soon', ok: pr.ok, via: pr.via });
      }
    }
  }

  // 時刻ゲート型：今の時刻(JST)が設定の送信時刻を過ぎていれば送る
  const passed = (type) => { const s = cfg(type); return s.enabled !== false && nowMin >= toMin(s.send_time); };

  try {
    await sendSoon();
    if (passed('prev'))   await sendBatch('prev',   jstDateStr(1),  'rem_prev');   // 明日が予約日
    if (passed('today'))  await sendBatch('today',  jstDateStr(0),  'rem_today');  // 今日が予約日
    if (passed('thanks')) await sendBatch('thanks', jstDateStr(-1), 'rem_thanks'); // 昨日が予約日
    if (passed('follow')) {
      const days = cfg('follow').offset_days || 14;
      await sendBatch('follow', jstDateStr(-days), 'rem_follow');                  // days日前が予約日
    }
    const hh = String(Math.floor(nowMin / 60)).padStart(2, '0');
    const mm = String(nowMin % 60).padStart(2, '0');
    res.status(200).json({ ok: true, jst: `${hh}:${mm}`, count: results.length, sent: results });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception', sent: results });
  }
};

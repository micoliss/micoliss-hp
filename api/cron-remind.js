// リマインドの自動送信。GitHub Actionsが10分おきに叩く（Vercel cronもバックアップで叩く）。
// 送信可否・時刻・文面はすべて reminder_settings テーブル（管理ページで編集）を読む。
// 各予約の rem_* フラグで、1日に何度叩かれても二重送信しない。

const { SUPABASE_URL, pushLineMessages, svcHeaders, renderTemplate, buildText, fetchSettings, buildPayload } = require('../lib/line');
const { sendMail, buildSubject } = require('../lib/mail');

// 1件のリマインドを届ける。LINE連携済みならLINE、メール登録があればメール、両方あれば両方へ送る。
// 🔔設定に画像があれば、LINEは画像メッセージ、メールは添付として一緒に送る。
// どれか1つでも成功したら ok=true（成功したチャネルだけ送信済みにし、失敗分でずっと再送しないため）。
async function deliver(type, r, text, imageUrls) {
  const via = [];
  const { messages, attachments } = buildPayload(text, imageUrls);
  if (r.line_user_id) { const pr = await pushLineMessages(r.line_user_id, messages);          if (pr.ok) via.push('line'); }
  if (r.mail)         { const mr = await sendMail(r.mail, buildSubject(type), text, attachments); if (mr.ok) via.push('mail'); }
  return { ok: via.length > 0, via: via.join('+') || 'none' };
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
      // 「本日」は予約時刻を過ぎたら送らない（巡回が遅れても、終わった予約に通知が飛ばないように）
      if (type === 'today') {
        const [hh, mm] = String(r.time || '').slice(0, 5).split(':').map(Number);
        if ((hh || 0) * 60 + (mm || 0) <= nowMin) continue;
      }
      const text = s.template ? renderTemplate(s.template, r) : buildText(type, r);
      const pr = await deliver(type, r, text, s.image_urls);
      if (pr.ok) {
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
          method: 'PATCH', headers: h, body: JSON.stringify({ [col]: true }),
        });
      }
      results.push({ id: r.id, type, ok: pr.ok, via: pr.via });
    }
  }

  // 「◯分前」型リマインド：今日の予約で、開始まで設定分以内・まだ始まっていない・未送信のものに送る。
  // 巡回は5分おきなので、開始◯分前を最初にまたいだ巡回で1回だけ送られる（rem_soonで二重送信防止）。
  async function sendSoon() {
    const s = cfg('soon');
    if (s.enabled === false) return;
    const offset = Number(s.offset_min) || 60;
    const q = `${SUPABASE_URL}/rest/v1/reservations?date=eq.${jstDateStr(0)}`
      + `&status=neq.cancelled&rem_soon=is.false`
      + `&or=(line_user_id.not.is.null,mail.not.is.null)`
      + `&select=id,name,date,time,menu_name,line_user_id,mail`;
    const rows = await (await fetch(q, { headers: h })).json();
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const [hh, mm] = String(r.time || '').slice(0, 5).split(':').map(Number);
      const remain = (hh || 0) * 60 + (mm || 0) - nowMin;
      if (remain <= 0 || remain > offset) continue;   // もう始まった／まだ先すぎる
      const text = s.template ? renderTemplate(s.template, r) : buildText('soon', r);
      const pr = await deliver('soon', r, text, s.image_urls);
      if (pr.ok) {
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
          method: 'PATCH', headers: h, body: JSON.stringify({ rem_soon: true }),
        });
      }
      results.push({ id: r.id, type: 'soon', ok: pr.ok, via: pr.via });
    }
  }

  // 時刻ゲート型：今の時刻(JST)が設定の送信時刻を過ぎていれば送る
  const passed = (type) => { const s = cfg(type); return s.enabled !== false && nowMin >= toMin(s.send_time); };

  try {
    await sendSoon();                                                              // 予約の約◯分前
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

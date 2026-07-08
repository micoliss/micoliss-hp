// 管理ページ(admin.html)から、お客様のLINEへリマインドを手動送信する。
// 送信内容は type（前日/当日/お礼/フォロー）と予約情報から組み立てる（文面は lib/line.js）。

const { buildText, pushLine } = require('../lib/line');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  if (!process.env.LINE_CHANNEL_ID || !process.env.LINE_CHANNEL_SECRET) {
    res.status(200).json({ ok: false, reason: 'not configured' }); return;
  }
  const b = req.body || {};
  const to = b.to;
  const text = buildText(b.type, b);
  if (!to) { res.status(200).json({ ok: false, reason: 'no line user' }); return; }
  if (!text) { res.status(200).json({ ok: false, reason: 'bad type' }); return; }

  try {
    const r = await pushLine(to, text);
    res.status(200).json(r.ok ? { ok: true } : { ok: false, reason: 'line error', detail: r.detail });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};

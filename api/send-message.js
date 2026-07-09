// 管理ページの「お客様詳細・返信」から、自由入力のメッセージをお客様へ送る。
// to（LINE userId）が来ればLINE、mail が来ればメールで送る。
// リマインド（type固定文面）とは別に、任意の文章を1通送るための窓口。

const { pushLine } = require('../lib/line');
const { sendMail } = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const b = req.body || {};
  const text = (b.text == null ? '' : String(b.text));
  if (!text.trim()) { res.status(200).json({ ok: false, reason: 'no text' }); return; }
  const to = b.to;      // LINE userId
  const mail = b.mail;  // メールアドレス
  const subject = b.subject || 'Seed of Color -Micoliss- より';
  if (!to && !mail) { res.status(200).json({ ok: false, reason: 'no recipient' }); return; }

  try {
    const via = [];
    if (to)   { const pr = await pushLine(to, text);              if (pr.ok) via.push('line'); }
    if (mail) { const mr = await sendMail(mail, subject, text);   if (mr.ok) via.push('mail'); }
    res.status(200).json(via.length ? { ok: true, via: via.join('+') } : { ok: false, reason: 'send error' });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};

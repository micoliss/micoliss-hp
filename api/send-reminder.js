// 管理ページ(admin.html)から、お客様へリマインドを手動送信する。
// LINE連携済みならLINE、そうでなければメール（mail宛）で送る。
// 文面は reminder_settings（管理ページで編集したテンプレート）を優先し、無ければ既定文面。

const { buildText, pushLine, renderTemplate, fetchSettings, svcHeaders } = require('../lib/line');
const { sendMail, buildSubject } = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const b = req.body || {};
  const to = b.to;       // LINE userId
  const mail = b.mail;   // メールアドレス
  if (!to && !mail) { res.status(200).json({ ok: false, reason: 'no recipient' }); return; }

  // 文面：管理ページのテンプレートがあればそれを使い、なければ既定文面
  let text;
  try {
    const s = (await fetchSettings(svcHeaders()))[b.type];
    text = s && s.template ? renderTemplate(s.template, b) : buildText(b.type, b);
  } catch (e) {
    text = buildText(b.type, b);
  }
  if (!text) { res.status(200).json({ ok: false, reason: 'bad type' }); return; }

  try {
    const via = [];
    if (to)   { const pr = await pushLine(to, text);                    if (pr.ok) via.push('line'); }
    if (mail) { const mr = await sendMail(mail, buildSubject(b.type), text); if (mr.ok) via.push('mail'); }
    res.status(200).json(via.length ? { ok: true, via: via.join('+') } : { ok: false, reason: 'send error' });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};

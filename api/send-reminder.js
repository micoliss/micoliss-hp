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
    let r;
    if (to) {
      r = await pushLine(to, text);            // LINE優先
    } else {
      r = await sendMail(mail, buildSubject(b.type), text); // 無ければメール
    }
    res.status(200).json(r.ok ? { ok: true, via: to ? 'line' : 'mail' } : { ok: false, reason: 'send error', detail: r.detail });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};

// 管理ページ(admin.html)から、お客様のLINEへリマインドを手動送信する。
// 文面は reminder_settings（管理ページで編集したテンプレート）を優先し、無ければ既定文面。

const { buildText, pushLine, renderTemplate, fetchSettings, svcHeaders } = require('../lib/line');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  if (!process.env.LINE_CHANNEL_ID || !process.env.LINE_CHANNEL_SECRET) {
    res.status(200).json({ ok: false, reason: 'not configured' }); return;
  }
  const b = req.body || {};
  const to = b.to;
  if (!to) { res.status(200).json({ ok: false, reason: 'no line user' }); return; }

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
    const r = await pushLine(to, text);
    res.status(200).json(r.ok ? { ok: true } : { ok: false, reason: 'line error', detail: r.detail });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};

// Threads API まわりの共通処理。
// トークンは Supabase の threads_tokens テーブル（1行だけ）に保存する。
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://efortdqqqeclshcquqbu.supabase.co';

function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

async function saveToken({ accessToken, threadsUserId, expiresAt }) {
  await fetch(`${SUPABASE_URL}/rest/v1/threads_tokens?id=eq.1`, {
    method: 'PATCH',
    headers: { ...svcHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: 1,
      access_token: accessToken,
      threads_user_id: threadsUserId,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }),
  });
  // 行がまだ無い場合はPOSTでも試す（初回のみ）
  await fetch(`${SUPABASE_URL}/rest/v1/threads_tokens`, {
    method: 'POST',
    headers: { ...svcHeaders(), Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      id: 1,
      access_token: accessToken,
      threads_user_id: threadsUserId,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function getToken() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/threads_tokens?id=eq.1&select=*`, { headers: svcHeaders() });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// 短期トークン → 長期トークン（60日）に交換
async function exchangeForLongLivedToken(shortLivedToken) {
  const url = `https://graph.threads.net/access_token?grant_type=th_exchange_token`
    + `&client_secret=${process.env.THREADS_APP_SECRET}`
    + `&access_token=${shortLivedToken}`;
  const r = await fetch(url);
  return r.json(); // { access_token, token_type, expires_in }
}

// 長期トークンの更新（期限が近づいたら呼ぶ）
async function refreshLongLivedToken(currentToken) {
  const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token`
    + `&access_token=${currentToken}`;
  const r = await fetch(url);
  return r.json(); // { access_token, token_type, expires_in }
}

// テキストだけのスレッドを1件投稿する（replyToIdを指定するとその投稿への返信になる）
async function postThread(accessToken, threadsUserId, text, replyToId) {
  const createUrl = `https://graph.threads.net/v1.0/${threadsUserId}/threads`;
  const payload = { media_type: 'TEXT', text, access_token: accessToken };
  if (replyToId) payload.reply_to_id = replyToId;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error('スレッドの下書き作成に失敗: ' + JSON.stringify(created));

  // 下書きの準備ができるまで少し待つ（最大10秒）
  const statusUrl = `https://graph.threads.net/v1.0/${created.id}?fields=status,error_message&access_token=${accessToken}`;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await (await fetch(statusUrl)).json();
    if (status.status === 'FINISHED') break;
    if (status.status === 'ERROR') throw new Error('下書きの準備に失敗: ' + JSON.stringify(status));
  }

  const publishUrl = `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`;
  const publishRes = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
  });
  return publishRes.json(); // { id }
}

module.exports = {
  SUPABASE_URL,
  svcHeaders,
  saveToken,
  getToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  postThread,
};

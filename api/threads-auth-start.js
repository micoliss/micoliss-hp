// 最初に一度だけ開くページ。Threadsの許可画面に飛ばす。
module.exports = async (req, res) => {
  const redirectUri = 'https://micoliss-hp.vercel.app/api/threads-auth-callback';
  const url = `https://threads.net/oauth/authorize`
    + `?client_id=${process.env.THREADS_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&scope=threads_basic,threads_content_publish`
    + `&response_type=code`;
  res.writeHead(302, { Location: url });
  res.end();
};

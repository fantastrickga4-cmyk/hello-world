import { verifyPassword, signToken } from './_lib/auth.js';
import { getUser } from './_lib/storage.js';
import { readJsonBody, json } from './_lib/respond.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { error: '잘못된 요청입니다.' });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!username || !password) {
    return json(res, 400, { error: '아이디와 비밀번호를 입력하세요.' });
  }

  const user = await getUser(username);
  if (!user) return json(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return json(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  const token = await signToken(user.username);
  return json(res, 200, { token, username: user.username });
}

import { hashPassword, signToken } from './_lib/auth.js';
import { getUser, createUser } from './_lib/storage.js';
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

  if (!/^[a-zA-Z0-9_가-힣]{2,20}$/.test(username)) {
    return json(res, 400, { error: '아이디는 2~20자(영문/숫자/한글/언더스코어)여야 합니다.' });
  }
  if (password.length < 4) {
    return json(res, 400, { error: '비밀번호는 4자 이상이어야 합니다.' });
  }

  const existing = await getUser(username);
  if (existing) return json(res, 409, { error: '이미 존재하는 아이디입니다.' });

  const passwordHash = await hashPassword(password);
  try {
    await createUser(username, passwordHash);
  } catch (e) {
    if (String(e?.message || '').includes('already exists')) {
      return json(res, 409, { error: '이미 존재하는 아이디입니다.' });
    }
    throw e;
  }

  const token = await signToken(username);
  return json(res, 201, { token, username });
}

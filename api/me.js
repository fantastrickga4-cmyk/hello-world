import { getUserFromRequest, isAdmin } from './_lib/auth.js';
import { json } from './_lib/respond.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const username = await getUserFromRequest(req);
  if (!username) return json(res, 401, { error: '로그인이 필요합니다.' });
  return json(res, 200, { username, isAdmin: isAdmin(username) });
}

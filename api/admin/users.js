import { getUserFromRequest, isAdmin } from '../_lib/auth.js';
import { listUsers, deleteUser, deletePostsByAuthor } from '../_lib/storage.js';
import { json } from '../_lib/respond.js';

export default async function handler(req, res) {
  const username = await getUserFromRequest(req);
  if (!username) return json(res, 401, { error: '로그인이 필요합니다.' });
  if (!isAdmin(username)) return json(res, 403, { error: '관리자 권한이 필요합니다.' });

  if (req.method === 'GET') {
    const users = await listUsers();
    return json(res, 200, { users });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const target = url.searchParams.get('username');
    if (!target) return json(res, 400, { error: 'username이 필요합니다.' });
    if (target.toLowerCase() === username.toLowerCase()) {
      return json(res, 400, { error: '자신은 삭제할 수 없습니다.' });
    }

    const removed = await deleteUser(target);
    if (!removed) return json(res, 404, { error: '사용자를 찾을 수 없습니다.' });
    const postsRemoved = await deletePostsByAuthor(target);
    return json(res, 200, { ok: true, postsRemoved });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

import { getUserFromRequest } from './_lib/auth.js';
import { listPosts, createPost, getPost, deletePost } from './_lib/storage.js';
import { readJsonBody, json } from './_lib/respond.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const posts = await listPosts();
    return json(res, 200, { posts });
  }

  if (req.method === 'POST') {
    const username = await getUserFromRequest(req);
    if (!username) return json(res, 401, { error: '로그인이 필요합니다.' });

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return json(res, 400, { error: '잘못된 요청입니다.' });
    }

    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    if (!title || title.length > 100) {
      return json(res, 400, { error: '제목은 1~100자여야 합니다.' });
    }
    if (!content || content.length > 5000) {
      return json(res, 400, { error: '내용은 1~5000자여야 합니다.' });
    }

    const post = await createPost({ author: username, title, content });
    return json(res, 201, { post });
  }

  if (req.method === 'DELETE') {
    const username = await getUserFromRequest(req);
    if (!username) return json(res, 401, { error: '로그인이 필요합니다.' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id가 필요합니다.' });

    const post = await getPost(id);
    if (!post) return json(res, 404, { error: '게시글을 찾을 수 없습니다.' });
    if (post.author !== username) {
      return json(res, 403, { error: '본인 글만 삭제할 수 있습니다.' });
    }

    await deletePost(id);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

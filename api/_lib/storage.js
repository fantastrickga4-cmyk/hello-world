import { put, list, head, del } from '@vercel/blob';

const USER_PREFIX = 'users/';
const POST_PREFIX = 'posts/';

function userKey(username) {
  return `${USER_PREFIX}${username.toLowerCase()}.json`;
}

function postKey(id) {
  return `${POST_PREFIX}${id}.json`;
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  return r.json();
}

export async function getUser(username) {
  const key = userKey(username);
  const blobs = await list({ prefix: key, limit: 1 });
  const match = blobs.blobs.find((b) => b.pathname === key);
  if (!match) return null;
  return fetchJson(match.url);
}

export async function createUser(username, passwordHash) {
  const key = userKey(username);
  const data = {
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  await put(key, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return data;
}

export async function listPosts() {
  const blobs = await list({ prefix: POST_PREFIX });
  const items = await Promise.all(
    blobs.blobs.map((b) => fetchJson(b.url))
  );
  return items
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createPost({ author, title, content }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const post = {
    id,
    author,
    title,
    content,
    createdAt: new Date().toISOString(),
  };
  await put(postKey(id), JSON.stringify(post), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return post;
}

export async function getPost(id) {
  const key = postKey(id);
  const blobs = await list({ prefix: key, limit: 1 });
  const match = blobs.blobs.find((b) => b.pathname === key);
  if (!match) return null;
  return fetchJson(match.url);
}

export async function deletePost(id) {
  const key = postKey(id);
  const blobs = await list({ prefix: key, limit: 1 });
  const match = blobs.blobs.find((b) => b.pathname === key);
  if (!match) return false;
  await del(match.url);
  return true;
}

export async function listUsers() {
  const blobs = await list({ prefix: USER_PREFIX });
  const items = await Promise.all(blobs.blobs.map((b) => fetchJson(b.url)));
  return items
    .filter(Boolean)
    .map(({ username, createdAt }) => ({ username, createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteUser(username) {
  const key = userKey(username);
  const blobs = await list({ prefix: key, limit: 1 });
  const match = blobs.blobs.find((b) => b.pathname === key);
  if (!match) return false;
  await del(match.url);
  return true;
}

export async function deletePostsByAuthor(username) {
  const blobs = await list({ prefix: POST_PREFIX });
  const targets = [];
  for (const b of blobs.blobs) {
    const post = await fetchJson(b.url);
    if (post && post.author === username) targets.push(b.url);
  }
  if (targets.length) await del(targets);
  return targets.length;
}

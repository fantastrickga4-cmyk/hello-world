const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUsername';

const $ = (sel) => document.querySelector(sel);

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  username: localStorage.getItem(USER_KEY),
  isAdmin: false,
};

function setAuth(token, username) {
  state.token = token;
  state.username = username;
  if (!token) state.isAdmin = false;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  renderAuth();
}

function renderAuth() {
  const area = $('#auth-area');
  const authPanel = $('#auth-panel');
  const newPostBtn = $('#new-post-btn');
  const writePanel = $('#write-panel');

  if (state.token && state.username) {
    area.innerHTML = `
      <span class="username">${escapeHtml(state.username)}</span>
      ${state.isAdmin ? `<a href="/admin.html">관리자</a>` : ''}
      <button id="logout-btn">로그아웃</button>
      <a href="/">달력</a>
    `;
    $('#logout-btn').addEventListener('click', () => {
      setAuth(null, null);
      writePanel.classList.add('hidden');
      renderPosts(currentPosts);
    });
    authPanel.classList.add('hidden');
    newPostBtn.classList.remove('hidden');
  } else {
    area.innerHTML = `
      <button id="show-auth-btn">로그인 / 회원가입</button>
      <a href="/">달력</a>
    `;
    $('#show-auth-btn').addEventListener('click', () => {
      authPanel.classList.toggle('hidden');
    });
    newPostBtn.classList.add('hidden');
    writePanel.classList.add('hidden');
    renderPosts(currentPosts);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let currentPosts = [];

function renderPosts(posts) {
  currentPosts = posts;
  const root = $('#posts');
  if (!posts.length) {
    root.innerHTML = '<p class="empty">아직 글이 없습니다. 첫 글을 남겨보세요!</p>';
    return;
  }
  root.innerHTML = posts
    .map((p) => {
      const canDelete = state.username && state.username === p.author;
      return `
        <article class="post" data-id="${escapeHtml(p.id)}">
          <div class="post-head">
            <div class="post-title">${escapeHtml(p.title)}</div>
            <div class="post-meta">${escapeHtml(p.author)} · ${formatDate(p.createdAt)}</div>
          </div>
          <div class="post-body">${escapeHtml(p.content)}</div>
          ${canDelete ? `<div class="post-actions"><button class="delete-btn">삭제</button></div>` : ''}
        </article>
      `;
    })
    .join('');

  root.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const article = e.target.closest('.post');
      const id = article.dataset.id;
      if (!confirm('삭제하시겠습니까?')) return;
      const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '삭제 실패');
        return;
      }
      await loadPosts();
    });
  });
}

async function loadPosts() {
  const root = $('#posts');
  root.innerHTML = '<p class="empty">불러오는 중...</p>';
  try {
    const res = await fetch('/api/posts', { cache: 'no-store' });
    const data = await res.json();
    renderPosts(data.posts || []);
  } catch (e) {
    root.innerHTML = '<p class="empty">불러오기에 실패했습니다.</p>';
  }
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      $('#login-form').classList.toggle('hidden', target !== 'login');
      $('#register-form').classList.toggle('hidden', target !== 'register');
    });
  });
}

function setupAuthForms() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = $('#login-error');
    errEl.textContent = '';
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errEl.textContent = data.error || '로그인 실패';
      return;
    }
    setAuth(data.token, data.username);
    e.target.reset();
    await verifyExistingToken();
    renderAuth();
    await loadPosts();
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = $('#register-error');
    errEl.textContent = '';
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errEl.textContent = data.error || '회원가입 실패';
      return;
    }
    setAuth(data.token, data.username);
    e.target.reset();
    await verifyExistingToken();
    renderAuth();
    await loadPosts();
  });
}

function setupWriteForm() {
  $('#new-post-btn').addEventListener('click', () => {
    $('#write-panel').classList.remove('hidden');
    $('#post-form').querySelector('input[name="title"]').focus();
  });

  $('#cancel-write').addEventListener('click', () => {
    $('#write-panel').classList.add('hidden');
    $('#post-form').reset();
    $('#post-error').textContent = '';
  });

  $('#post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = $('#post-error');
    errEl.textContent = '';
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        title: fd.get('title'),
        content: fd.get('content'),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errEl.textContent = data.error || '등록 실패';
      return;
    }
    e.target.reset();
    $('#write-panel').classList.add('hidden');
    await loadPosts();
  });

  $('#refresh-btn').addEventListener('click', loadPosts);
}

async function verifyExistingToken() {
  if (!state.token) return;
  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!res.ok) {
    setAuth(null, null);
    return;
  }
  const me = await res.json();
  state.isAdmin = !!me.isAdmin;
}

async function main() {
  setupTabs();
  setupAuthForms();
  setupWriteForm();
  await verifyExistingToken();
  renderAuth();
  await loadPosts();
}

main();

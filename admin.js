const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUsername';

const $ = (sel) => document.querySelector(sel);

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  username: localStorage.getItem(USER_KEY),
};

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

function renderAuthArea(extra) {
  const area = $('#auth-area');
  area.innerHTML = `
    ${state.username ? `<span class="username">${escapeHtml(state.username)}</span>` : ''}
    ${extra || ''}
    <a href="/board.html">게시판</a>
    <a href="/">달력</a>
    ${state.token ? `<button id="logout-btn">로그아웃</button>` : ''}
  `;
  const lo = document.getElementById('logout-btn');
  if (lo) {
    lo.addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      location.href = '/board.html';
    });
  }
}

function showGate(msg, withLink) {
  $('#gate').classList.remove('hidden');
  $('#panel').classList.add('hidden');
  $('#gate-msg').innerHTML = `${escapeHtml(msg)}${withLink ? ` <a href="/board.html">로그인하러 가기</a>` : ''}`;
}

async function loadUsers() {
  const tbody = $('#user-rows');
  tbody.innerHTML = '<tr><td colspan="3" class="empty">불러오는 중...</td></tr>';
  const res = await fetch('/api/admin/users', {
    headers: { Authorization: `Bearer ${state.token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    tbody.innerHTML = `<tr><td colspan="3" class="empty">${escapeHtml(data.error || '불러오기 실패')}</td></tr>`;
    return;
  }
  const { users } = await res.json();
  $('#user-count').textContent = users.length;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">등록된 회원이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = users
    .map((u) => {
      const isMe = u.username.toLowerCase() === state.username.toLowerCase();
      return `
        <tr data-username="${escapeHtml(u.username)}">
          <td>${escapeHtml(u.username)}${isMe ? '<span class="badge">나</span>' : ''}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td><button class="delete-user" ${isMe ? 'disabled title="자신은 삭제할 수 없습니다"' : ''}>삭제</button></td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.delete-user:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const target = tr.dataset.username;
      if (!confirm(`'${target}' 사용자를 삭제하시겠습니까?\n작성한 글도 모두 삭제됩니다.`)) return;
      btn.disabled = true;
      const r = await fetch(`/api/admin/users?username=${encodeURIComponent(target)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${state.token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || '삭제 실패');
        btn.disabled = false;
        return;
      }
      alert(`삭제됨 (글 ${data.postsRemoved}개 함께 삭제)`);
      await loadUsers();
    });
  });
}

async function main() {
  if (!state.token) {
    renderAuthArea();
    showGate('로그인이 필요합니다.', true);
    return;
  }

  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.token = null;
    state.username = null;
    renderAuthArea();
    showGate('세션이 만료되었습니다.', true);
    return;
  }
  const me = await res.json();
  state.username = me.username;
  if (!me.isAdmin) {
    renderAuthArea();
    showGate('관리자 권한이 없습니다.');
    return;
  }

  renderAuthArea();
  $('#gate').classList.add('hidden');
  $('#panel').classList.remove('hidden');
  $('#refresh-btn').addEventListener('click', loadUsers);
  await loadUsers();
}

main();

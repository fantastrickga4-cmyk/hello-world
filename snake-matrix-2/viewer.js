// PC 운영자 대시보드 — /api/state를 2초마다 폴링해서 화면 갱신.
// 태블릿이 푸시한 history / progress / timer 상태를 보여줌.

const POLL_MS = 2000;
const STALE_MS = 60_000;  // 60초 동안 갱신 없으면 stale 표시

// SCENARIO 데이터를 viewer에서도 참조 (코드 → 응답 매핑 보여주기 위해)
let SCENARIO_INDEX = null;
async function loadScenarioIndex() {
  try {
    // scenario.js를 fetch해서 SCENARIO 객체를 추출 — 비공식 방법이지만 원본 그대로 동작
    const res = await fetch("./scenario.js?t=" + Date.now());
    const code = await res.text();
    // SCENARIO 객체를 평가
    const fn = new Function(code + "; return SCENARIO;");
    SCENARIO_INDEX = fn();
  } catch (e) {
    console.warn("scenario load 실패:", e);
    SCENARIO_INDEX = { codes: {} };
  }
}
loadScenarioIndex();

// ============ DOM 참조 ============
const elStatus = document.getElementById("status");
const elLastSync = document.getElementById("last-sync");
const elTimer = document.getElementById("timer-text");
const elTimerState = document.getElementById("timer-state");
const elProgressText = document.getElementById("progress-text");
const elProgressFill = document.getElementById("progress-fill");
const elLastCode = document.getElementById("last-code");
const elLastCodeTime = document.getElementById("last-code-time");
const elHintCount = document.getElementById("hint-count");
const elHintCountStatus = document.getElementById("hint-count-status");
const elMsgList = document.getElementById("msg-list");
const elMsgCount = document.getElementById("msg-count");

// ============ 상태 ============
let lastReceivedAt = 0;
let lastState = null;

function setStatus(label, cls) {
  elStatus.textContent = label;
  elStatus.className = "status-pill" + (cls ? " " + cls : "");
}

function fmtTime(ms) {
  if (ms == null) return "--:--:--";
  const isOver = ms < 0;
  const abs = Math.abs(ms);
  const total = Math.floor(abs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${isOver ? "-" : ""}${p(h)}:${p(m)}:${p(s)}`;
}

function fmtClock(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtAgo(ts) {
  if (!ts) return "--";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 2) return "방금";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// SCENARIO.transmissions 배열에서 코드에 매칭되는 메시지 찾기 → 한 줄 텍스트 반환
function lookupReplyText(code) {
  if (!SCENARIO_INDEX) return null;
  const norm = (s) => String(s || "").trim().toLowerCase();
  const target = norm(code);

  // 1) transmissions 배열 검색 (현재 시나리오 구조)
  if (Array.isArray(SCENARIO_INDEX.transmissions)) {
    const tx = SCENARIO_INDEX.transmissions.find((t) => norm(t.code) === target);
    if (tx) {
      if (Array.isArray(tx.lines) && tx.lines.length) return tx.lines.join(" ");
      if (typeof tx.text === "string") return tx.text;
    }
  }
  // 2) codes 객체 검색 (이전 구조 호환)
  if (SCENARIO_INDEX.codes) {
    for (const k of Object.keys(SCENARIO_INDEX.codes)) {
      if (norm(k) === target) {
        const tx = SCENARIO_INDEX.codes[k];
        if (tx && typeof tx.text === "string") return tx.text;
        if (tx && Array.isArray(tx.lines)) return tx.lines.join(" ");
      }
    }
  }
  return null;
}

// ============ 렌더링 ============
function render(state) {
  if (!state || state.empty) {
    elTimer.textContent = "--:--:--";
    elTimer.className = "";
    elTimerState.textContent = "데이터 없음";
    elProgressText.textContent = "0%";
    elProgressText.className = "";
    elProgressFill.style.width = "0%";
    elProgressFill.className = "progress-bar-fill";
    elLastCode.textContent = "— 입력 없음 —";
    elLastCode.className = "empty";
    elLastCodeTime.textContent = "";
    elHintCount.innerHTML = `0<span class="hint-count-unit">회</span>`;
    elHintCount.className = "";
    elHintCountStatus.textContent = "아직 미사용";
    elMsgList.innerHTML = `<li class="empty-msg">> 응답 없음</li>`;
    elMsgCount.textContent = "0건";
    return;
  }

  // 타이머
  const t = state.timer;
  if (t && typeof t.startTs === "number" && typeof t.durationMs === "number") {
    const remain = t.frozen
      ? (t.frozenMs || 0)
      : (t.durationMs - (Date.now() - t.startTs));
    elTimer.textContent = fmtTime(remain);
    elTimer.className = "";
    if (t.frozen) elTimer.classList.add("frozen", remain < 0 ? "alert" : "warn");
    else if (remain <= 0) elTimer.classList.add("alert");
    else if (remain < 5 * 60 * 1000) elTimer.classList.add("warn");
    elTimerState.textContent = t.frozen
      ? (remain < 0 ? "초과 동결됨 (cu next ep)" : "동결됨 (cu next ep)")
      : (remain <= 0 ? "초과 진행 중" : "진행 중");
  } else {
    elTimer.textContent = "--:--:--";
    elTimer.className = "";
    elTimerState.textContent = "대기 중 (play ep 미입력)";
  }

  // 진행률
  const pct = Math.max(0, Math.min(100, Number(state.progress) || 0));
  elProgressText.textContent = `${pct}%`;
  elProgressText.classList.toggle("done", pct >= 100);
  elProgressFill.style.width = pct + "%";
  elProgressFill.classList.toggle("done", pct >= 100);

  // 힌트 사용 횟수
  const hc = Math.max(0, Number(state.hintCount) || 0);
  elHintCount.innerHTML = `${hc}<span class="hint-count-unit">회</span>`;
  elHintCount.className = "";
  if (hc >= 5) elHintCount.classList.add("alert");
  else if (hc >= 3) elHintCount.classList.add("warn");
  elHintCountStatus.textContent = hc === 0 ? "아직 미사용" : `최근 ${hc}회 사용됨`;

  // 메시지 리스트 (최신이 위)
  const hist = Array.isArray(state.history) ? state.history : [];
  const lastOut = [...hist].reverse().find((m) => m.kind === "out");

  // LAST INPUT
  if (lastOut) {
    elLastCode.textContent = lastOut.text || "—";
    elLastCode.className = "";
    elLastCodeTime.textContent = `입력 시각: ${fmtClock(lastOut.ts)}`;
  } else {
    elLastCode.textContent = "— 입력 없음 —";
    elLastCode.className = "empty";
    elLastCodeTime.textContent = "";
  }

  // 마지막 응답 (in 메시지 중 최근 1건만 — 한 줄 표시)
  const inMsgs = hist.filter((m) => m.kind === "in");
  const lastIn = inMsgs.length > 0 ? inMsgs[inMsgs.length - 1] : null;
  elMsgCount.textContent = `${inMsgs.length}건`;
  if (!lastIn) {
    elMsgList.innerHTML = `<li class="empty-msg">> 응답 없음</li>`;
  } else {
    const text = lookupReplyText(lastIn.code) || "(메시지)";
    elMsgList.innerHTML = `<li title="${escapeHtml(text)}">
      <div class="msg-time">${fmtClock(lastIn.ts)} &middot; ${escapeHtml(lastIn.code)}</div>
      <div class="msg-body">${escapeHtml(text)}</div>
    </li>`;
  }
}

// ============ 폴링 ============
async function poll() {
  try {
    const r = await fetch("/api/state?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const state = await r.json();
    lastState = state;
    if (!state.empty) lastReceivedAt = state.serverTime || Date.now();
    render(state);
    refreshStatus();
  } catch (e) {
    setStatus("[DISCONNECTED]", "disconnected");
  }
}

function refreshStatus() {
  if (!lastReceivedAt) {
    setStatus("[NO DATA]", "disconnected");
    elLastSync.textContent = "데이터 없음";
    return;
  }
  const age = Date.now() - lastReceivedAt;
  if (age > STALE_MS) {
    setStatus("[STALE]", "stale");
  } else {
    setStatus("[CONNECTED]", "");
  }
  elLastSync.textContent = fmtAgo(lastReceivedAt);
}

// 1초마다 타이머/last-sync 표시 갱신 (폴링과 별개로)
setInterval(() => {
  if (lastState && !lastState.empty) {
    // 타이머만 다시 그리기 (서버 호출 없이 클라이언트 시간으로 카운트다운)
    const t = lastState.timer;
    if (t && typeof t.startTs === "number" && typeof t.durationMs === "number") {
      const remain = t.frozen
        ? (t.frozenMs || 0)
        : (t.durationMs - (Date.now() - t.startTs));
      elTimer.textContent = fmtTime(remain);
      elTimer.className = "";
      if (t.frozen) elTimer.classList.add("frozen", remain < 0 ? "alert" : "warn");
      else if (remain <= 0) elTimer.classList.add("alert");
      else if (remain < 5 * 60 * 1000) elTimer.classList.add("warn");
    }
  }
  refreshStatus();
}, 1000);

// 즉시 한 번 + 주기적 폴링
poll();
setInterval(poll, POLL_MS);

// ============ 타이머 편집 (운영자 override) ============
const elTimerEditBtn = document.getElementById("timer-edit-btn");
const elTimerEditForm = document.getElementById("timer-edit-form");
const elTimerCancelBtn = document.getElementById("timer-cancel-btn");
const elTimerMinutesInput = document.getElementById("timer-minutes-input");
const elTimerEditStatus = document.getElementById("timer-edit-status");

function computeRemainingMs() {
  if (!lastState) return null;
  const t = lastState.timer;
  if (!t || typeof t.startTs !== "number" || typeof t.durationMs !== "number") return null;
  return t.frozen
    ? Math.max(0, t.frozenMs || 0)
    : Math.max(0, t.durationMs - (Date.now() - t.startTs));
}

function showTimerEditStatus(text, isError) {
  elTimerEditStatus.textContent = text || "";
  elTimerEditStatus.classList.toggle("error", !!isError);
}

elTimerEditBtn.addEventListener("click", () => {
  elTimerEditBtn.classList.add("hidden");
  elTimerEditForm.classList.remove("hidden");
  // 현재 잔여 분으로 prefill (없으면 100분)
  const remain = computeRemainingMs();
  const minVal = remain !== null ? Math.ceil(remain / 60000) : 100;
  elTimerMinutesInput.value = String(minVal);
  showTimerEditStatus("");
  setTimeout(() => {
    elTimerMinutesInput.focus();
    elTimerMinutesInput.select();
  }, 30);
});

function closeTimerEdit() {
  elTimerEditForm.classList.add("hidden");
  elTimerEditBtn.classList.remove("hidden");
}

elTimerCancelBtn.addEventListener("click", () => {
  closeTimerEdit();
  showTimerEditStatus("");
});

elTimerEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const min = Number(elTimerMinutesInput.value);
  if (!Number.isFinite(min) || min < 0 || min > 1440) {
    showTimerEditStatus("[ 0 ~ 1440 분 사이로 입력하세요 ]", true);
    return;
  }
  showTimerEditStatus("[ 전송 중... ]", false);
  try {
    const r = await fetch("/api/timer-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: min }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error("HTTP " + r.status + (txt ? " " + txt.slice(0, 80) : ""));
    }
    showTimerEditStatus(`[ ${min}분 적용 → 플레이어 동기화 ~5초 내 ]`, false);
    setTimeout(() => {
      closeTimerEdit();
      showTimerEditStatus("");
    }, 5000);
  } catch (err) {
    showTimerEditStatus("[ 실패: " + (err.message || "unknown") + " ]", true);
  }
});

// ============ SW 업데이트 시 자동 reload ============
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

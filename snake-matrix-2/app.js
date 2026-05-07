// SNAKE — 메신저 스타일 플레이어 클라이언트
// scenario.js의 데이터를 그대로 사용 (../scenario.js, 터미널 버전과 공유)
// 동작: 코드 입력 → 본인 메시지 버블(파랑) → 본사 타이핑 인디케이터 → 본사 버블 1줄씩 등장 → 시각/코드 메타

const SCENARIO = window.SCENARIO || { transmissions: [] };

function normCode(s) { return (s || "").trim().toLowerCase(); }
const codeIndex = new Map();
SCENARIO.transmissions.forEach((tx, i) => codeIndex.set(normCode(tx.code), i));

// 페이지 타이틀
if (SCENARIO.title) {
  document.title = `${SCENARIO.title} — ${SCENARIO.defaultFrom || "Snake"}`;
  const nameEl = document.getElementById("contact-name");
  if (nameEl) nameEl.textContent = SCENARIO.defaultFrom || "Snake";
}

// ============ 상태 (localStorage) ============
const STORAGE_KEY = "snake-messenger-history-v1";
let history = loadHistory();
let lastTimeMs = 0;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
  pushState();
}

// ============ PC viewer 동기화 ============
// 상태 변할 때마다 /api/state로 POST. 실패는 무시 (오프라인이거나 viewer 없는 경우 정상).
let _pushStateTimer = null;
function pushState() {
  // 디바운스 — 짧은 시간에 여러 번 호출되면 마지막 한 번만 전송 (배터리/요청 절약)
  if (_pushStateTimer) clearTimeout(_pushStateTimer);
  _pushStateTimer = setTimeout(_doPushState, 350);
}
async function _doPushState() {
  try {
    if (!navigator.onLine) return;
    let timer = null;
    try {
      const raw = localStorage.getItem("snake-timer-state-v1");
      if (raw) timer = JSON.parse(raw);
    } catch {}
    const state = {
      history: history,
      progress: (typeof loadProgress === "function") ? loadProgress() : 0,
      timer: timer,
      hintCount: (typeof loadHintCount === "function") ? loadHintCount() : 0,
    };
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // 무시 — viewer 없거나 오프라인일 수 있음
  }
}
// 30초마다 heartbeat — 타이머 진행 중에도 viewer가 alive 표시할 수 있게
setInterval(pushState, 30000);

// ============ 사운드 (Matrix/SF 사이버펑크 톤) ============
let audioCtx = null;
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}

// 화이트 노이즈 버퍼 (1회 생성 후 재사용 — glitch/click 효과용)
let _noiseBuf = null;
function getNoiseBuf(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

// 공용: 짧은 피드백 딜레이 — SF 공간감(잔향)을 거의 무료로
// 반환된 노드에 source.connect(delay) 하면 wet 신호가 자동으로 destination으로 흘러감.
function makeDelay(ctx, time = 0.085, fb = 0.34, wet = 0.22) {
  const delay = ctx.createDelay(2);
  delay.delayTime.value = time;
  const fbGain = ctx.createGain();
  fbGain.gain.value = fb;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  delay.connect(fbGain).connect(delay);     // 자체 피드백 루프
  delay.connect(wetGain).connect(ctx.destination);
  return delay;
}

// 메시지 수신: 사이파이 듀얼 톤 — G4 → D5 두 음 + sub backbone + 딜레이
// (sound-samples/receive-C-dualtone 변형 적용)
function playReceive() {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime;
  const delay = makeDelay(ctx, 0.13, 0.35, 0.3);

  // 1. 낮은 톤 — G4 (392Hz)
  const lo = ctx.createOscillator();
  const loG = ctx.createGain();
  lo.type = "sine";
  lo.frequency.value = 392;
  loG.gain.setValueAtTime(0.0001, t0);
  loG.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005);
  loG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  lo.connect(loG);
  loG.connect(ctx.destination);
  loG.connect(delay);
  lo.start(t0); lo.stop(t0 + 0.18);

  // 2. 높은 톤 — D5 (587Hz), 120ms 후
  const hi = ctx.createOscillator();
  const hiG = ctx.createGain();
  hi.type = "sine";
  hi.frequency.value = 587;
  const tH = t0 + 0.12;
  hiG.gain.setValueAtTime(0.0001, tH);
  hiG.gain.exponentialRampToValueAtTime(0.18, tH + 0.005);
  hiG.gain.exponentialRampToValueAtTime(0.0001, tH + 0.19);
  hi.connect(hiG);
  hiG.connect(ctx.destination);
  hiG.connect(delay);
  hi.start(tH); hi.stop(tH + 0.21);

  // 3. Sub backbone — 65Hz ADSR (전체 0.5s를 깔아주는 저음 깔림)
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = "sine";
  sub.frequency.value = 65;
  // ADSR: attack 40ms → peak, decay 80ms → sustain, hold, release 150ms → 0
  const peak = 0.25, sus = 0.15, total = 0.5;
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.linearRampToValueAtTime(peak, t0 + 0.04);
  subG.gain.linearRampToValueAtTime(sus, t0 + 0.12);
  subG.gain.setValueAtTime(sus, t0 + total - 0.15);
  subG.gain.linearRampToValueAtTime(0.0001, t0 + total);
  sub.connect(subG).connect(ctx.destination);
  sub.start(t0); sub.stop(t0 + total + 0.05);
}

// 사용자 전송: 기계식 키보드 키프레스 — sub thunk + 짧은 click transient
// (sound-samples/send-06-mech 변형 적용)
function playSend() {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime;
  const delay = makeDelay(ctx, 0.04, 0.2, 0.15);

  // 1. Sub thunk (sine 140→60Hz, 짧고 묵직한 키캡 임팩트)
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(140, t0);
  sub.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.exponentialRampToValueAtTime(0.25, t0 + 0.001);
  subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
  sub.connect(subG);
  subG.connect(ctx.destination);
  subG.connect(delay);
  sub.start(t0); sub.stop(t0 + 0.15);

  // 2. Click transient (bandpass 3.5kHz 노이즈, 15ms — 키캡 타격감)
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuf(ctx);
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = 3500;
  nf.Q.value = 4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.18, t0 + 0.0005);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.014);
  noise.connect(nf).connect(ng);
  ng.connect(ctx.destination);
  ng.connect(delay);
  noise.start(t0); noise.stop(t0 + 0.02);
}

// EP CLEAR 팡파르 — 영화적 SF 리빌
// (sub-bass riser → 노이즈 buildup → 임팩트 → 디튠 신스 화음 with 딜레이)
function playEpClearFanfare() {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime;
  const delay = makeDelay(ctx, 0.18, 0.42, 0.28);

  // 1. Sub-bass riser (30→85Hz, 영화적 buildup — Inception BWAAAM 느낌)
  const riser = ctx.createOscillator();
  const riserG = ctx.createGain();
  riser.type = "sine";
  riser.frequency.setValueAtTime(30, t0);
  riser.frequency.exponentialRampToValueAtTime(85, t0 + 0.6);
  riserG.gain.setValueAtTime(0.0001, t0);
  riserG.gain.exponentialRampToValueAtTime(0.18, t0 + 0.5);
  riserG.gain.setValueAtTime(0.18, t0 + 0.62);
  riserG.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
  riser.connect(riserG).connect(ctx.destination);
  riser.start(t0); riser.stop(t0 + 1.5);

  // 2. 노이즈 buildup (highpass sweep — 우주 공간 정전기)
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuf(ctx);
  const nf = ctx.createBiquadFilter();
  nf.type = "highpass";
  nf.frequency.setValueAtTime(8000, t0);
  nf.frequency.exponentialRampToValueAtTime(2500, t0 + 0.6);
  nf.Q.value = 1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.045, t0 + 0.55);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.72);
  noise.connect(nf).connect(ng).connect(ctx.destination);
  noise.start(t0); noise.stop(t0 + 0.75);

  // 3. 임팩트 화음 — 영웅적 5도 쌓기 (E2 / E3 / B3 / E4), 디튠 saw 8개
  const padStart = t0 + 0.6;
  const chord = [82.41, 164.81, 246.94, 329.63];
  chord.forEach((freq) => {
    [-7, 7].forEach((detune) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, padStart);
      filter.frequency.exponentialRampToValueAtTime(3000, padStart + 0.3);
      filter.Q.value = 5;
      gain.gain.setValueAtTime(0.0001, padStart);
      gain.gain.exponentialRampToValueAtTime(0.018, padStart + 0.04);
      gain.gain.setValueAtTime(0.018, padStart + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, padStart + 1.8);
      osc.connect(filter).connect(gain);
      gain.connect(ctx.destination);
      gain.connect(delay);
      osc.start(padStart); osc.stop(padStart + 1.9);
    });
  });
}

// 코드 거부: 디스토피아 buzz — sub saw + 비팅 디튠 mid + 딜레이
// (블레이드 러너 ACCESS DENIED, 묵직한 거부감)
function playReject() {
  const ctx = ensureAudio(); if (!ctx) return;
  const t0 = ctx.currentTime;
  const delay = makeDelay(ctx, 0.06, 0.25, 0.16);

  // 1. Sub saw (85→55Hz, 묵직한 저음)
  const sub = ctx.createOscillator();
  const subF = ctx.createBiquadFilter();
  const subG = ctx.createGain();
  sub.type = "sawtooth";
  sub.frequency.setValueAtTime(85, t0);
  sub.frequency.exponentialRampToValueAtTime(55, t0 + 0.4);
  subF.type = "lowpass";
  subF.frequency.value = 380;
  subF.Q.value = 3;
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.exponentialRampToValueAtTime(0.13, t0 + 0.02);
  subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  sub.connect(subF).connect(subG).connect(ctx.destination);
  sub.start(t0); sub.stop(t0 + 0.55);

  // 2. 비팅 디튠 mid (불협 두 saw, 277Hz vs 285Hz — 거슬리는 비팅)
  [277, 285].forEach((f) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + 0.4);
    filter.type = "lowpass";
    filter.frequency.value = 850;
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.038, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    osc.connect(filter).connect(gain);
    gain.connect(ctx.destination);
    gain.connect(delay);
    osc.start(t0); osc.stop(t0 + 0.45);
  });
}

// ============ 렌더링 ============
const chatArea = document.getElementById("chat-area");
const chatEmpty = document.getElementById("chat-empty");

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function timeStr(d) {
  const p = (n) => String(n).padStart(2, "0");
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${p(h12)}:${p(d.getMinutes())}`;
}
function fullTimeStr(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${timeStr(d)}`;
}
function clearEmpty() {
  if (chatEmpty && chatEmpty.parentElement === chatArea) chatEmpty.remove();
}
function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}
function maybeAddTimeDivider(now) {
  // 5분 이상 간격이거나 첫 메시지면 시간 헤더 삽입
  if (now - lastTimeMs > 5 * 60 * 1000) {
    const div = document.createElement("div");
    div.className = "time-divider";
    div.textContent = fullTimeStr(new Date(now));
    chatArea.appendChild(div);
  }
  lastTimeMs = now;
}

// 사용자 보낸 (오른쪽) 버블
function appendOutgoing(code, ts) {
  clearEmpty();
  maybeAddTimeDivider(ts);
  const group = document.createElement("div");
  group.className = "bubble-group outgoing";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = code;
  group.appendChild(bubble);
  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.innerHTML = `<span>${escapeHtml(timeStr(new Date(ts)))}</span>`;
  group.appendChild(meta);
  chatArea.appendChild(group);
  scrollToBottom();
}

// 시스템 메시지 (오류·안내)
function appendSystemMsg(text) {
  clearEmpty();
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  chatArea.appendChild(div);
  scrollToBottom();
}

// 본사 타이핑 인디케이터
function showTyping() {
  const t = document.createElement("div");
  t.className = "typing";
  t.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
  chatArea.appendChild(t);
  scrollToBottom();
  return t;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 본사 메시지 등장 — 라인별로 typing → bubble → 다음 라인...
async function showIncomingTransmission(tx, ts) {
  clearEmpty();
  maybeAddTimeDivider(ts);

  const group = document.createElement("div");
  group.className = "bubble-group";
  chatArea.appendChild(group);

  for (let i = 0; i < tx.lines.length; i++) {
    // typing indicator
    const typing = showTyping();
    const typingDelay = Math.max(280, Math.min(700, tx.lines[i].length * 12));
    await sleep(typingDelay);
    typing.remove();

    // bubble
    const b = document.createElement("div");
    b.className = "bubble";
    b.textContent = tx.lines[i];
    group.appendChild(b);
    playReceive();
    scrollToBottom();

    if (i < tx.lines.length - 1) await sleep(180 + Math.random() * 160);
  }

  // 이미지 첨부 (마지막 라인 다음에 별도 버블로)
  if (tx.image) {
    const typing = showTyping();
    await sleep(420);
    typing.remove();
    appendImageBubble(tx.image, group);
    playReceive();
    scrollToBottom();
  }

  // group meta (마지막 시각·코드 표시)
  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.innerHTML = `
    <span>${escapeHtml(timeStr(new Date()))}</span>
    <span class="meta-code">CODE: ${escapeHtml(tx.code)}</span>
  `;
  group.appendChild(meta);
  scrollToBottom();
}

// 즉시 출력 (replay용, 애니메이션 없음)
function appendIncomingInstant(tx, ts) {
  clearEmpty();
  maybeAddTimeDivider(ts);
  const group = document.createElement("div");
  group.className = "bubble-group";
  for (const line of tx.lines) {
    const b = document.createElement("div");
    b.className = "bubble";
    b.textContent = line;
    group.appendChild(b);
  }
  if (tx.image) appendImageBubble(tx.image, group);
  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.innerHTML = `
    <span>${escapeHtml(timeStr(new Date(ts)))}</span>
    <span class="meta-code">CODE: ${escapeHtml(tx.code)}</span>
  `;
  group.appendChild(meta);
  chatArea.appendChild(group);
}

// ============ 카운트다운 타이머 ============
const TIMER_DURATION_MS = 100 * 60 * 1000;   // 1시간 40분
const TIMER_TRIGGER_CODE = "play ep";
let timerInterval = null;
let timerEndedFired = false;

function startTimerDisplay() {
  if (timerInterval) return;
  document.getElementById("timer-bar").classList.remove("hidden");
  document.getElementById("progress-bar").classList.remove("hidden");
  renderProgress();   // 현재 저장된 진행률로 즉시 표시
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  const ms = SnakeTimer.getRemainingMs();
  const bar = document.getElementById("timer-bar");
  const pBar = document.getElementById("progress-bar");
  if (ms === null) {
    bar.classList.add("hidden");
    pBar.classList.add("hidden");
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    return;
  }
  renderTimerText(ms, bar);
  if (ms <= 0 && !timerEndedFired) {
    timerEndedFired = true;
    playTimerEndAlarm();
  }
  // 동결 상태면 더 이상 갱신할 필요 없음 — 인터벌 중지
  if (SnakeTimer.isFrozen() && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function renderTimerText(ms, bar) {
  const isOver = ms < 0;
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const p = (n) => String(n).padStart(2, "0");
  document.getElementById("timer-text").textContent = `${isOver ? "-" : ""}${p(hh)}:${p(mm)}:${p(ss)}`;
  bar.classList.toggle("warn",     ms <= 10 * 60 * 1000 && ms > 5 * 60 * 1000);
  bar.classList.toggle("alert",    ms <= 5  * 60 * 1000 && ms > 60 * 1000);
  bar.classList.toggle("critical", ms <= 60 * 1000     && ms > 0);
  bar.classList.toggle("done",     ms <= 0);                     // 0 도달 + 초과시간 모두 빨간 UI 유지
}

// ============ 이미지 첨부 (썸네일 + 확대 오버레이) ============
function appendImageBubble(src, group) {
  const bubble = document.createElement("div");
  bubble.className = "bubble bubble-image";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.className = "msg-image";
  img.loading = "lazy";
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    openImageOverlay(src);
  });
  bubble.appendChild(img);
  group.appendChild(bubble);
}

function openImageOverlay(src) {
  const overlay = document.getElementById("image-overlay");
  const img = document.getElementById("image-overlay-img");
  if (!overlay || !img) return;
  img.src = src;
  overlay.classList.remove("hidden");
}
function closeImageOverlay() {
  const overlay = document.getElementById("image-overlay");
  if (overlay) overlay.classList.add("hidden");
}
document.getElementById("image-overlay").addEventListener("click", closeImageOverlay);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const overlay = document.getElementById("image-overlay");
  if (overlay && !overlay.classList.contains("hidden")) closeImageOverlay();
});

// ============ EP1 CLEAR 오버레이 ============
function showEpClearOverlay() {
  const overlay = document.getElementById("ep-clear-overlay");
  if (overlay) overlay.classList.remove("hidden");
}
function hideEpClearOverlay() {
  const overlay = document.getElementById("ep-clear-overlay");
  if (overlay) overlay.classList.add("hidden");
}

// ============ 진행률 (코드 기반) ============
const PROGRESS_KEY = "snake-messenger-progress-v1";

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  } catch { return 0; }
}
function saveProgress(pct) {
  try { localStorage.setItem(PROGRESS_KEY, String(pct)); } catch {}
  pushState();
}
function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch {}
  pushState();
}

// 새 코드의 진행률이 현재 저장된 값보다 높을 때만 갱신 (역행 방지)
function bumpProgress(newPct) {
  if (typeof newPct !== "number") return;
  const cur = loadProgress();
  if (newPct > cur) {
    saveProgress(newPct);
  }
  renderProgress();
}

function renderProgress() {
  const pBar = document.getElementById("progress-bar");
  const txt = document.getElementById("progress-text");
  if (!pBar || !txt) return;
  const pct = loadProgress();
  txt.textContent = `${pct}%`;
  // 100% 도달 시 시각적 강조 (그 외엔 기본 색상)
  pBar.classList.toggle("done", pct >= 100);
}

// 타이머 종료 알람 — 사이파이 클락슨 (pitch bend saw + sub thump + 딜레이)
// (Half-Life 베이스 알람 / Hunter Killer 도주 톤)
function playTimerEndAlarm() {
  const ctx = ensureAudio(); if (!ctx) return;
  const delay = makeDelay(ctx, 0.1, 0.3, 0.18);
  for (let i = 0; i < 3; i++) {
    const t0 = ctx.currentTime + i * 0.45;

    // 메인 톤 — saw, pitch bend (440 → 680 → 280Hz, 클락슨 swing)
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, t0);
    osc.frequency.linearRampToValueAtTime(680, t0 + 0.13);
    osc.frequency.linearRampToValueAtTime(280, t0 + 0.28);
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    osc.connect(filter).connect(gain);
    gain.connect(ctx.destination);
    gain.connect(delay);
    osc.start(t0); osc.stop(t0 + 0.34);

    // Sub thump (각 펄스마다 묵직한 저음 임팩트)
    const sub = ctx.createOscillator();
    const subG = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, t0);
    sub.frequency.exponentialRampToValueAtTime(45, t0 + 0.15);
    subG.gain.setValueAtTime(0.0001, t0);
    subG.gain.exponentialRampToValueAtTime(0.1, t0 + 0.005);
    subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    sub.connect(subG).connect(ctx.destination);
    sub.start(t0); sub.stop(t0 + 0.2);
  }
}

// ============ 힌트 사용 횟수 ============
const HINT_COUNT_KEY = "snake-hint-count-v1";
function loadHintCount() {
  try {
    const n = parseInt(localStorage.getItem(HINT_COUNT_KEY), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}
function saveHintCount(n) {
  try { localStorage.setItem(HINT_COUNT_KEY, String(n)); } catch {}
  pushState();
}
function clearHintCount() {
  try { localStorage.removeItem(HINT_COUNT_KEY); } catch {}
  pushState();
}
function renderHintCount() {
  const el = document.getElementById("hint-count-num");
  if (el) el.textContent = String(loadHintCount());
}
function bumpHintCount() {
  const n = loadHintCount() + 1;
  saveHintCount(n);
  renderHintCount();
}

// ============ 힌트 팝업 ============
function openHintModal() {
  const modal = document.getElementById("hint-modal");
  document.getElementById("hint-form").reset();
  document.getElementById("hint-result").classList.add("hidden");
  resetHintAnswerToggle();
  renderHintCount();
  modal.classList.remove("hidden");
  setTimeout(() => {
    const inp = document.getElementById("hint-input");
    if (inp) inp.focus();
  }, 30);
}
function closeHintModal() {
  document.getElementById("hint-modal").classList.add("hidden");
  const codeInput = document.getElementById("code-input");
  if (codeInput) codeInput.focus();
}
function lookupHint(code) {
  const hints = (SCENARIO && SCENARIO.hints) || {};
  const key = (code || "").trim().toLowerCase();
  return hints[key] || hints[code.trim()] || null;
}
function resetHintAnswerToggle() {
  const wrap = document.getElementById("hint-answer-wrap");
  const box = document.getElementById("hint-answer-box");
  const btn = document.getElementById("hint-answer-toggle");
  if (wrap) wrap.classList.add("hidden");
  if (box) box.classList.add("hidden");
  if (btn) btn.textContent = "> REVEAL ANSWER";
}
document.getElementById("hint-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = document.getElementById("hint-input").value;
  if (!raw.trim()) return;
  const result = document.getElementById("hint-result");
  const text = document.getElementById("hint-text");
  const label = result.querySelector(".hint-result-label");
  const found = lookupHint(raw);
  resetHintAnswerToggle();
  if (found) {
    // 신/구 형식 모두 지원: 객체면 {hint, answer}, 문자열이면 그대로 hint
    const hintText = typeof found === "string" ? found : (found.hint || "");
    const answerText = (typeof found === "object" && found.answer) ? found.answer : "";
    text.textContent = hintText;
    text.classList.remove("hint-not-found");
    if (label) label.textContent = "> HINT";
    bumpHintCount();
    if (answerText) {
      const wrap = document.getElementById("hint-answer-wrap");
      const ans = document.getElementById("hint-answer-text");
      if (wrap && ans) {
        ans.textContent = answerText;
        wrap.classList.remove("hidden");
      }
    }
  } else {
    const fallback = (SCENARIO && SCENARIO.hintNotFoundMsg) || "해당 힌트 코드를 찾을 수 없습니다.";
    text.textContent = fallback;
    text.classList.add("hint-not-found");
    if (label) label.textContent = "> NOTICE";
  }
  result.classList.remove("hidden");
  // 결과가 길어도 상단부터 보이도록 카드 자체 스크롤을 위로
  const card = result.closest(".hint-card");
  if (card) card.scrollTop = 0;
});
document.getElementById("hint-answer-toggle").addEventListener("click", () => {
  const box = document.getElementById("hint-answer-box");
  const btn = document.getElementById("hint-answer-toggle");
  if (!box || !btn) return;
  const opening = box.classList.contains("hidden");
  box.classList.toggle("hidden");
  btn.textContent = opening ? "> HIDE ANSWER" : "> REVEAL ANSWER";
});
document.getElementById("hint-close").addEventListener("click", closeHintModal);
document.getElementById("hint-modal").addEventListener("click", (e) => {
  if (e.target.id === "hint-modal") closeHintModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const m = document.getElementById("hint-modal");
  if (m && !m.classList.contains("hidden")) closeHintModal();
});

// ============ 경고 팝업 (커스텀 모달) ============
function showWarning(message) {
  const modal = document.getElementById("alert-modal");
  const msg = document.getElementById("alert-message");
  msg.textContent = message;
  modal.classList.remove("hidden");
  // 살짝 경고음 (선택) — 기존 reject 톤 재사용
  try { playReject(); } catch {}
  // 확인 버튼에 포커스 (Enter로 닫기)
  setTimeout(() => {
    const btn = document.getElementById("alert-confirm");
    if (btn) btn.focus();
  }, 30);
}
function closeWarning() {
  const modal = document.getElementById("alert-modal");
  modal.classList.add("hidden");
  // 입력란으로 포커스 되돌리기
  const input = document.getElementById("code-input");
  if (input) input.focus();
}
document.getElementById("alert-confirm").addEventListener("click", closeWarning);
document.getElementById("alert-modal").addEventListener("click", (e) => {
  // 카드 바깥 (배경) 클릭 시 닫기
  if (e.target.id === "alert-modal") closeWarning();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("alert-modal");
  if (modal && !modal.classList.contains("hidden")) closeWarning();
});

// ============ 입력 처리 ============
const form = document.getElementById("code-form");
const input = document.getElementById("code-input");
const errorMsg = document.getElementById("error-msg");

const RESET_CODE = "fan1102";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) return;

  // 특수 초기화 코드 — 입력 즉시 전체 초기화 (히스토리·타이머·UI 전부)
  if (normCode(raw) === RESET_CODE) {
    input.value = "";
    errorMsg.textContent = "";
    resetAll();
    return;
  }

  // 힌트 트리거 — 코드 입력 팝업 띄움 (메시지·버블 만들지 않음)
  if (normCode(raw) === "힌트") {
    input.value = "";
    errorMsg.textContent = "";
    openHintModal();
    return;
  }

  // 선결 조건: bar lust 는 play ep 로 타이머가 시작된 후에만 동작
  // (play ep 미입력 상태에서 bar lust 시도 시 경고 팝업 후 무시)
  if (normCode(raw) === "bar lust" && !SnakeTimer.isActive()) {
    input.value = "";
    errorMsg.textContent = "";
    showWarning("노트북 모니터의 snake코드를\n\n먼저 입력해주세요");
    return;
  }

  const ts = Date.now();
  appendOutgoing(raw, ts);
  history.push({ kind: "out", text: raw, ts });
  saveHistory();
  playSend();
  input.value = "";
  errorMsg.textContent = "";

  await sleep(180);  // 보낸 직후 잠깐 텀

  const idx = codeIndex.get(normCode(raw));
  if (idx == null) {
    appendSystemMsg("응답 없음 · 알 수 없는 코드입니다");
    history.push({ kind: "sys", text: "응답 없음 · 알 수 없는 코드입니다", ts: Date.now() });
    saveHistory();
    playReject();
    errorMsg.textContent = "→ 코드를 다시 확인해주세요";
    setTimeout(() => { if (errorMsg.textContent.includes("다시 확인")) errorMsg.textContent = ""; }, 4000);
    return;
  }
  const tx = SCENARIO.transmissions[idx];
  // play ep 입력 시 카운트다운 시작 (이미 실행 중이면 무시)
  if (normCode(tx.code) === TIMER_TRIGGER_CODE) {
    if (SnakeTimer.start(TIMER_DURATION_MS)) {
      timerEndedFired = false;
      startTimerDisplay();
      pushState();
    }
  }
  // cu next ep — 특수 처리: 메시지 X, 화면 중앙에 EP1 CLEAR 오버레이
  if (normCode(tx.code) === "cu next ep") {
    SnakeTimer.freeze();
    pushState();
    updateTimerDisplay();
    bumpProgress(100);
    showEpClearOverlay();
    playEpClearFanfare();
    history.push({ kind: "in", code: tx.code, ts: Date.now() });
    saveHistory();
    return;
  }
  // 진행률 갱신 (해당 코드에 progressPercent 가 정의된 경우만)
  if (typeof tx.progressPercent === "number") {
    bumpProgress(tx.progressPercent);
  }
  await showIncomingTransmission(tx, Date.now());
  history.push({ kind: "in", code: tx.code, ts: Date.now() });
  saveHistory();
});

// ============ 페이지 로드 시 히스토리 재현 ============
function replayHistory() {
  if (history.length === 0) return;
  clearEmpty();
  for (const h of history) {
    if (h.kind === "out") {
      appendOutgoing(h.text, h.ts);
    } else if (h.kind === "sys") {
      const div = document.createElement("div");
      div.className = "system-msg";
      div.textContent = h.text;
      chatArea.appendChild(div);
    } else if (h.kind === "in") {
      // cu next ep는 메시지 대신 오버레이로 처리되므로 버블 렌더링 스킵
      if (normCode(h.code) === "cu next ep") continue;
      const tx = SCENARIO.transmissions[codeIndex.get(normCode(h.code))];
      if (tx) appendIncomingInstant(tx, h.ts);
    }
  }
  scrollToBottom();
}

// ============ 전체 초기화 (관리자 트리거 + 특수 코드 fan1102 공통 사용) ============
function resetAll() {
  history = [];
  lastTimeMs = 0;
  saveHistory();
  SnakeTimer.clear();
  clearProgress();
  clearHintCount();
  hideEpClearOverlay();
  timerEndedFired = false;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.getElementById("timer-bar").classList.add("hidden");
  document.getElementById("progress-bar").classList.add("hidden");
  // 오버레이는 chat-area 외부(wrapper 자식)이므로 innerHTML 재설정에 영향 없음
  chatArea.innerHTML = `
    <div class="chat-empty" id="chat-empty">
      <div class="snake-icon" aria-hidden="true">
        <svg viewBox="-60 -60 120 120" xmlns="http://www.w3.org/2000/svg">
          <g class="aura-ring">
            <circle cx="0" cy="0" r="55" fill="none" stroke="currentColor"
                    stroke-width="0.4" stroke-dasharray="0.6 4" opacity="0.45"/>
            <circle cx="0" cy="0" r="49" fill="none" stroke="currentColor"
                    stroke-width="0.3" opacity="0.18"/>
          </g>
          <g class="ouroboros">
            <path d="M 7 -37 A 38 38 0 1 1 -7 -37"
                  fill="none" stroke="currentColor" stroke-width="8"
                  stroke-linecap="round"/>
            <path d="M 7 -37 A 38 38 0 1 1 -7 -37"
                  fill="none" stroke="#001a07" stroke-width="2.2"
                  stroke-dasharray="1 4.5" opacity="0.55"/>
            <g class="snake-head">
              <ellipse cx="7" cy="-37" rx="11" ry="9" fill="currentColor"/>
              <path d="M 0 -41 L -13 -37 L 0 -33 Z" fill="currentColor"/>
              <path d="M -4 -39 Q -10 -37, -4 -35 Z" fill="#001a07" opacity="0.6"/>
              <circle cx="5" cy="-39.5" r="2" fill="#001a07"/>
              <circle cx="5" cy="-39.5" r="0.7" fill="#bcffce" opacity="0.9"/>
              <path d="M 9 -42 L 11 -39 L 13 -42"
                    fill="none" stroke="#001a07" stroke-width="0.7" opacity="0.6"/>
            </g>
            <circle cx="-7" cy="-37" r="2.5" fill="currentColor"/>
          </g>
          <g class="inner-eye">
            <ellipse cx="0" cy="0" rx="15" ry="7.5" fill="none"
                     stroke="currentColor" stroke-width="1.1"/>
            <circle cx="0" cy="0" r="5" fill="currentColor"/>
            <circle cx="0" cy="0" r="1.4" fill="#001a07"/>
          </g>
        </svg>
      </div>
      <p>[ END-TO-END ENCRYPTED ]</p>
      <p class="muted">&gt; AWAITING ACCESS CODE...</p>
    </div>
  `;
  input.focus();
}

// ============ 입력창 왼쪽 힌트 버튼 ============
const hintBtn = document.getElementById("hint-btn");
if (hintBtn) {
  hintBtn.addEventListener("click", () => {
    openHintModal();
  });
}

// ============ 메모(낙서) 팝업 ============
const MEMO_KEY = "snake-matrix-memo-v1";
const memoState = {
  tool: "pen",          // "pen" | "eraser"
  color: "#00ff52",
  penWidth: 3,
  eraserWidth: 28,
  drawing: false,
  lastX: 0,
  lastY: 0,
  ctx: null,
  canvas: null,
  saveTimer: null,
};

function openMemoModal() {
  const modal = document.getElementById("memo-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  // 모달이 표시된 후 캔버스 크기 측정 가능 — 다음 프레임에 초기화
  requestAnimationFrame(() => initMemoCanvas());
}
function closeMemoModal() {
  const modal = document.getElementById("memo-modal");
  if (modal) modal.classList.add("hidden");
}

function initMemoCanvas() {
  const canvas = document.getElementById("memo-canvas");
  const wrap = canvas && canvas.parentElement;
  if (!canvas || !wrap) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  // 처음 열거나 크기 바뀌었으면 재설정 (기존 그림 유지를 위해 일단 뽑아두기)
  const prev = (canvas.width && canvas.height)
    ? canvas.toDataURL("image/png")
    : null;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 배경 — 약간 어두운 매트릭스 톤 (투명 X — 지우개 처리 단순화)
  ctx.fillStyle = "#02110a";
  ctx.fillRect(0, 0, cssW, cssH);
  memoState.canvas = canvas;
  memoState.ctx = ctx;
  // 우선 prev(현재 세션 그림)가 있으면 그걸로 복원, 없으면 localStorage에서 복원
  const restoreSrc = prev || loadMemoData();
  if (restoreSrc) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, cssW, cssH);
    img.src = restoreSrc;
  }
}

function loadMemoData() {
  try { return localStorage.getItem(MEMO_KEY) || null; } catch { return null; }
}
function saveMemoData() {
  if (!memoState.canvas) return;
  if (memoState.saveTimer) clearTimeout(memoState.saveTimer);
  memoState.saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(MEMO_KEY, memoState.canvas.toDataURL("image/png"));
    } catch {}
  }, 250);
}
function clearMemoData() {
  try { localStorage.removeItem(MEMO_KEY); } catch {}
}

function getMemoPos(e) {
  const rect = memoState.canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: point.clientX - rect.left,
    y: point.clientY - rect.top,
  };
}

function memoStrokeBegin(e) {
  if (!memoState.ctx) return;
  e.preventDefault();
  memoState.drawing = true;
  const { x, y } = getMemoPos(e);
  memoState.lastX = x;
  memoState.lastY = y;
  // 점 하나 찍기 (탭만 해도 점이 남도록)
  applyMemoStrokeStyle();
  memoState.ctx.beginPath();
  memoState.ctx.arc(x, y, currentBrushWidth() / 2, 0, Math.PI * 2);
  memoState.ctx.fillStyle = currentStrokeColor();
  if (memoState.tool === "eraser") {
    memoState.ctx.globalCompositeOperation = "source-over";
    memoState.ctx.fillStyle = "#02110a";
  } else {
    memoState.ctx.globalCompositeOperation = "source-over";
  }
  memoState.ctx.fill();
}
function memoStrokeMove(e) {
  if (!memoState.drawing || !memoState.ctx) return;
  e.preventDefault();
  const { x, y } = getMemoPos(e);
  applyMemoStrokeStyle();
  memoState.ctx.beginPath();
  memoState.ctx.moveTo(memoState.lastX, memoState.lastY);
  memoState.ctx.lineTo(x, y);
  memoState.ctx.stroke();
  memoState.lastX = x;
  memoState.lastY = y;
}
function memoStrokeEnd() {
  if (!memoState.drawing) return;
  memoState.drawing = false;
  saveMemoData();
}

function applyMemoStrokeStyle() {
  const ctx = memoState.ctx;
  ctx.lineWidth = currentBrushWidth();
  if (memoState.tool === "eraser") {
    ctx.strokeStyle = "#02110a";   // 배경색으로 덮기
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.strokeStyle = memoState.color;
    ctx.globalCompositeOperation = "source-over";
  }
}
function currentBrushWidth() {
  return memoState.tool === "eraser" ? memoState.eraserWidth : memoState.penWidth;
}
function currentStrokeColor() {
  return memoState.tool === "eraser" ? "#02110a" : memoState.color;
}

function memoClearAll() {
  if (!memoState.ctx || !memoState.canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = memoState.canvas.width / dpr;
  const h = memoState.canvas.height / dpr;
  memoState.ctx.fillStyle = "#02110a";
  memoState.ctx.fillRect(0, 0, w, h);
  clearMemoData();
}

// 메모 버튼 / 모달 이벤트
const memoBtn = document.getElementById("memo-btn");
if (memoBtn) memoBtn.addEventListener("click", openMemoModal);
const memoCloseBtn = document.getElementById("memo-close");
if (memoCloseBtn) memoCloseBtn.addEventListener("click", closeMemoModal);
const memoClearBtn = document.getElementById("memo-clear");
if (memoClearBtn) memoClearBtn.addEventListener("click", memoClearAll);

// 도구 토글 (PEN / ERASE)
document.querySelectorAll(".memo-tool").forEach((btn) => {
  btn.addEventListener("click", () => {
    memoState.tool = btn.dataset.tool;
    document.querySelectorAll(".memo-tool").forEach((b) => b.classList.toggle("active", b === btn));
  });
});
// 색상 선택 (자동으로 PEN 모드로 전환)
document.querySelectorAll(".memo-color").forEach((btn) => {
  btn.addEventListener("click", () => {
    memoState.color = btn.dataset.color;
    memoState.tool = "pen";
    document.querySelectorAll(".memo-color").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".memo-tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === "pen"));
  });
});

// 캔버스 드로잉 — pointer events (마우스 + 터치 통합)
const memoCanvasEl = document.getElementById("memo-canvas");
if (memoCanvasEl) {
  memoCanvasEl.addEventListener("pointerdown", (e) => {
    memoCanvasEl.setPointerCapture(e.pointerId);
    memoStrokeBegin(e);
  });
  memoCanvasEl.addEventListener("pointermove", memoStrokeMove);
  memoCanvasEl.addEventListener("pointerup", memoStrokeEnd);
  memoCanvasEl.addEventListener("pointercancel", memoStrokeEnd);
  memoCanvasEl.addEventListener("pointerleave", memoStrokeEnd);
}

// 모달 배경 클릭 시 닫기 + ESC로 닫기
document.getElementById("memo-modal").addEventListener("click", (e) => {
  if (e.target.id === "memo-modal") closeMemoModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const m = document.getElementById("memo-modal");
  if (m && !m.classList.contains("hidden")) closeMemoModal();
});

// 윈도우 리사이즈/회전 시 캔버스 재배치 (모달이 열려있을 때만)
window.addEventListener("resize", () => {
  const m = document.getElementById("memo-modal");
  if (m && !m.classList.contains("hidden")) initMemoCanvas();
});

// ============ 관리자 트리거 (좌측 하단 3초 길게 누름) ============
const adminBtn = document.getElementById("admin-trigger");
let adminTimer = null;
function startAdminHold() {
  if (adminTimer) return;
  adminTimer = setTimeout(() => {
    if (confirm("정말 모든 대화 기록을 초기화하시겠습니까? (타이머도 함께)")) {
      resetAll();
    }
    adminTimer = null;
  }, 3000);
}
function cancelAdminHold() {
  if (adminTimer) { clearTimeout(adminTimer); adminTimer = null; }
}
adminBtn.addEventListener("mousedown", startAdminHold);
adminBtn.addEventListener("touchstart", startAdminHold, { passive: true });
adminBtn.addEventListener("mouseup", cancelAdminHold);
adminBtn.addEventListener("mouseleave", cancelAdminHold);
adminBtn.addEventListener("touchend", cancelAdminHold);
adminBtn.addEventListener("touchcancel", cancelAdminHold);

// ============ 운영자(viewer) 타이머 override 폴링 ============
// /api/timer-override 를 4초마다 GET. 새 setTs가 보이면 SnakeTimer를 강제로 덮어씀.
const TIMER_OVERRIDE_APPLIED_KEY = "snake-timer-override-applied-ts";
const TIMER_OVERRIDE_POLL_MS = 4000;

function loadAppliedOverrideTs() {
  try { return Number(localStorage.getItem(TIMER_OVERRIDE_APPLIED_KEY)) || 0; } catch { return 0; }
}
function saveAppliedOverrideTs(ts) {
  try { localStorage.setItem(TIMER_OVERRIDE_APPLIED_KEY, String(ts)); } catch {}
}

async function pollTimerOverride() {
  if (!navigator.onLine) return;
  try {
    const r = await fetch("/api/timer-override?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    if (!data || data.empty || typeof data.setTs !== "number") return;
    const applied = loadAppliedOverrideTs();
    if (data.setTs <= applied) return;   // 이미 적용한 override
    const minutes = Number(data.minutes);
    if (!Number.isFinite(minutes) || minutes < 0) return;

    // 적용
    SnakeTimer.setRemaining(minutes * 60 * 1000);
    saveAppliedOverrideTs(data.setTs);
    timerEndedFired = (minutes === 0);
    startTimerDisplay();      // 보여지지 않는 상태였으면 표시 시작
    updateTimerDisplay();
    pushState();              // viewer가 빨리 볼 수 있도록 즉시 푸시
  } catch {}
}
setTimeout(pollTimerOverride, 1500);
setInterval(pollTimerOverride, TIMER_OVERRIDE_POLL_MS);

// ============ Service Worker 업데이트 시 자동 reload ============
// 새 SW가 활성화되어 페이지를 take over하면 controllerchange가 발생.
// 옛 자원으로 로드된 페이지는 한 번 reload 해서 새 자원 적용.
if ("serviceWorker" in navigator) {
  let swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    window.location.reload();
  });
}

// ============ 온라인 시 service worker에게 캐시 갱신 요청 ============
// 태블릿이 와이파이에 연결되면 자동으로 최신 시나리오·이미지를 받아서 캐시 교체.
// 다음 앱 실행 시 새 내용이 적용됨.
const SYNC_KEY = "snake-last-sync-v1";
function requestCacheRefresh() {
  if (!navigator.onLine) return;
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage("refresh-cache");
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch {}
}
// 페이지 로드 시 한 번
window.addEventListener("load", () => setTimeout(requestCacheRefresh, 1500));
// 와이파이 다시 연결될 때마다
window.addEventListener("online", requestCacheRefresh);

// ============ 화면 세로 고정 시도 (Android Chrome 등 지원 환경에서만) ============
function tryLockPortrait() {
  try {
    if (screen && screen.orientation && typeof screen.orientation.lock === "function") {
      screen.orientation.lock("portrait").catch(() => {});
    }
  } catch {}
}
tryLockPortrait();
// 사용자가 화면을 한 번 터치한 뒤에도 재시도 (일부 브라우저는 user gesture 후에만 허용)
window.addEventListener("touchstart", tryLockPortrait, { once: true, passive: true });
window.addEventListener("click", tryLockPortrait, { once: true });

// ============ 시작 ============
replayHistory();
if (SnakeTimer.isActive()) {
  timerEndedFired = SnakeTimer.isEnded();
  startTimerDisplay();
}
// 페이지 로드 시 이미 EP 클리어 상태였다면 오버레이 복원
if (loadProgress() >= 100) {
  showEpClearOverlay();
}
input.focus();

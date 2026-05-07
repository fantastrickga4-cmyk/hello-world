// 공유 카운트다운 타이머
// - 새로고침해도 시작 시각 기준으로 정확히 이어짐
// - freeze() 호출 시 그 시점 잔여 시간을 박제 → 더 이상 줄어들지 않음
//
// API
//  start(durationMs)  → 새 타이머 시작 (이미 실행 중이면 false)
//  getRemainingMs()   → 남은 ms (없으면 null) — frozen이면 동결된 값
//  isActive()         → 실행 중인지
//  isEnded()          → 0초에 도달했는지
//  freeze()           → 현재 잔여 시간을 동결 (cu next ep용). 이미 frozen이면 false
//  isFrozen()         → 동결 상태인지
//  setRemaining(ms)   → 운영자(viewer) override용. 동결 해제하고 잔여 ms로 덮어씀
//  clear()            → 타이머 삭제

window.SnakeTimer = (function () {
  const KEY = "snake-timer-state-v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj.startTs !== "number" || typeof obj.durationMs !== "number") return null;
      return obj;
    } catch { return null; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function start(durationMs) {
    if (load()) return false;
    save({ startTs: Date.now(), durationMs, frozen: false });
    return true;
  }
  function getRemainingMs() {
    const s = load();
    if (!s) return null;
    if (s.frozen) return s.frozenMs || 0;          // 동결 값 그대로 (음수 가능)
    return s.durationMs - (Date.now() - s.startTs); // clamp 없음 — 0 통과 후 음수로 진행
  }
  function isActive() { return load() !== null; }
  function isEnded() {
    const ms = getRemainingMs();
    return ms !== null && ms <= 0;
  }
  function freeze() {
    const s = load();
    if (!s || s.frozen) return false;
    const remaining = s.durationMs - (Date.now() - s.startTs);   // 음수도 그대로 박제
    save({ ...s, frozen: true, frozenMs: remaining });
    return true;
  }
  function isFrozen() {
    const s = load();
    return !!(s && s.frozen);
  }
  function setRemaining(durationMs) {
    const safe = Math.max(0, Math.floor(durationMs || 0));
    save({ startTs: Date.now(), durationMs: safe, frozen: false });
  }

  return { start, getRemainingMs, isActive, isEnded, freeze, isFrozen, setRemaining, clear };
})();

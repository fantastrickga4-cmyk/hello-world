// 타이머 override — 운영자(viewer)가 타이머 시간을 강제로 바꿀 때 사용.
// POST /api/timer-override  body: { minutes }   → 새 잔여 분으로 덮어씀
// GET  /api/timer-override                       → 현재 pending override 조회 (player가 폴링)
//
// player(app.js)는 setTs > localStorage["snake-timer-override-applied-ts"]면 적용.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "snake-timer-override";

async function redisSet(key, value) {
  const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
  return r.ok;
}

async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.result;
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({ error: "Redis env vars not configured" });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      if (!body || typeof body !== "object") body = {};
      const minutes = Number(body.minutes);
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
        res.status(400).json({ error: "minutes must be 0..1440" });
        return;
      }
      const payload = JSON.stringify({ minutes, setTs: Date.now() });
      await redisSet(KEY, payload);
      res.status(200).json({ ok: true, minutes });
    } else if (req.method === "GET") {
      const value = await redisGet(KEY);
      const override = value ? JSON.parse(value) : null;
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).json(override || { empty: true });
    } else {
      res.status(405).end();
    }
  } catch (e) {
    res.status(500).json({ error: e.message || "internal" });
  }
};

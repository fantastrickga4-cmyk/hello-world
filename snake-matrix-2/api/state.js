// 태블릿 상태 저장/조회 — Upstash Redis REST API 사용
// POST /api/state  → 태블릿이 현재 상태 저장 (디바운스된 변경 시점에)
// GET  /api/state  → PC viewer가 2초마다 폴링

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "snake-state-t2";

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
      const payload = JSON.stringify({ ...body, serverTime: Date.now() });
      await redisSet(KEY, payload);
      res.status(200).json({ ok: true });
    } else if (req.method === "GET") {
      const value = await redisGet(KEY);
      const state = value ? JSON.parse(value) : null;
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).json(state || { empty: true, serverTime: Date.now() });
    } else {
      res.status(405).end();
    }
  } catch (e) {
    res.status(500).json({ error: e.message || "internal" });
  }
};

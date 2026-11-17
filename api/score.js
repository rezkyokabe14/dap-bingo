// POST /api/score — a participant's card reports its current progress.
// Shared helper: talks to Upstash Redis over its REST API (env vars come from the Vercel storage integration).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

// Board per day (Jakarta time), so each class starts with an empty board.
function today() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}

const configured = () => Boolean(URL_ && TOKEN);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!configured()) return res.status(503).json({ error: 'storage-not-configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  const id = String(b.id || '').replace(/[^\w-]/g, '').slice(0, 64);
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const int = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
  if (!id || name.length < 2) return res.status(400).json({ error: 'invalid' });

  const now = Date.now();
  const reachedAt = Number(b.reachedAt);
  const rec = {
    name,
    bingo: int(b.bingo, 12),
    filled: int(b.filled, 25),
    people: int(b.people, 25),
    reachedAt: reachedAt > 0 && reachedAt <= now + 60000 ? reachedAt : now,
    updatedAt: now,
  };

  try {
    const key = 'dap:players:' + today();
    await redis(['HSET', key, id, JSON.stringify(rec)]);
    await redis(['EXPIRE', key, 60 * 60 * 24 * 30]);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'storage-error' });
  }
};

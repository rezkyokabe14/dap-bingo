// POST /api/reset {pin, d?} — facilitator clears a day's board. Needs the RESET_PIN environment variable.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.RESET_PIN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

function today() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'storage-not-configured' });
  if (!PIN) return res.status(503).json({ error: 'pin-not-set' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (String(b.pin || '') !== String(PIN)) {
    await new Promise(r => setTimeout(r, 800)); // slow down guessing
    return res.status(403).json({ error: 'wrong-pin' });
  }

  const q = String(b.d || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today();
  try {
    const removed = await redis(['DEL', 'dap:players:' + date]);
    res.status(200).json({ ok: true, date, removed });
  } catch (e) {
    res.status(500).json({ error: 'storage-error' });
  }
};

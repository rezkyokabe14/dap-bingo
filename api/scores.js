// GET /api/scores[?d=YYYY-MM-DD] — the facilitator dashboard reads the ranked board.
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
  if (!configured()) return res.status(503).json({ error: 'storage-not-configured' });

  const q = String((req.query && req.query.d) || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today();

  try {
    const flat = (await redis(['HGETALL', 'dap:players:' + date])) || [];
    const players = [];
    for (let i = 1; i < flat.length; i += 2) {
      try { players.push(JSON.parse(flat[i])); } catch (e) { /* skip bad row */ }
    }
    // Most bingo first; on a tie, whoever reached that count earlier; then most boxes filled.
    players.sort((a, b) => b.bingo - a.bingo || a.reachedAt - b.reachedAt || b.filled - a.filled);
    res.status(200).json({ date, players });
  } catch (e) {
    res.status(500).json({ error: 'storage-error' });
  }
};

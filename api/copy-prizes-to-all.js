// Vercel Serverless Function: /api/copy-prizes-to-all
// Copies prize settings from one account to all accounts (1..4) in Supabase DB

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dmmgkrtxszjogdjhdwde.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F';
const AUTH_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': AUTH_KEY,
      'Authorization': `Bearer ${AUTH_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.method === 'POST' ? 'return=minimal' : 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  if (res.status === 201 || res.status === 204) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { sourceAccountId, prizes, requireWinnerInfo, gridSize } = req.body || {};
    let targetPrizes = prizes;
    let targetRequire = requireWinnerInfo;
    let targetSize = gridSize;

    if (!targetPrizes && sourceAccountId) {
      try {
        const rows = await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(sourceAccountId)}`);
        if (rows && rows.length > 0) {
          targetPrizes = rows[0].prizes;
          targetRequire = rows[0].require_winner_info;
          targetSize = rows[0].grid_size;
        }
      } catch (err) {}
    }

    if (!targetPrizes || !Array.isArray(targetPrizes)) {
      return res.status(400).json({ status: 'error', message: 'prizes data is required' });
    }

    const fallbackSize = targetPrizes.length || 25;
    const requireVal = targetRequire || Array(fallbackSize).fill(false);
    const sizeVal = targetSize || Math.sqrt(fallbackSize) || 5;

    for (const id of ["1", "2", "3", "4", "5"]) {
      try {
        const existing = await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(id)}`);
        if (existing && existing.length > 0) {
          await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              prizes: targetPrizes,
              popped: Array(fallbackSize).fill(false),
              require_winner_info: requireVal,
              grid_size: sizeVal,
              updated_at: new Date().toISOString()
            })
          });
        } else {
          await supabaseFetch('/board_state', {
            method: 'POST',
            body: JSON.stringify({
              account_id: String(id),
              prizes: targetPrizes,
              popped: Array(fallbackSize).fill(false),
              require_winner_info: requireVal,
              grid_size: sizeVal
            })
          });
        }
      } catch (err) {}
    }

    return res.status(200).json({ status: 'success' });
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

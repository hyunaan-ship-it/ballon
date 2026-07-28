// Vercel Serverless Function: /api/board-state/[accountId]
// Handles GET (fetch board state) and POST (save board state) requests.
// Uses Supabase REST API as persistent storage.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dmmgkrtxszjogdjhdwde.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F';

// Use service key if available (for write access), otherwise anon key
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { accountId } = req.query;
  if (!accountId) {
    return res.status(400).json({ status: 'error', message: 'accountId is required' });
  }

  // GET /api/board-state/:accountId - Fetch board state
  if (req.method === 'GET') {
    try {
      const rows = await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(accountId)}`);
      if (rows && rows.length > 0) {
        const row = rows[0];
        return res.status(200).json({
          prizes: row.prizes,
          popped: row.popped,
          requireWinnerInfo: row.require_winner_info,
          gridSize: row.grid_size || Math.sqrt(row.prizes.length) || 5
        });
      } else {
        return res.status(404).json({ status: 'not_found' });
      }
    } catch (err) {
      console.error('[API] GET board-state error:', err.message);
      // Return 200 with error key so frontend can gracefully fall back to local storage
      return res.status(200).json({ status: 'error', message: err.message });
    }
  }

  // POST /api/board-state/:accountId - Save board state
  if (req.method === 'POST') {
    const { prizes, popped, requireWinnerInfo, gridSize } = req.body || {};
    if (!prizes || !popped) {
      return res.status(400).json({ status: 'error', message: 'prizes and popped are required' });
    }

    const fallbackSize = prizes.length || 25;
    const computedGridSize = gridSize || Math.sqrt(fallbackSize) || 5;

    try {
      // Check if record exists for this account_id
      const existing = await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(accountId)}`);
      if (existing && existing.length > 0) {
        // Record exists, update via PATCH
        await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(accountId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            prizes,
            popped,
            require_winner_info: requireWinnerInfo || Array(fallbackSize).fill(false),
            updated_at: new Date().toISOString()
          })
        });
      } else {
        // Record does not exist, insert via POST
        await supabaseFetch('/board_state', {
          method: 'POST',
          body: JSON.stringify({
            account_id: String(accountId),
            prizes,
            popped,
            require_winner_info: requireWinnerInfo || Array(fallbackSize).fill(false),
            updated_at: new Date().toISOString()
          })
        });
      }
      return res.status(200).json({ status: 'success' });
    } catch (err) {
      console.error('[API] POST board-state error:', err.message);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

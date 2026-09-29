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
    try {
      const { sourceAccountId, prizes, requireWinnerInfo, gridSize } = req.body || {};
      let targetPrizes = prizes;
      let targetRequire = requireWinnerInfo;
      let targetSize = gridSize;

      if ((!targetPrizes || !Array.isArray(targetPrizes) || targetPrizes.length === 0) && sourceAccountId) {
        try {
          const rows = await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(sourceAccountId)}`);
          if (rows && rows.length > 0) {
            targetPrizes = rows[0].prizes;
            targetRequire = rows[0].require_winner_info;
            targetSize = rows[0].grid_size;
          }
        } catch (err) {
          console.error('[CopyPrizes] Failed to fetch source account board state:', err);
        }
      }

      if (!targetPrizes || !Array.isArray(targetPrizes) || targetPrizes.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Valid prizes array is required' });
      }

      const fallbackSize = targetPrizes.length || 25;
      const requireVal = targetRequire || Array(fallbackSize).fill(false);
      const sizeVal = targetSize || Math.sqrt(fallbackSize) || 5;

      const errors = [];
      for (const id of ["1", "2", "3", "4", "5"]) {
        try {
          const bodyPayload = {
            prizes: targetPrizes,
            popped: Array(fallbackSize).fill(false),
            require_winner_info: requireVal,
            grid_size: sizeVal,
            updated_at: new Date().toISOString()
          };
          const existing = await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(id)}`);
          if (existing && existing.length > 0) {
            try {
              await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify(bodyPayload)
              });
            } catch (err) {
              if (err.message.includes('grid_size') || err.message.includes('PGRST204')) {
                delete bodyPayload.grid_size;
                await supabaseFetch(`/board_state?account_id=eq.${encodeURIComponent(id)}`, {
                  method: 'PATCH',
                  body: JSON.stringify(bodyPayload)
                });
              } else throw err;
            }
          } else {
            const insertPayload = { account_id: String(id), ...bodyPayload };
            try {
              await supabaseFetch('/board_state', {
                method: 'POST',
                body: JSON.stringify(insertPayload)
              });
            } catch (err) {
              if (err.message.includes('grid_size') || err.message.includes('PGRST204')) {
                delete insertPayload.grid_size;
                await supabaseFetch('/board_state', {
                  method: 'POST',
                  body: JSON.stringify(insertPayload)
                });
              } else throw err;
            }
          }
        } catch (err) {
          console.error(`[CopyPrizes] Error updating account ${id}:`, err.message);
          errors.push({ accountId: id, error: err.message });
        }
      }

      if (errors.length === 5) {
        return res.status(500).json({ status: 'error', message: 'Failed to update database for all accounts', errors });
      }

      return res.status(200).json({ status: 'success', warnings: errors.length > 0 ? errors : undefined });
    } catch (mainErr) {
      console.error('[CopyPrizes] General error:', mainErr);
      return res.status(500).json({ status: 'error', message: mainErr.message });
    }
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

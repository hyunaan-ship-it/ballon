// Vercel Serverless Function: /api/account-names
// Handles GET (fetch account names) and POST (save account names)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dmmgkrtxszjogdjhdwde.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F';
const AUTH_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

let memoryAccountNames = {
  "1": "계정 1",
  "2": "계정 2",
  "3": "계정 3",
  "4": "계정 4",
  "5": "계정 5"
};

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const rows = await supabaseFetch('/account_names?id=eq.global');
      if (rows && rows.length > 0 && rows[0].names) {
        memoryAccountNames = { ...memoryAccountNames, ...rows[0].names };
      }
    } catch (err) {}
    return res.status(200).json({ status: 'success', accountNames: memoryAccountNames });
  }

  if (req.method === 'POST') {
    const { names } = req.body || {};
    if (names && typeof names === 'object') {
      memoryAccountNames = { ...memoryAccountNames, ...names };
      try {
        const existing = await supabaseFetch('/account_names?id=eq.global');
        if (existing && existing.length > 0) {
          await supabaseFetch('/account_names?id=eq.global', {
            method: 'PATCH',
            body: JSON.stringify({ names: memoryAccountNames, updated_at: new Date().toISOString() })
          });
        } else {
          await supabaseFetch('/account_names', {
            method: 'POST',
            body: JSON.stringify({ id: 'global', names: memoryAccountNames })
          });
        }
      } catch (err) {}
    }
    return res.status(200).json({ status: 'success', accountNames: memoryAccountNames });
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

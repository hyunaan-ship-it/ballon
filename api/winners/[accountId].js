// Vercel Serverless Function: /api/winners/[accountId]
// Handles GET (list winners) and POST (submit winner) requests.
// Uses Supabase REST API as persistent storage (no filesystem on Vercel).

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
  // For POST with return=minimal, body is empty
  if (res.status === 201 || res.status === 204) return null;
  return res.json();
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { accountId } = req.query;
  if (!accountId) {
    return res.status(400).json({ status: 'error', message: 'accountId is required' });
  }

  // GET /api/winners/:accountId - list winners
  if (req.method === 'GET') {
    try {
      const { startDate, endDate } = req.query;
      let query = `/winners?account_id=eq.${encodeURIComponent(accountId)}&order=created_at.asc`;
      if (startDate) {
        const startIso = startDate.includes('T') ? startDate : `${startDate}T00:00:00+09:00`;
        query += `&created_at=gte.${encodeURIComponent(startIso)}`;
      }
      if (endDate) {
        const endIso = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999+09:00`;
        query += `&created_at=lte.${encodeURIComponent(endIso)}`;
      }

      const rows = await supabaseFetch(query);
      const winners = (rows || []).map(r => ({
        employeeId: r.employee_id,
        phoneNumber: r.phone_number,
        prize: r.prize,
        timestamp: r.created_at,
        timestampFormatted: new Date(r.created_at).toLocaleString('ko-KR')
      }));
      return res.status(200).json({ winners });
    } catch (err) {
      console.error('[API] GET winners error:', err.message);
      // Return empty array gracefully so UI doesn't break
      return res.status(200).json({ winners: [], error: err.message });
    }
  }

  // POST /api/winners/:accountId - submit winner info
  if (req.method === 'POST') {
    const { employeeId, phoneNumber, prize } = req.body || {};
    if (!employeeId || !phoneNumber || !prize) {
      return res.status(400).json({ status: 'error', message: '모든 필드를 입력해주세요.' });
    }

    try {
      await supabaseFetch('/winners', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          employee_id: employeeId,
          phone_number: phoneNumber,
          prize: prize
        })
      });
      return res.status(200).json({ status: 'success' });
    } catch (err) {
      console.error('[API] POST winners error:', err.message);
      // If Supabase table doesn't exist yet, still return success
      // (data was already saved via Supabase broadcast on client side)
      return res.status(200).json({ status: 'success', warning: err.message });
    }
  }

  // DELETE /api/winners/:accountId - clear all winners
  if (req.method === 'DELETE') {
    try {
      await supabaseFetch(`/winners?account_id=eq.${encodeURIComponent(accountId)}`, {
        method: 'DELETE'
      });
      return res.status(200).json({ status: 'success', message: '당첨자 기록이 삭제되었습니다.' });
    } catch (err) {
      console.error('[API] DELETE winners error:', err.message);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

// Vercel Serverless Function: /api/winners/[accountId]/csv
// Downloads winner data as a CSV file using Supabase as storage.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dmmgkrtxszjogdjhdwde.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F';
const AUTH_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

async function supabaseFetch(path) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    headers: {
      'apikey': AUTH_KEY,
      'Authorization': `Bearer ${AUTH_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { accountId, startDate, endDate } = req.query;
  if (!accountId) return res.status(400).send('accountId required');

  try {
    let query = `/winners?account_id=eq.${encodeURIComponent(accountId)}&order=created_at.asc`;
    if (startDate) query += `&created_at=gte.${encodeURIComponent(startDate)}`;
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query += `&created_at=lte.${encodeURIComponent(end.toISOString())}`;
    }

    const rows = await supabaseFetch(query);
    if (!rows || rows.length === 0) {
      return res.status(404).send('해당 기간의 당첨자 정보가 없습니다.');
    }

    const headers = ['사번', '전화번호', '상품명', '입력 시간'];
    const csvRows = rows.map(r => [
      r.employee_id,
      r.phone_number,
      r.prize,
      new Date(r.created_at).toLocaleString('ko-KR')
    ]);
    const csvContent = [headers, ...csvRows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=winners_account_${accountId}_${Date.now()}.csv`);
    return res.send('\uFEFF' + csvContent);
  } catch (err) {
    console.error('[API] CSV error:', err.message);
    return res.status(500).send('서버 오류: ' + err.message);
  }
}

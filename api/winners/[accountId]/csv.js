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

// Phone number formatting helper to force 010-XXXX-XXXX format
function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('10') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  if (cleaned.length === 11) {
    return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 7) + '-' + cleaned.slice(7);
  } else if (cleaned.length === 10) {
    return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 6) + '-' + cleaned.slice(6);
  }
  return phone;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { accountId, startDate, endDate } = req.query;
  if (!accountId) return res.status(400).send('accountId required');

  try {
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
    if (!rows || rows.length === 0) {
      return res.status(404).send('해당 기간의 당첨자 정보가 없습니다.');
    }

    const headers = ['사번', '전화번호', '상품명', '입력 시간'];
    const csvRows = rows.map(r => [
      r.employee_id,
      formatPhoneNumber(r.phone_number),
      r.prize,
      new Date(r.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
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

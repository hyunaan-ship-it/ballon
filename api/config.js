// Vercel Serverless Function: /api/config
// Exposes the public Supabase credentials configured in Vercel environment variables to the frontend.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://dmmgkrtxszjogdjhdwde.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F';

  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey
  });
}

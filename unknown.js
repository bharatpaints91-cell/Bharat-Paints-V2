// ════════════════════════════════════════════════════════════
// BHARAT PAINTS — UNKNOWN QUERIES API
// File: api/unknown.js
// Returns list of unanswered questions for admin panel.
// ════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // check admin key
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const unknownPath = path.join(process.cwd(), 'data', 'unknown.json');

  if (req.method === 'GET') {
    try {
      const list = JSON.parse(fs.readFileSync(unknownPath, 'utf8'));
      const sorted = list.sort((a,b) => b.count - a.count);
      return res.status(200).json({ queries: sorted, total: sorted.length });
    } catch {
      return res.status(200).json({ queries: [], total: 0 });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      let list = JSON.parse(fs.readFileSync(unknownPath, 'utf8'));
      if (id === 'all') {
        fs.writeFileSync(unknownPath, '[]');
      } else {
        list = list.filter((_,i) => String(i) !== id);
        fs.writeFileSync(unknownPath, JSON.stringify(list, null, 2));
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

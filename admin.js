// ════════════════════════════════════════════════════════════
// BHARAT PAINTS — ADMIN API
// File: api/admin.js
// Returns stats, handles data file read/update for admin panel.
// ════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const DATA_FILES = ['products.txt', 'faq.txt', 'services.txt'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  const dataDir = path.join(process.cwd(), 'data');

  // GET — fetch stats + unknown queries + file list
  if (req.method === 'GET') {
    let stats = { total: 0, today: 0, date: '' };
    try { stats = JSON.parse(fs.readFileSync(path.join(dataDir,'stats.json'),'utf8')); } catch {}

    let unknown = [];
    try { unknown = JSON.parse(fs.readFileSync(path.join(dataDir,'unknown.json'),'utf8')); } catch {}

    // count products and FAQs
    let productCount = 0, faqCount = 0;
    try {
      const ptxt = fs.readFileSync(path.join(dataDir,'products.txt'),'utf8');
      productCount = ptxt.split('\n').filter(l => l.includes('|') && !l.trim().startsWith('#')).length;
    } catch {}
    try {
      const ftxt = fs.readFileSync(path.join(dataDir,'faq.txt'),'utf8');
      faqCount = (ftxt.match(/^Q:/gm)||[]).length;
    } catch {}

    return res.status(200).json({
      stats: {
        totalChats: stats.total || 0,
        todayChats: stats.today || 0,
        productCount,
        faqCount,
        unknownCount: unknown.filter(x=>!x.answered).length
      },
      unknownQueries: unknown.sort((a,b)=>b.count-a.count).slice(0,50),
      dataFiles: DATA_FILES
    });
  }

  // POST — update a data file
  if (req.method === 'POST') {
    const { action, file, content, query, answer } = req.body || {};

    // save full file content
    if (action === 'save_file' && file && DATA_FILES.includes(file)) {
      try {
        fs.writeFileSync(path.join(dataDir, file), content || '');
        return res.status(200).json({ success: true, message: `${file} saved successfully.` });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // read a file for editing
    if (action === 'read_file' && file && DATA_FILES.includes(file)) {
      try {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
        return res.status(200).json({ success: true, content });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // add a new FAQ entry directly
    if (action === 'add_faq' && query && answer) {
      try {
        const faqPath = path.join(dataDir, 'faq.txt');
        const existing = fs.readFileSync(faqPath, 'utf8');
        const newEntry = `\nQ: ${query}\nA: ${answer}\n`;
        fs.writeFileSync(faqPath, existing + newEntry);

        // mark as answered in unknown.json
        try {
          let unknown = JSON.parse(fs.readFileSync(path.join(dataDir,'unknown.json'),'utf8'));
          unknown = unknown.map(x => x.q === query ? { ...x, answered: true } : x);
          fs.writeFileSync(path.join(dataDir,'unknown.json'), JSON.stringify(unknown,null,2));
        } catch {}

        return res.status(200).json({ success: true, message: 'FAQ added! Bot will now answer this question.' });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // add a new product price
    if (action === 'add_product' && content) {
      try {
        const pPath = path.join(dataDir, 'products.txt');
        const existing = fs.readFileSync(pPath, 'utf8');
        fs.writeFileSync(pPath, existing + '\n' + content);
        return res.status(200).json({ success: true, message: 'Product added!' });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // clear stats
    if (action === 'clear_stats') {
      try {
        fs.writeFileSync(path.join(dataDir,'stats.json'), JSON.stringify({total:0,today:0,date:''}));
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

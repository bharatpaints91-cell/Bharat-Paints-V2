// ════════════════════════════════════════════════════════════
// BHARAT PAINTS — MAIN CHATBOT API
// File: api/chat.js
// This runs on Vercel as a serverless function.
// Reads data files, finds answers, returns response.
// ════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────
function readFile(name) {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'data', name), 'utf8');
  } catch { return ''; }
}

function parseProducts(txt) {
  const items = [];
  let category = '';
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      category = line.slice(1,-1).toLowerCase().replace(/_/g,' ');
      continue;
    }
    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 3) {
      items.push({ category, name: parts[0], size: parts[1], price: parts[2] });
    }
  }
  return items;
}

function parseFAQ(txt) {
  const faqs = [];
  let current = null;
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('Q:')) {
      if (current) faqs.push(current);
      current = { q: line.slice(2).trim(), a: '' };
    } else if (line.startsWith('A:') && current) {
      current.a = line.slice(2).trim();
    }
  }
  if (current) faqs.push(current);
  return faqs;
}

function parseServices(txt) {
  const services = {};
  let section = '';
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1,-1);
      services[section] = {};
      continue;
    }
    const idx = line.indexOf(':');
    if (idx > -1 && section) {
      const key = line.slice(0,idx).trim();
      const val = line.slice(idx+1).trim();
      services[section][key] = val;
    }
  }
  return services;
}

// ── score how well text matches a query ───────────────────────
function score(text, words) {
  const t = text.toLowerCase();
  return words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
}

// ── is customer asking for price? ────────────────────────────
function isPriceQuery(q) {
  return /\bprice\b|\bprices\b|\brate\b|\brates\b|\bcost\b|\bkitna\b|\bhow much\b|₹|\brupee|\bdaam\b|\bpaisa\b|\bquote\b|\bquotation\b|\brate list\b|\bprice list\b/i.test(q);
}

// ── find matching products ────────────────────────────────────
function findProducts(query, products) {
  const words = query.toLowerCase().replace(/[₹,]/g,'').split(/\s+/).filter(w => w.length > 2);
  return products
    .map(p => ({ p, s: score(p.name + ' ' + p.category, words) }))
    .filter(x => x.s > 0)
    .sort((a,b) => b.s - a.s)
    .slice(0, 8)
    .map(x => x.p);
}

// ── find matching FAQ ─────────────────────────────────────────
function findFAQ(query, faqs) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const best = faqs
    .map(f => ({ f, s: score(f.q + ' ' + f.a, words) }))
    .filter(x => x.s > 0)
    .sort((a,b) => b.s - a.s);
  return best.length > 0 ? best[0].f : null;
}

// ── build response ────────────────────────────────────────────
function buildAnswer(query, products, faqs, services) {
  const q    = query.toLowerCase().trim();
  const WA   = 'https://wa.me/919896221004';
  const MAPS = 'https://maps.google.com/?q=SCO+30+Bhagat+Singh+Market+Railway+Road+Karnal';

  // ── site visit ───────────────────────────────────────────
  if (/site visit|free visit|home visit|ghar aa/.test(q)) {
    return {
      type: 'service',
      tag: '📅 Free Site Visit',
      text: 'Our team visits your location in Karnal — 100% free, no charges for estimate. We inspect, recommend the right product and give exact quote within 24 hours. Urgent jobs mobilised within 24–48 hours.',
      cta: { label: '💬 Book on WhatsApp', url: WA + '?text=Hi!%20I%20want%20to%20book%20a%20free%20site%20visit.' },
      found: true
    };
  }

  // ── address / location ────────────────────────────────────
  if (/address|location|where|shop|timing|open|close|hour|sunday|karnal|railway road|sco/.test(q)) {
    const s = services['SHOP_INFO'] || {};
    return {
      type: 'info',
      tag: '📍 Visit Us',
      text: 'SCO 30, Bhagat Singh Market, Railway Road, Karnal 132001',
      details: ['🕐 Mon–Sat: 9:30 AM – 7:30 PM', '🔴 Sunday: Shop closed', '📦 Sunday WhatsApp orders → delivered Monday with FREE brush & roller 🎁'],
      cta: { label: '📍 Open in Maps', url: MAPS },
      found: true
    };
  }

  // ── price query ───────────────────────────────────────────
  if (isPriceQuery(q)) {
    const results = findProducts(q, products);
    if (results.length > 0) {
      return {
        type: 'price',
        tag: '💰 Price Results',
        products: results,
        note: `Showing ${results.length} matching product${results.length > 1 ? 's' : ''}. For bulk pricing or stock availability:`,
        cta: { label: '💬 WhatsApp for Best Price', url: WA + '?text=Hi!%20Please%20share%20best%20price.' },
        found: true
      };
    }
    return {
      type: 'price_not_found',
      tag: '💰 Price Query',
      text: 'I could not find that specific product. Please WhatsApp us for exact pricing — we respond within minutes.',
      cta: { label: '💬 Ask on WhatsApp', url: WA + '?text=Hi!%20I%20need%20pricing%20for:%20' + encodeURIComponent(query) },
      found: false
    };
  }

  // ── service questions ──────────────────────────────────────
  if (/paint.*service|painting service|labour|contractor|painter|applicator|service cost|per sq/.test(q)) {
    const s = services['PAINTING_SERVICE'] || {};
    return {
      type: 'service',
      tag: '🖌️ Painting Service',
      details: [
        `Rate: ${s.rate_min || 'Rs. 20'} to ${s.rate_max || 'Rs. 60'} per sq ft`,
        `2BHK takes approximately ${s.duration_2bhk || '10 days'}`,
        `${s.team || '50+ trained painters'}`,
        `Includes: ${s.includes || 'putty, primer, 2–3 coats, cleanup'}`,
        'Free site visit — no charges for estimate'
      ],
      cta: { label: '💬 Book Free Site Visit', url: WA + '?text=Hi!%20I%20need%20painting%20service%20quote.' },
      found: true
    };
  }

  if (/waterproof.*service|waterproof.*work|damp.*service|roof.*leak|terrace.*leak/.test(q)) {
    const s = services['WATERPROOFING_SERVICE'] || {};
    return {
      type: 'service',
      tag: '💧 Waterproofing Service',
      details: [
        `Rate: ${s.rate_min || 'Rs. 20'} to ${s.rate_max || 'Rs. 60'} per sq ft`,
        `1000 sq ft terrace approx: ${s.terrace_1000sqft_approx || 'Rs. 25,000 to Rs. 60,000'}`,
        `Guarantee: ${s.guarantee_premium || '10 years'} available`,
        'Free site visit and diagnosis — no charges'
      ],
      cta: { label: '💬 Book Free Inspection', url: WA + '?text=Hi!%20I%20need%20waterproofing%20inspection.' },
      found: true
    };
  }

  // ── delivery / order ───────────────────────────────────────
  if (/deliver|order|free deliver|online order|offer|how to order/.test(q)) {
    const s = services['DELIVERY'] || {};
    return {
      type: 'service',
      tag: '🚚 Order & Delivery',
      details: [
        `Free delivery on orders above ${s.free_delivery_above || 'Rs. 10,000'} in Karnal`,
        'Same-day delivery for orders before 3 PM',
        `Online order special: ${s.online_offer || 'FREE brush and roller with every WhatsApp order'}`,
        'Sunday orders delivered Monday morning'
      ],
      cta: { label: '💬 Place Order on WhatsApp', url: WA + '?text=Hi!%20I%20want%20to%20place%20an%20order.' },
      found: true
    };
  }

  // ── colour consultancy ─────────────────────────────────────
  if (/colou?r|shade|consultancy|shade card|suggest.*colou?r|which colou?r/.test(q)) {
    const s = services['COLOUR_CONSULTANCY'] || {};
    return {
      type: 'service',
      tag: '🎨 Free Colour Consultancy',
      text: 'Free colour consultancy available — visit shop or WhatsApp photos of your room. We suggest the best colours based on lighting and space.',
      links: [
        { label: 'Asian Paints Colours', url: 'https://www.asianpaints.com/colours' },
        { label: 'Dulux Colour Picker', url: 'https://www.dulux.in/en/colour-picker' },
        { label: 'Nerolac Colour Space', url: 'https://www.nerolac.com/colourspace' }
      ],
      cta: { label: '💬 Send Room Photos', url: WA + '?text=Hi!%20I%20need%20colour%20consultancy.' },
      found: true
    };
  }

  // ── FAQ match ──────────────────────────────────────────────
  const faq = findFAQ(q, faqs);
  if (faq && faq.a) {
    return {
      type: 'faq',
      tag: '💡 Answer',
      text: faq.a,
      cta: { label: '💬 WhatsApp Us', url: WA + '?text=Hi%20Bharat%20Paints!' },
      found: true
    };
  }

  // ── product general (no price) ─────────────────────────────
  const prods = findProducts(q, products);
  if (prods.length > 0) {
    return {
      type: 'product_info',
      tag: '🎨 Products Found',
      text: `We have ${prods.length} matching product${prods.length > 1 ? 's' : ''} for your query. Ask for the price when you're ready, or WhatsApp us for details.`,
      productNames: prods.map(p => p.name),
      cta: { label: '💬 Ask on WhatsApp', url: WA + '?text=Hi!%20I%20want%20details%20about:%20' + encodeURIComponent(prods[0].name) },
      found: true
    };
  }

  // ── not found ──────────────────────────────────────────────
  return {
    type: 'unknown',
    text: 'For this specific query our team can help you best. WhatsApp us for the fastest answer! 👊',
    cta: { label: '💬 WhatsApp Us Directly', url: WA + '?text=Hi!%20I%20need%20help%20with:%20' + encodeURIComponent(query) },
    found: false
  };
}

// ── main handler ──────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { query, sessionId } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });

    const products = parseProducts(readFile('products.txt'));
    const faqs     = parseFAQ(readFile('faq.txt'));
    const services = parseServices(readFile('services.txt'));
    const answer   = buildAnswer(query, products, faqs, services);

    // log unknown query
    if (!answer.found) {
      try {
        const unknownPath = path.join(process.cwd(), 'data', 'unknown.json');
        let list = [];
        try { list = JSON.parse(fs.readFileSync(unknownPath, 'utf8')); } catch {}
        const existing = list.find(x => x.q.toLowerCase() === query.toLowerCase().trim());
        if (existing) { existing.count++; existing.last = new Date().toISOString(); }
        else list.push({ q: query.trim(), count: 1, first: new Date().toISOString(), last: new Date().toISOString(), answered: false });
        fs.writeFileSync(unknownPath, JSON.stringify(list, null, 2));
      } catch {}
    }

    // track chat stats
    try {
      const statsPath = path.join(process.cwd(), 'data', 'stats.json');
      let stats = { total: 0, today: 0, date: '' };
      try { stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')); } catch {}
      const today = new Date().toISOString().slice(0,10);
      if (stats.date !== today) { stats.today = 0; stats.date = today; }
      stats.total = (stats.total || 0) + 1;
      stats.today = (stats.today || 0) + 1;
      fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch {}

    return res.status(200).json({ answer, query });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', msg: err.message });
  }
};

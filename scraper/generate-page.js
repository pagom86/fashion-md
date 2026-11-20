const fs = require('fs');
const path = require('path');

function parse29CMText(raw) {
  const parts = raw.split('\n\n').map(s => s.trim()).filter(Boolean);
  const discountIdx = parts.findIndex(p => /^\d+%$/.test(p));
  const discount = discountIdx >= 0 ? parseInt(parts[discountIdx]) : null;
  const textParts = discountIdx >= 0 ? parts.slice(0, discountIdx) : parts.slice(0, 2);
  const afterDiscount = discountIdx >= 0 ? discountIdx + 1 : 2;
  const priceStr = parts.slice(afterDiscount).find(p => /^[\d,]+$/.test(p));
  const price = priceStr ? parseInt(priceStr.replace(/,/g, '')) : 0;
  const brand = textParts.length >= 2 ? textParts[textParts.length - 2] : (textParts[0] || '');
  const name = textParts.length >= 1 ? textParts[textParts.length - 1] : '';
  return { brand, name, discount, price };
}

const raw = JSON.parse(fs.readFileSync('data/products.json', 'utf-8'));

const items = raw.items.map(p => {
  if (p.site !== 'cm29') return p;
  if (!p.name.includes('\n')) return p;
  const parsed = parse29CMText(p.name);
  return {
    ...p,
    name: parsed.name || p.name,
    brand: parsed.brand,
    price: parsed.price,
    discount: parsed.discount,
  };
}).filter(p => p.name && !p.name.includes('\n\n'));

const data = { updatedAt: raw.updatedAt, items };

const templatePath = path.join(__dirname, '..', 'docs', 'index.html');
const html = fs.readFileSync(path.join(__dirname, 'page-template.html'), 'utf-8');
const output = html.replace('/*__INJECT_DATA__*/', `window.__STATIC_DATA__ = ${JSON.stringify(data)};`);

if (!fs.existsSync('docs')) fs.mkdirSync('docs');
fs.writeFileSync(templatePath, output, 'utf-8');
console.log(`Generated docs/index.html with ${items.length} items`);

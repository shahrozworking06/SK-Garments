import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { and, eq, desc, asc, sql } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { products, orders, messages, settings } from '../../db/schema.js';

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function str(value: unknown, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function phone(value: unknown) { return str(value, 30).replace(/[^\d+()\-\s]/g, ''); }
function imageStore() { return getStore({ name: 'product-images', consistency: 'strong' }); }

export default async (req: Request) => {
  try {
    const url = new URL(req.url), path = url.pathname, method = req.method;
    if (!['GET', 'HEAD'].includes(method)) {
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: 'Please use this website to submit requests.' }, 403);
    }
    if (path.startsWith('/api/admin/')) {
      const user = await getUser();
      if (!user) return json({ error: 'Please sign in to the owner panel.' }, 401);
      if (!user.roles?.includes('admin')) return json({ error: 'This account needs the admin role. The site owner can assign it in Netlify Identity.' }, 403);
      if (path === '/api/admin/me' && method === 'GET') return json({ email: user.email });
    }
    if (path.startsWith('/api/images/') && method === 'GET') {
      const key = path.slice('/api/images/'.length);
      if (!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(key)) return json({ error: 'Image not found.' }, 404);
      const data = await imageStore().get(key, { type: 'arrayBuffer' });
      if (!data) return json({ error: 'Image not found.' }, 404);
      const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      return new Response(data, { headers: { 'Content-Type': types[key.split('.').pop()!], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (path === '/api/admin/upload' && method === 'POST') {
      const file = (await req.formData()).get('image');
      if (!(file instanceof File)) fail('Choose an image first.');
      const types: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
      if (!types[file.type] || file.size > 5 * 1024 * 1024) fail('Choose a JPG, PNG, WEBP or GIF image under 5 MB.');
      const key = crypto.randomUUID() + '.' + types[file.type];
      await imageStore().set(key, await file.arrayBuffer());
      return json({ image: '/api/images/' + key });
    }
    const db = database();
    const readSettings = async () => {
      const rows = await db.select().from(settings);
      return { shop_name: 'SK GARMENTS', whatsapp_number: '923196236961', bank_enabled: '0', bank_name: '', account_title: '', account_number: '', iban: '', payment_instructions: '', ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
    };
    if (path === '/api/store' && method === 'GET') {
      const s = await readSettings();
      return json({ shopName: s.shop_name, whatsapp: s.whatsapp_number, products: await db.select().from(products).where(eq(products.active, true)).orderBy(desc(products.id)), bankEnabled: s.bank_enabled === '1', bank: s.bank_enabled === '1' ? { name: s.bank_name, title: s.account_title, number: s.account_number, iban: s.iban, instructions: s.payment_instructions } : null });
    }
    if (path === '/api/admin/summary' && method === 'GET') {
      const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(products);
      const [o] = await db.select({ n: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where status = 'Pending')::int`, revenue: sql<number>`coalesce(sum(total) filter (where status in ('Confirmed','Processing','Shipped','Delivered')),0)::int` }).from(orders);
      const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.sender, 'customer'), eq(messages.read_by_admin, false)));
      return json({ products: p.n, orders: o.n, pending: o.pending, revenue: o.revenue, unread: m.n });
    }
    if (path === '/api/admin/products' && method === 'GET') return json(await db.select().from(products).orderBy(desc(products.id)));
    const productMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
    if ((path === '/api/admin/products' && method === 'POST') || (productMatch && method === 'PUT')) {
      const b = await req.json();
      if (!str(b.name) || !str(b.category) || !Number.isFinite(Number(b.price)) || Number(b.price) < 0 || Number(b.price) > 10000000 || !Number.isInteger(Number(b.stock)) || Number(b.stock) < 0 || Number(b.stock) > 1000000) fail('Enter a valid product name, category, price and stock.');
      const image = str(b.image, 500);
      if (image && !/^(https:\/\/|\/(?!\/))/.test(image)) fail('Use an HTTPS image URL or an uploaded image.');
      const values = { name: str(b.name, 120), category: str(b.category, 60), price: Math.round(Number(b.price)), description: str(b.description, 2000), stock: Number(b.stock), image, active: b.active !== false };
      const [p] = productMatch ? await db.update(products).set(values).where(eq(products.id, Number(productMatch[1]))).returning() : await db.insert(products).values(values).returning();
      if (!p) fail('Product not found.', 404);
      return json({ ok: true, id: p.id });
    }
    if (productMatch && method === 'DELETE') { const rows = await db.delete(products).where(eq(products.id, Number(productMatch[1]))).returning(); return json({ ok: rows.length > 0 }); }
    if (path === '/api/admin/orders' && method === 'GET') return json(await db.select().from(orders).orderBy(desc(orders.id)).limit(500));
    const orderMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (orderMatch && method === 'PATCH') {
      const b = await req.json();
      if (!['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(b.status) || !['Unpaid', 'Awaiting Verification', 'Paid', 'Refunded'].includes(b.payment_status)) fail('Choose valid order and payment statuses.');
      const rows = await db.update(orders).set({ status: b.status, payment_status: b.payment_status }).where(eq(orders.id, Number(orderMatch[1]))).returning();
      if (!rows.length) fail('Order not found.', 404);
      return json({ ok: true });
    }
    if (path === '/api/admin/messages' && method === 'GET') {
      await db.update(messages).set({ read_by_admin: true }).where(eq(messages.sender, 'customer'));
      return json((await db.select().from(messages).orderBy(desc(messages.id)).limit(300)).reverse());
    }
    if (path === '/api/chat' && method === 'GET') {
      const p = phone(url.searchParams.get('phone'));
      return json(p ? await db.select({ id: messages.id, customer_name: messages.customer_name, message: messages.message, sender: messages.sender, created_at: messages.created_at }).from(messages).where(eq(messages.phone, p)).orderBy(asc(messages.id)).limit(200) : []);
    }
    if ((path === '/api/chat' || path === '/api/admin/messages/reply') && method === 'POST') {
      const b = await req.json(), p = phone(b.phone), reply = path.includes('/admin/');
      if (p.replace(/\D/g, '').length < 7 || !str(b.message) || (!reply && !str(b.name))) fail('Enter your name, phone number and message.');
      const [m] = await db.insert(messages).values({ customer_name: reply ? 'SK Garments' : str(b.name, 80), phone: p, message: str(b.message), sender: reply ? 'admin' : 'customer', read_by_admin: reply }).returning();
      return json({ ok: true, id: m.id });
    }
    if (path === '/api/admin/settings' && method === 'GET') { const s = await readSettings(); return json({ ...s, bank_enabled: s.bank_enabled === '1' }); }
    if (path === '/api/admin/settings' && method === 'PUT') {
      const b = await req.json();
      await db.transaction(async tx => {
        for (const key of ['shop_name', 'whatsapp_number', 'bank_name', 'account_title', 'account_number', 'iban', 'payment_instructions', 'bank_enabled']) {
          const value = key === 'bank_enabled' ? (b[key] ? '1' : '0') : str(b[key]);
          await tx.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
        }
      });
      return json({ ok: true });
    }
    if (path === '/api/orders' && method === 'POST') {
      const b = await req.json(), s = await readSettings(), p = phone(b.phone);
      if (!str(b.name) || p.replace(/\D/g, '').length < 7 || !str(b.address) || !Array.isArray(b.items) || !b.items.length || b.items.length > 100) fail('Please fill your name, phone, address and cart.');
      if (!['COD', 'Bank Transfer'].includes(b.payment) || (b.payment === 'Bank Transfer' && s.bank_enabled !== '1')) fail('Choose an available payment method.');
      const code = 'SK' + crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
      const total = await db.transaction(async tx => {
        const combined = new Map<number, number>();
        for (const item of b.items) {
          if (!Number.isInteger(Number(item.id)) || !Number.isInteger(Number(item.qty)) || Number(item.qty) < 1 || Number(item.qty) > 20) fail('Choose a valid quantity.');
          combined.set(Number(item.id), (combined.get(Number(item.id)) || 0) + Number(item.qty));
        }
        const clean = []; let sum = 0;
        for (const [id, qty] of [...combined].sort((a, b) => a[0] - b[0])) {
          const [item] = await tx.select().from(products).where(and(eq(products.id, id), eq(products.active, true))).for('update');
          if (!item || item.stock < qty) fail('A product is unavailable or has insufficient stock.');
          await tx.update(products).set({ stock: item.stock - qty }).where(eq(products.id, id));
          clean.push({ id, name: item.name, price: item.price, qty }); sum += item.price * qty;
        }
        if (sum > 2147483647) fail('This order is too large. Please contact the store.');
        await tx.insert(orders).values({ order_code: code, customer_name: str(b.name, 100), phone: p, address: str(b.address, 500), items_json: JSON.stringify(clean), total: sum, payment_method: b.payment, payment_status: b.payment === 'Bank Transfer' ? 'Awaiting Verification' : 'Unpaid' });
        return sum;
      });
      return json({ ok: true, orderCode: code, total, whatsapp: s.whatsapp_number, message: 'Order received. Save your order code to ask about status.' });
    }
    if (path.startsWith('/api/order/') && method === 'GET') {
      const [o] = await db.select({ order_code: orders.order_code, customer_name: orders.customer_name, total: orders.total, payment_method: orders.payment_method, status: orders.status, payment_status: orders.payment_status, created_at: orders.created_at }).from(orders).where(and(eq(orders.order_code, decodeURIComponent(path.slice(11))), eq(orders.phone, phone(url.searchParams.get('phone')))));
      return o ? json(o) : json({ error: 'Order not found. Check your order code and phone number.' }, 404);
    }
    return json({ error: 'Endpoint not found.' }, 404);
  } catch (error) {
    const e = error as Error & { status?: number };
    return json({ error: e.status ? e.message : 'The store service is temporarily unavailable. Please try again.' }, e.status || 503);
  }
};
export const config = { path: '/api/*' };

import { getDatabase } from '@netlify/database';
import { getUser, refreshSession } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { randomUUID, createHash } from 'node:crypto';

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
function text(value: unknown, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function imageUrl(value: unknown) {
  const url = text(value, 500);
  if (url && !url.startsWith('/') && !/^https:\/\//i.test(url)) throw new Error('Use a local image path or HTTPS image URL.');
  if (url.startsWith('//')) throw new Error('Use a local image path or HTTPS image URL.');
  return url;
}
function phone(value: unknown) { return text(value, 30).replace(/[^\d+()\-\s]/g, ''); }
function validProduct(b: any) {
  return text(b.name, 120) && text(b.category, 60) && Number.isSafeInteger(Number(b.price)) && Number(b.price) >= 0 && Number.isSafeInteger(Number(b.stock)) && Number(b.stock) >= 0;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url), path = url.pathname, method = req.method;
  try {
    // Authentication and role checks run before accessing any private store data.
    let user;
    if (path.startsWith('/api/admin/')) {
      await refreshSession();
      user = await getUser();
      if (!user) return reply({ error: 'Please sign in to the owner panel.' }, 401);
      if (!user.roles?.includes('admin')) return reply({ error: 'This account needs the admin role. The site owner can assign it in Netlify → Identity.' }, 403);
      if (method !== 'GET') {
        if (req.headers.get('origin') !== url.origin) return reply({ error: 'Please submit changes from this website.' }, 403);
      }
      if (path === '/api/admin/me' && method === 'GET') return reply({ email: user.email });
    }
    const db = getDatabase();
    const sql = db.sql;
    if (method === 'POST' && (path === '/api/orders' || path === '/api/chat')) {
      if (req.headers.get('origin') !== url.origin) return reply({error:'Please submit from this website.'},403);
      const windowSeconds = path === '/api/orders' ? 3600 : 600;
      const limit = path === '/api/orders' ? 20 : 30;
      const key = createHash('sha256').update(context.ip + path).digest('hex');
      const [rate] = await sql`INSERT INTO sk_request_limits(key,count,expires_at)
        VALUES (${key},1,NOW()+${windowSeconds} * INTERVAL '1 second')
        ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN sk_request_limits.expires_at<NOW() THEN 1 ELSE sk_request_limits.count+1 END,
        expires_at=CASE WHEN sk_request_limits.expires_at<NOW() THEN NOW()+${windowSeconds} * INTERVAL '1 second' ELSE sk_request_limits.expires_at END
        RETURNING count`;
      if (rate.count > limit) return reply({error:'Too many requests. Please try again later.'},429);
    }
    const settings = async () => Object.fromEntries((await sql`SELECT key,value FROM sk_settings`).map((r: any) => [r.key, r.value]));
    if (path === '/api/store' && method === 'GET') {
      const s = await settings();
      const products = await sql`SELECT id,name,category,price,description,image,stock FROM sk_products WHERE active=TRUE ORDER BY id DESC`;
      return reply({ shopName: s.shop_name, whatsapp: s.whatsapp_number, products, bankEnabled: s.bank_enabled === '1', bank: s.bank_enabled === '1' ? { name: s.bank_name, title: s.account_title, number: s.account_number, iban: s.iban, instructions: s.payment_instructions } : null });
    }
    if (path === '/api/admin/summary' && method === 'GET') {
      const [r] = await sql`SELECT (SELECT COUNT(*)::int FROM sk_products) products,
        (SELECT COUNT(*)::int FROM sk_orders) orders,
        (SELECT COUNT(*)::int FROM sk_orders WHERE status='Pending') pending,
        (SELECT COALESCE(SUM(total),0)::float FROM sk_orders WHERE status IN ('Confirmed','Processing','Shipped','Delivered')) revenue,
        (SELECT COUNT(*)::int FROM sk_messages WHERE sender='customer' AND read_by_admin=FALSE) unread`;
      return reply(r);
    }
    if (path === '/api/admin/products' && method === 'GET') return reply(await sql`SELECT * FROM sk_products ORDER BY id DESC`);
    if ((path === '/api/admin/products' && method === 'POST') || (/^\/api\/admin\/products\/\d+$/.test(path) && method === 'PUT')) {
      const b = await req.json();
      if (!validProduct(b)) return reply({ error: 'Enter a name, category, whole-number price and stock quantity (zero or higher).' }, 400);
      const image = imageUrl(b.image);
      if (method === 'POST') {
        const [p] = await sql`INSERT INTO sk_products(name,category,price,description,image,stock) VALUES (${text(b.name,120)},${text(b.category,60)},${Number(b.price)},${text(b.description,2000)},${image},${Number(b.stock)}) RETURNING id`;
        return reply({ ok: true, id: p.id });
      }
      const rows = await sql`UPDATE sk_products SET name=${text(b.name,120)}, category=${text(b.category,60)}, price=${Number(b.price)}, description=${text(b.description,2000)}, image=${image}, stock=${Number(b.stock)}, active=${b.active !== false} WHERE id=${Number(path.split('/').pop())} RETURNING id`;
      return reply({ ok: rows.length > 0 });
    }
    if (/^\/api\/admin\/products\/\d+$/.test(path) && method === 'DELETE') {
      const r = await sql`DELETE FROM sk_products WHERE id=${Number(path.split('/').pop())} RETURNING id`;
      return reply({ ok: r.length > 0 });
    }
    if (path === '/api/admin/upload' && method === 'POST') {
      const form = await req.formData(), file = form.get('image');
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return reply({ error: 'Choose an image up to 5 MB.' }, 400);
      const types: Record<string,string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
      if (!types[file.type]) return reply({ error: 'Only JPG, PNG, WEBP or GIF images are allowed.' }, 400);
      const key = randomUUID() + '.' + types[file.type];
      await getStore('product-images').set(key, await file.arrayBuffer());
      return reply({ image: '/uploads/' + key });
    }
    if (path.startsWith('/uploads/') && method === 'GET') {
      const key = path.slice('/uploads/'.length);
      if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/.test(key)) return new Response('Not found', { status: 404 });
      const data = await getStore('product-images').get(key, { type: 'arrayBuffer' });
      if (!data) return new Response('Not found', { status: 404 });
      const type = key.endsWith('.jpg') ? 'image/jpeg' : 'image/' + key.split('.').pop();
      return new Response(data, { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }
    if (path === '/api/admin/orders' && method === 'GET') return reply(await sql`SELECT * FROM sk_orders ORDER BY id DESC LIMIT 500`);
    if (/^\/api\/admin\/orders\/\d+$/.test(path) && method === 'PATCH') {
      const b = await req.json();
      if (!['Pending','Confirmed','Processing','Shipped','Delivered','Cancelled'].includes(b.status) || !['Unpaid','Awaiting Verification','Paid','Refunded'].includes(b.payment_status)) return reply({ error: 'Choose valid order and payment statuses.' }, 400);
      const r = await sql`UPDATE sk_orders SET status=${b.status},payment_status=${b.payment_status} WHERE id=${Number(path.split('/').pop())} RETURNING id`;
      return r.length ? reply({ ok: true }) : reply({ error: 'Order not found.' }, 404);
    }
    if (path === '/api/admin/settings' && method === 'GET') { const s = await settings(); return reply({ ...s, bank_enabled: s.bank_enabled === '1' }); }
    if (path === '/api/admin/settings' && method === 'PUT') {
      const b = await req.json();
      for (const k of ['shop_name','whatsapp_number','bank_name','account_title','account_number','iban','payment_instructions']) {
        await sql`INSERT INTO sk_settings(key,value) VALUES (${k},${text(b[k])}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
      }
      await sql`UPDATE sk_settings SET value=${b.bank_enabled ? '1' : '0'} WHERE key='bank_enabled'`;
      return reply({ ok: true });
    }
    if (path === '/api/admin/messages' && method === 'GET') {
      await sql`UPDATE sk_messages SET read_by_admin=TRUE WHERE sender='customer'`;
      const messages = await sql`SELECT * FROM sk_messages ORDER BY id DESC LIMIT 300`;
      return reply(messages.reverse());
    }
    if (path === '/api/chat' && method === 'GET') {
      // The existing chat identifies conversations by phone number.
      const p = phone(url.searchParams.get('phone'));
      return reply(p ? await sql`SELECT id,customer_name,message,sender,created_at FROM sk_messages WHERE phone=${p} ORDER BY id ASC LIMIT 200` : []);
    }
    if ((path === '/api/chat' || path === '/api/admin/messages/reply') && method === 'POST') {
      const b = await req.json(), p = phone(b.phone), message = text(b.message), name = path.includes('/admin/') ? 'SK Garments' : text(b.name,80);
      if (!name || p.replace(/\D/g,'').length < 7 || !message) return reply({ error: 'Enter your name, phone number and message.' }, 400);
      await sql`INSERT INTO sk_messages(customer_name,phone,message,sender,read_by_admin) VALUES (${name},${p},${message},${user ? 'admin' : 'customer'},${!!user})`;
      return reply({ ok: true });
    }
    if (path === '/api/orders' && method === 'POST') {
      const b = await req.json(), name = text(b.name,100), p = phone(b.phone), address = text(b.address,500), payment = b.payment || 'COD';
      if (!name || p.replace(/\D/g,'').length < 7 || !address || !Array.isArray(b.items) || !b.items.length || b.items.length > 100) return reply({ error: 'Please fill your name, phone, address and cart.' }, 400);
      const s = await settings();
      if (!['COD','Bank Transfer'].includes(payment) || (payment === 'Bank Transfer' && s.bank_enabled !== '1')) return reply({ error: 'This payment method is unavailable.' }, 400);
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        let total = 0; const clean = [];
        // Lock products in a stable order to prevent overselling across simultaneous checkouts.
        const quantities = new Map<number,number>();
        for (const item of b.items) {
          const id = Number(item.id), qty = Number(item.qty);
          if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(qty) || qty < 1 || qty > 20) throw new Error('Enter a valid cart quantity between 1 and 20.');
          quantities.set(id,(quantities.get(id)||0)+qty);
        }
        for (const [id,qty] of [...quantities].sort((a,b)=>a[0]-b[0])) {
          const { rows } = await client.query('SELECT id,name,price,stock FROM sk_products WHERE id=$1 AND active=TRUE FOR UPDATE',[id]);
          const product = rows[0];
          if (!product || qty > 20 || product.stock < qty) throw new Error('A product is unavailable or has insufficient stock. Please update your cart.');
          total += product.price * qty;
          clean.push({ id, name: product.name, price: product.price, qty });
          await client.query('UPDATE sk_products SET stock=stock-$1 WHERE id=$2',[qty,id]);
        }
        const code = 'SK' + randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
        await client.query('INSERT INTO sk_orders(order_code,customer_name,phone,address,items_json,total,payment_method,payment_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[code,name,p,address,JSON.stringify(clean),total,payment,payment==='Bank Transfer'?'Awaiting Verification':'Unpaid']);
        await client.query('COMMIT');
        return reply({ ok: true, orderCode: code, total, whatsapp: s.whatsapp_number });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (/^\/api\/order\/[^/]+$/.test(path) && method === 'GET') {
      const [order] = await sql`SELECT order_code,customer_name,total,payment_method,status,payment_status,created_at FROM sk_orders WHERE order_code=${decodeURIComponent(path.split('/').pop()!)} AND phone=${phone(url.searchParams.get('phone'))}`;
      return order ? reply(order) : reply({ error: 'Order not found. Check your order code and phone number.' },404);
    }
    return reply({ error: 'Endpoint not found.' },404);
  } catch (error) {
    // Do not expose database messages, connection details, or authentication internals.
    const message = error instanceof Error ? error.message : '';
    if (['Use a local image path or HTTPS image URL.','Enter a valid cart quantity between 1 and 20.','A product is unavailable or has insufficient stock. Please update your cart.'].includes(message)) return reply({error:message},400);
    return reply({ error: 'The store service is temporarily unavailable. Please try again shortly.' },503);
  }
};
export const config: Config = { path: ['/api/*','/uploads/*'] };

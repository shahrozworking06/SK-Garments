CREATE TABLE sk_products (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price >= 0), description TEXT NOT NULL DEFAULT '',
 image TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE sk_orders (
 id SERIAL PRIMARY KEY, order_code TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL,
 phone TEXT NOT NULL, address TEXT NOT NULL, items_json TEXT NOT NULL,
 total INTEGER NOT NULL, payment_method TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Pending', payment_status TEXT NOT NULL DEFAULT 'Unpaid',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE sk_messages (
 id SERIAL PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
 message TEXT NOT NULL, sender TEXT NOT NULL DEFAULT 'customer',
 read_by_admin BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sk_messages_phone ON sk_messages(phone);
CREATE TABLE sk_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO sk_settings(key,value) VALUES
 ('shop_name','SK GARMENTS'),('whatsapp_number','923196236961'),('bank_enabled','0'),
 ('bank_name',''),('account_title',''),('account_number',''),('iban',''),('payment_instructions','');
INSERT INTO sk_products(name,category,price,description,image,stock) VALUES
 ('Black Drop Shoulder Tee','T-Shirts',1499,'Relaxed fit, soft-feel everyday T-shirt. Add your own sizes and product details in the owner panel.','/tshirts-black-blue-red.png',10),
 ('Blue Graphic Tee','T-Shirts',1499,'A bold blue tee for everyday streetwear. Sample listing — edit price, description and stock.','/tshirts-black-blue-red.png',10),
 ('Classic Black Tee','T-Shirts',1299,'Minimal black T-shirt. Sample listing — replace with your actual product photos.','/tshirt-collection.png',10);

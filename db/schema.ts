import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
export const products = pgTable('products', {
  id: serial().primaryKey(), name: text().notNull(), category: text().notNull(), price: integer().notNull(),
  description: text().notNull().default(''), image: text().notNull().default(''), stock: integer().notNull().default(0),
  active: boolean().notNull().default(true), created_at: timestamp().defaultNow(),
});
export const orders = pgTable('orders', {
  id: serial().primaryKey(), order_code: text().unique().notNull(), customer_name: text().notNull(), phone: text().notNull(),
  address: text().notNull(), items_json: text().notNull(), total: integer().notNull(), payment_method: text().notNull(),
  status: text().notNull().default('Pending'), payment_status: text().notNull().default('Unpaid'), created_at: timestamp().defaultNow(),
});
export const messages = pgTable('messages', {
  id: serial().primaryKey(), customer_name: text().notNull(), phone: text().notNull(), message: text().notNull(),
  sender: text().notNull().default('customer'), read_by_admin: boolean().notNull().default(false), created_at: timestamp().defaultNow(),
});
export const settings = pgTable('settings', { key: text().primaryKey(), value: text().notNull() });

CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"message" text NOT NULL,
	"sender" text DEFAULT 'customer' NOT NULL,
	"read_by_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"order_code" text NOT NULL UNIQUE,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"items_json" text NOT NULL,
	"total" integer NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"payment_status" text DEFAULT 'Unpaid' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL
);

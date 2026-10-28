# SK Garments Pro — owner-managed online store

This is a Node.js web app starter, not just a static mockup. It includes:
- Public storefront, product search and category filters
- Cart and checkout with Cash on Delivery
- Optional bank-transfer details that the owner can enable/disable
- Owner-only login at `/admin`
- Add/edit/delete products, upload product photos, set prices/descriptions/stock
- Order dashboard and order/payment status updates
- Customer website chat with owner replies
- Customer order-status lookup by order code + phone number
- SQLite database stored on the server

## Important security and payment notes
No website can honestly be promised to be impossible to hack. This project uses server-side password hashing, owner-protected APIs, rate limiting, secure HTTP headers and session cookies. Production safety still depends on correct hosting, HTTPS, strong credentials, updates, backups and server configuration.

**Before going live:**
1. Use Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set a strong unique `SESSION_SECRET` (32+ random characters), `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD`. Do not share `.env`.
4. Set `NODE_ENV=production` on an HTTPS host.
5. Deploy on a Node.js host with a persistent disk/volume. The `data/` folder must persist across restarts or products/orders/sessions can be lost.
6. Keep a backup of `data/shop.sqlite` and `public/uploads/`.
7. Test an order, admin login, photo upload, chat and bank settings before sharing the public URL.

## Run locally
```bash
npm install
cp .env.example .env
# Edit .env with your private admin email/password and a long random session secret
npm start
```
Open `http://localhost:3000` for customers and `http://localhost:3000/admin` for the owner dashboard.

## Owner account
The first admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the database is first initialized. If changing the password after the account has already been created, update the `admins` row using a secure one-time admin script or delete the local database only if you are sure you do not need its orders/products. Do not expose a public sign-up form for admin accounts.

## Product photos
In `/admin`, open Products → Add product → choose an image file (JPG/PNG/WEBP/GIF, max 5 MB). Uploaded files are stored in `public/uploads/`.

## Payment methods
- COD works as an order request; it does not charge a card.
- Bank transfer is optional. Enable it in Bank & settings and enter your own verified bank details. The site displays those details at checkout. The owner must manually verify the transfer and mark payment as Paid.
- Card/wallet gateway payments are **not integrated**. For real online payments, open a merchant account with a supported provider (e.g. a Pakistani payment provider) and integrate their official hosted checkout/API. Never collect card numbers/CVV directly in this website.

## Chat limitations
The website chat saves messages in the database and lets the owner reply from `/admin`. The customer must use the same phone number to see their conversation again. The customer chat refreshes periodically; it is not instant WebSocket chat.

## Owner vs customer access
The `/admin` page is visible as a link, but the management APIs require a valid owner session. Customers cannot add/edit/delete products through the public store. For stronger production deployment, add automated backups, monitoring and consider CSRF protection and a persistent session store backed by a managed database.

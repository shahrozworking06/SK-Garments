# SK Garments

The store runs on Netlify with static pages, Netlify Functions, Netlify Database for products, orders, messages and settings, and Netlify Blobs for uploaded product images. Owner authentication and password recovery use Netlify Identity.

## Owner access

Open https://sk-garments91.netlify.app/admin (or `/login`). Sign in with your **store Identity account**, which is separate from your Netlify dashboard account.

If you forgot your password, select **Forgot password?**, enter your store email, and follow the email link to choose a new password. Links that land on the storefront are forwarded to the owner login automatically. Invitations also let you set your password there. Use at least 12 characters.

If you forgot the email, open **Identity** in the [Netlify project dashboard](https://app.netlify.com/projects/sk-garments91/identity) using the Netlify account that owns the project. The user list shows the store account emails. No email addresses or existing passwords are exposed on the public login page.

If there is no owner account:

1. In the project's Identity user list, invite an email address you can access.
2. Open the invitation email and set your password.
3. In Netlify, open that Identity user, add the `admin` role, and save.
4. Return to `/admin` and sign in.

The first admin role must be assigned in Netlify. Public registration does not grant store access. Keep Identity registration invite-only for an owner-only store.

## Deployment

The configuration publishes `public/` and prepares the browser Identity dependency during deployment. Netlify automatically deploys the functions and applies the SQL migration files. Do not manually apply migrations. No separate Express server, local SQLite database, shared password, or session secret is required.

The earlier code used a local SQLite database and required a separate Node server, which did not run on the static Netlify deployment. The checked-out project contained no SQLite data file, and the Netlify database had no public tables when inspected. The new database migrations create store tables with the same three sample products from the original server. Existing data on another host is not automatically imported; retain any original database or uploads for a separate migration if needed.

## Checks

Install dependencies with `npm install --include=dev`. Run `npm run check` and `npm test`. For local platform emulation, use Netlify CLI with `netlify dev --port 8889`.

Checkout calculates prices on the server and reserves stock in a database transaction. Owner APIs require the verified `admin` role. Public checkout and messaging have persistent request limits. Bank transfers still require manual payment verification; no card payment gateway is connected.

Customer chat retains the original phone-based conversation lookup, so it should not be used for sensitive information.

# SK Garments

A Netlify storefront with a private owner dashboard at `/admin`.

## Owner access after deployment

1. Open the SK Garments project in the Netlify dashboard and select **Identity**.
2. Choose **Invite users** and enter your own email address.
3. Open the invitation email, follow its link, and set a new password.
4. In Netlify Identity, open your user record, add the **admin** role, and save.
5. Sign out if needed and sign in again at `/admin` to receive the updated role.

Owner accounts from the previous standalone server are not transferred automatically. The old server password is not the new Identity password. Use **Forgot password?** on the login page for an existing Identity account. Invitations and password-reset emails can return to the homepage; the site forwards these callbacks to the owner login automatically.

Only authenticated Identity users with the server-controlled admin role can access dashboard APIs. Public registration does not grant store management access.

## Hosting and storage

Netlify runs the APIs as Functions. Products, orders, messages, and settings are stored in Netlify Database, with the schema in `db/schema.ts` and deployment migrations in `netlify/database/migrations`. Product image uploads use Netlify Blobs. The initial database includes the three original sample products; previous standalone SQLite data is not imported.

The deployment asset preparation step copies only storefront files to `public` and bundles the Identity browser SDK. Backend files and source archives are excluded from the published site. The configuration replaces the previous invalid install command.

Install dependencies with `npm install --include=dev`. For local development, run `netlify dev --port 8889`. Run `npm run typecheck` for TypeScript validation. Netlify applies database migrations during deployment; do not apply them manually.

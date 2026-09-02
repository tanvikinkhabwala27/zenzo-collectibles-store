# Zenzo Production Deployment

## Production Platform

Zenzo deploys from the `main` branch on GitHub to Vercel. Vercel serves the
storefront, runs the API routes, provisions HTTPS, and publishes the custom
domain.

The production data store is a private Vercel Blob store:

- `zenzo-data/products.json` stores admin-managed inventory and product images.
- `zenzo-data/orders.json` stores customer orders and payment status.
- The bundled `data/products.json` file seeds the private store on its first read.

Local development continues to use JSON files on disk and does not require
Vercel credentials.

## Vercel Project Setup

1. Import `tanvikinkhabwala27/zenzo-collectibles-store` in Vercel.
2. Keep the root directory at the repository root.
3. Use the `Other` framework preset. No build command or output directory is
   required.
4. In the project Storage tab, create a private Blob store and connect it to
   Production, Preview, and Development. Vercel supplies
   `BLOB_READ_WRITE_TOKEN` automatically.
5. Add the production environment variables below.
6. Deploy `main` and test the generated `vercel.app` URL.
7. Add `zenzo.org.in` and `www.zenzo.org.in` in Project Settings > Domains.

Every later push to `main` automatically creates a production deployment.

## Environment Variables

Set these for Production, Preview, and Development unless a value is intended
only for live payments:

```text
ADMIN_EMAIL=zenzo.org@gmail.com
ADMIN_PASSWORD=use-a-new-strong-password
SESSION_SECRET=use-a-long-random-secret
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=use-the-secret-from-razorpay-webhook-settings
```

The Blob store connection adds `BLOB_READ_WRITE_TOKEN`; do not copy that token
into GitHub or source files.

## Razorpay Webhook

After the custom domain is active, configure Razorpay to send `order.paid`
events to:

```text
https://zenzo.org.in/api/webhooks/razorpay
```

Use the same signing secret for the Vercel `RAZORPAY_WEBHOOK_SECRET` variable.

## Local Development

```bash
npm install
npm start
```

Open `http://127.0.0.1:8092`.

## Production Checks

Before switching DNS, verify on the generated Vercel URL:

- Storefront products and collection filters load.
- Product details and cart navigation work.
- Checkout creates an order.
- Razorpay opens when live keys are configured.
- Admin login succeeds.
- An admin-added test product remains after a redeploy.

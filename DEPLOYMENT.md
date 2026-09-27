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

`ADMIN_PASSWORD` and `SESSION_SECRET` are both required in production; admin
login stays disabled until both are set.

The Blob store connection adds `BLOB_READ_WRITE_TOKEN`; do not copy that token
into GitHub or source files.

## UPI Payments (Razorpay)

UPI is collected through Razorpay Checkout; the store never shows a UPI ID.
The checkout opens with UPI listed first, and cards/netbanking stay available
below it.

1. Create a Razorpay account and complete KYC. Live keys and UPI are only
   enabled after activation.
2. In Razorpay Dashboard > Account & Settings > Payment methods, confirm UPI
   is enabled.
3. In Dashboard > Account & Settings > API Keys, generate a key pair and set
   `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Vercel. Use `rzp_test_`
   keys on Preview to test first.
4. Redeploy so the new variables take effect.

### Order lifecycle

1. **Awaiting payment** – the buyer clicks *Pay securely*. The site saves the
   order, creates a Razorpay order, and remembers it in the buyer's browser.
2. **Paid** – set by whichever of these happens first:
   - the payment window reports success and the site checks Razorpay's
     signature (`/api/orders/verify`);
   - the buyer comes back from their UPI app or reloads the page, and the site
     asks Razorpay whether the order was paid (`/api/orders/status`);
   - Razorpay's webhook reports the payment;
   - you open the admin *Customer orders* list or press *Check payment*.
   Payments that are only authorized are captured automatically, so they
   settle instead of being refunded.
3. **Dispatched / Delivered** – you mark these in the admin page.

The buyer sees an order confirmation screen with their order ID once paid, and
their cart is cleared. If they close the payment window and try again, the
same Razorpay order is reused, so nobody can be charged twice for one cart.

### Webhook

After the custom domain is active, add a webhook in Razorpay Dashboard >
Account & Settings > Webhooks for the `order.paid`, `payment.captured` and
`payment.authorized` events, pointing to:

```text
https://zenzo.org.in/api/webhooks/razorpay
```

Use the same signing secret for the Vercel `RAZORPAY_WEBHOOK_SECRET` variable.
The webhook rejects every request until that secret is set.

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
- Razorpay opens with UPI first when keys are configured.
- A test-mode UPI payment (`success@razorpay`) marks the order `paid`.
- Admin login succeeds.
- An admin-added test product remains after a redeploy.

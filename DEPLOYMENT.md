# Zenzo Production Deployment

## What Is Ready

- Node production server: `server.js`
- Static storefront served by the same server
- Server-backed product inventory in `data/products.json`
- Server-backed orders in `data/orders.json`
- Admin login via HttpOnly session cookie
- Razorpay order creation endpoint
- Razorpay webhook endpoint for `order.paid`
- Checkout no longer exposes the raw UPI ID

## Recommended Hosting

Use Render for the first stable client share. This app is a Node web service, not just static HTML, because admin login, product edits, orders, and Razorpay webhooks run through `server.js`.

The repo includes `render.yaml`, which creates:

- A public Node web service
- A Singapore region deployment for better India latency
- A 1 GB persistent disk mounted at `/var/data`
- `DATA_DIR=/var/data` so product/order changes survive redeploys
- Secret placeholders for the admin password and Razorpay keys

Render will provide a stable URL like:

```text
https://zenzo-store.onrender.com
```

You can add a custom domain later.

## Required Production Accounts

1. Hosting provider for a Node app: Render is recommended for this version.
2. Razorpay merchant account with live API keys.
3. Domain name for the storefront.
4. Business email access for `zenzo.org@gmail.com`.

## Environment Variables

Set these on the hosting provider:

```bash
ADMIN_EMAIL=zenzo.org@gmail.com
ADMIN_PASSWORD=use-a-new-strong-password
SESSION_SECRET=use-a-long-random-secret
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=use-the-secret-from-razorpay-webhook-settings
DATA_DIR=/var/data
```

Do not set `PORT` manually on Render. Render provides it automatically.

## Run Locally

```bash
node server.js
```

Then open:

```text
http://127.0.0.1:8092
```

## Razorpay Setup

1. Create a Razorpay merchant account.
2. Complete KYC and enable live payments.
3. Generate live API keys.
4. Add the keys to the hosting provider environment variables.
5. Add a webhook in Razorpay pointing to:

```text
https://YOUR_DOMAIN/api/webhooks/razorpay
```

6. Subscribe to `order.paid`.
7. Use the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.

## Render Deploy Steps

1. Push `outputs/hotwheels-store` to a GitHub repository.
2. In Render, create a new Blueprint or Web Service from that repository.
3. If using the blueprint, Render reads `render.yaml`.
4. Set the secret values that are marked `sync: false`.
5. Deploy.
6. Open the `onrender.com` URL and test:
   - Shop page
   - Product details
   - Checkout
   - Admin login
   - Adding a product

## Manual Deploy Command

The production start command is:

```bash
npm start
```

No build command is needed.

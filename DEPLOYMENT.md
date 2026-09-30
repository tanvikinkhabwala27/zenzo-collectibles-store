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
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Zenzo <orders@zenzo.org.in>
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
SITE_URL=https://zenzo.org.in
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

## Checkout and Customer Accounts

Checkout works as a guest: buyers never have to sign in. Signed-in buyers
get their details filled in from their last order. After paying, guests are
offered an account with their email already filled in.

When Resend is set up (below), buyers also get emails:

- **Order confirmed** – when payment is received.
- **Dispatched** – when you press *Mark dispatched* in admin. The courier and
  tracking number you enter there is included, and also shows on the
  customer's *My orders* page.

`SITE_URL` sets the link in those emails (defaults to `https://zenzo.org.in`).

### Customer accounts

Customers open **My orders** (`/account.html`) to see their paid orders.
Orders are matched to the email address used at checkout.

- **One-time email code** – no account needed; a 6-digit code is emailed.
- **Create account** – the email is confirmed with a code, then the customer
  chooses a password. *Forgot password?* uses the same code step.
- **Email and password** – for returning customers with an account.
- **Continue with Google** – for returning customers; uses their verified
  Google email.

Every option needs `SESSION_SECRET`. Options whose service is not configured
are hidden; with neither service set up, the page says sign-in is being set
up.

### Email codes (Resend)

1. Create an account at resend.com and add the `zenzo.org.in` domain under
   **Domains**, then add the DNS records it shows at the domain registrar.
2. Create an API key under **API Keys** and set `RESEND_API_KEY` in Vercel.
3. Set `EMAIL_FROM` to a sender on that domain, for example
   `Zenzo <orders@zenzo.org.in>`.

### Google sign-in

1. In Google Cloud Console, open **APIs & Services > OAuth consent screen**
   and set it up as an external app named Zenzo.
2. In **Credentials**, create an **OAuth client ID** of type *Web
   application*. Under **Authorized JavaScript origins**, add
   `https://zenzo.org.in`, `https://www.zenzo.org.in` and the `vercel.app`
   URL.
3. Set the client ID as `GOOGLE_CLIENT_ID` in Vercel. No client secret is
   needed.

Redeploy after adding these variables.

## Private Preview (password lock)

Set `SITE_PASSWORD` in Vercel (Production) and redeploy to make the whole shop
private. Visitors see a password page first and stay signed in for 30 days on
that device. `SESSION_SECRET` must also be set.

- Change `SITE_PASSWORD` to sign everyone out; share the new one with the
  people who should keep access.
- Delete `SITE_PASSWORD` and redeploy to open the shop to the public again.
- Razorpay webhooks still reach the site while it is locked. Admin keeps its
  own login on top of the shared password.

On Vercel the lock is enforced by `middleware.js`, because static pages are
served without reaching `server.js`; `server.js` applies the same rule for
local and other hosting.

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

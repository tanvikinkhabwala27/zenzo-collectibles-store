const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const rootDir = __dirname;
const bundledDataDir = path.join(rootDir, "data");
const dataDir = process.env.DATA_DIR || bundledDataDir;
const productsFile = path.join(dataDir, "products.json");
const ordersFile = path.join(dataDir, "orders.json");
const loginCodesFile = path.join(dataDir, "login-codes.json");
const customersFile = path.join(dataDir, "customers.json");
const collections = ["Hot Wheels", "Figurines", "3D collectibles", "Accessories"];
const isVercel = Boolean(process.env.VERCEL);
const isProduction = isVercel || Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
const usesBlobStorage = isVercel && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const port = Number(process.env.PORT || 8092);
const host = process.env.HOST || "0.0.0.0";
let blobClientPromise;

const config = {
  adminEmail: (process.env.ADMIN_EMAIL || "zenzo.org@gmail.com").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || (isProduction ? "" : "dev-change-this-session-secret"),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  siteUrl: (process.env.SITE_URL || "https://zenzo.org.in").replace(/\/$/, "")
};

const customerSessionDays = 30;
const loginCodeMinutes = 10;
const maxCodeAttempts = 5;

const maxPublicBodyBytes = 64 * 1024;
const maxAdminBodyBytes = 4 * 1024 * 1024;
const publicScripts = new Set(["app.js", "product.js", "checkout.js", "admin.js", "account.js", "showcase-images.js"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders,
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(payload);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((cookie) => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function safeEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const right = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function adminConfigured() {
  return Boolean(config.adminPassword && config.sessionSecret);
}

function sign(value) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

function makeToken(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !config.sessionSecret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function makeSession(email) {
  return makeToken({ kind: "admin", email, exp: Date.now() + 1000 * 60 * 60 * 8 });
}

function customerCookie(email) {
  const maxAge = customerSessionDays * 24 * 60 * 60;
  const token = makeToken({ kind: "customer", email, exp: Date.now() + maxAge * 1000 });
  return `zenzo_customer=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${isVercel ? "; Secure" : ""}`;
}

function customerEmail(req) {
  const data = readToken(parseCookies(req).zenzo_customer);
  return data?.kind === "customer" ? data.email : null;
}

function verifySession(req) {
  if (!adminConfigured()) return false;
  const data = readToken(parseCookies(req).zenzo_session);
  return data?.kind === "admin" && data.email === config.adminEmail;
}

async function readFileJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeFileJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

function blobPath(file) {
  return `zenzo-data/${path.basename(file)}`;
}

function getBlobClient() {
  blobClientPromise ||= import("@vercel/blob");
  return blobClientPromise;
}

async function readBlobEntry(file, fallback, { fresh = false } = {}) {
  const { get, put } = await getBlobClient();
  const pathname = blobPath(file);
  const result = await get(pathname, { access: "private", useCache: !fresh });
  if (result?.statusCode === 200) {
    return { data: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag };
  }

  const bundled = await readFileJson(path.join(bundledDataDir, path.basename(file)), fallback);
  try {
    const created = await put(pathname, JSON.stringify(bundled, null, 2), {
      access: "private",
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      contentType: "application/json"
    });
    return { data: bundled, etag: created.etag };
  } catch {
    const seeded = await get(pathname, { access: "private", useCache: false });
    if (seeded?.statusCode === 200) {
      return { data: JSON.parse(await new Response(seeded.stream).text()), etag: seeded.blob.etag };
    }
    throw new Error("Unable to initialize persistent storage.");
  }
}

async function readJson(file, fallback, { fresh = false } = {}) {
  if (usesBlobStorage) return (await readBlobEntry(file, fallback, { fresh })).data;
  const source = isVercel ? path.join(bundledDataDir, path.basename(file)) : file;
  return readFileJson(source, fallback);
}

function storageNotConfigured() {
  const error = new Error("Persistent storage is not configured yet.");
  error.statusCode = 503;
  return error;
}

// Read-modify-write that never overwrites a concurrent change: blob writes
// are conditional on the ETag that was read, and retried on conflict.
async function updateJson(file, fallback, mutate) {
  if (!usesBlobStorage) {
    if (isVercel) throw storageNotConfigured();
    const value = await readFileJson(file, fallback);
    const result = await mutate(value);
    await writeFileJson(file, value);
    return result;
  }

  const { put, BlobPreconditionFailedError } = await getBlobClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, etag } = await readBlobEntry(file, fallback, { fresh: true });
    const result = await mutate(data);
    try {
      await put(blobPath(file), JSON.stringify(data, null, 2), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: etag,
        cacheControlMaxAge: 60,
        contentType: "application/json"
      });
      return result;
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
  }
  throw new Error("Storage is busy. Please try again.");
}

async function copyIfMissing(source, destination, fallback) {
  try {
    await fs.access(destination);
  } catch {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.copyFile(source, destination);
    } catch {
      await fs.writeFile(destination, JSON.stringify(fallback, null, 2));
    }
  }
}

async function seedDataFiles() {
  if (isVercel) return;
  await copyIfMissing(path.join(bundledDataDir, "products.json"), productsFile, []);
  await copyIfMissing(path.join(bundledDataDir, "orders.json"), ordersFile, []);
}

async function readRawBody(req, limit = maxPublicBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBody(req, limit) {
  const raw = await readRawBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    const error = new Error("Invalid request body.");
    error.statusCode = 400;
    throw error;
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cleanText(value, label, { max = 200, required = false, markup = /[<>"`]/ } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw badRequest(`${label} is required.`);
  if (text.length > max) throw badRequest(`${label} is too long.`);
  if (markup.test(text)) throw badRequest(`${label} contains characters that are not allowed.`);
  return text;
}

function cleanImage(value) {
  const image = String(value || "").trim();
  if (!image) return "";
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return image;
  if (/^assets\/[A-Za-z0-9._/-]+$/.test(image) && !image.includes("..")) return image;
  throw badRequest("Product image is not a supported image.");
}

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeProduct(input) {
  const name = cleanText(input.name, "Product name", { required: true });
  return {
    id: `admin-${slugify(name)}-${Date.now()}`,
    name,
    collection: collections.includes(input.collection) ? input.collection : "Hot Wheels",
    series: cleanText(input.series || "Assorted Hot Wheels", "Series"),
    year: Number(input.year) || new Date().getFullYear(),
    condition: cleanText(input.condition || "Sealed Pack", "Condition"),
    price: Math.max(0, Math.round(Number(input.price) || 0)),
    stock: Math.max(0, Math.round(Number(input.stock) || 0)),
    image: cleanImage(input.image),
    imageAlt: cleanText(input.imageAlt || name, "Image description"),
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: cleanText(input.notes, "Notes", { max: 2000 })
  };
}

function normalizeCheckout(body) {
  const customer = body.customer || {};
  const shipping = body.shipping || {};
  const email = cleanText(customer.email, "Email", { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Enter a valid email address.");
  const phone = cleanText(customer.phone, "Mobile number", { required: true, max: 20 });
  if (!/^[0-9+\-\s]{8,20}$/.test(phone)) throw badRequest("Enter a valid mobile number.");
  const pin = cleanText(shipping.pin, "PIN code", { required: true, max: 6 });
  if (!/^[1-9][0-9]{5}$/.test(pin)) throw badRequest("Enter a valid 6-digit PIN code.");
  return {
    customer: {
      name: cleanText(customer.name, "Name", { required: true, max: 100 }),
      email,
      phone
    },
    shipping: {
      address: cleanText(shipping.address, "Address", { required: true, max: 500, markup: /[<>]/ }),
      city: cleanText(shipping.city, "City", { required: true, max: 100 }),
      state: cleanText(shipping.state, "State", { required: true, max: 100 }),
      pin
    }
  };
}

function razorpayConfigured() {
  return Boolean(config.razorpayKeyId && config.razorpayKeySecret);
}

async function razorpayRequest(method, pathname, body) {
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${pathname}`, {
    method,
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.description || "Razorpay request failed.");
  }
  return data;
}

async function createRazorpayOrder(order) {
  if (!razorpayConfigured()) return null;
  return razorpayRequest("POST", "/orders", {
    amount: order.total * 100,
    currency: "INR",
    receipt: order.id,
    notes: {
      order_id: order.id,
      customer_email: order.customer.email
    }
  });
}

// Captures an authorized payment so it settles instead of being auto-refunded
// when the Razorpay account is not set to capture automatically.
async function capturePayment(payment) {
  if (payment.status !== "authorized") return payment;
  return razorpayRequest("POST", `/payments/${encodeURIComponent(payment.id)}/capture`, {
    amount: payment.amount,
    currency: payment.currency
  });
}

// Asks Razorpay whether an order has been paid and records it. This closes the
// loop when the buyer's browser never returned from the UPI app.
async function reconcileOrder(order) {
  if (!order || order.status !== "payment_pending" || !order.razorpayOrderId || !razorpayConfigured()) {
    return order;
  }
  const { items = [] } = await razorpayRequest("GET", `/orders/${encodeURIComponent(order.razorpayOrderId)}/payments`);
  let payment = items.find((item) => item.status === "captured")
    || items.find((item) => item.status === "authorized");
  if (!payment) return order;
  payment = await capturePayment(payment);
  if (payment.status !== "captured") return order;
  return (await markOrderPaid(order.razorpayOrderId, payment.id)) || order;
}

async function findOrder(predicate) {
  const orders = await readJson(ordersFile, [], { fresh: true });
  return orders.find(predicate) || null;
}

function publicOrder(order) {
  return {
    orderId: order.id,
    status: order.status,
    total: order.total,
    items: order.items.map(({ name, quantity, price }) => ({ name, quantity, price })),
    paidAt: order.paidAt || null
  };
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function markOrderPaid(razorpayOrderId, paymentId) {
  const order = await updateJson(ordersFile, [], (orders) => {
    const match = orders.find((item) => item.razorpayOrderId === razorpayOrderId);
    if (!match) return null;
    if (match.paidAt) return { order: match, newlyPaid: false };
    match.status = "paid";
    match.paidAt = new Date().toISOString();
    if (paymentId) match.razorpayPaymentId = paymentId;
    return { order: match, newlyPaid: true };
  });
  if (!order) return null;
  if (order.newlyPaid) {
    await sendOrderEmail(order.order, "confirmed");
    await updateJson(productsFile, [], (products) => {
      for (const line of order.order.items) {
        const product = products.find((item) => item.id === line.id);
        if (product) product.stock = Math.max(0, product.stock - line.quantity);
      }
    });
  }
  return order.order;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>"`]+@[^\s@<>"`]+\.[^\s@<>"`]+$/.test(email)) {
    throw badRequest("Enter a valid email address.");
  }
  return email;
}

function hashLoginCode(email, code) {
  return crypto.createHmac("sha256", config.sessionSecret).update(`login:${email}:${code}`).digest("hex");
}

function emailLoginConfigured() {
  return Boolean(config.resendApiKey && config.emailFrom && config.sessionSecret);
}

function googleLoginConfigured() {
  return Boolean(config.googleClientId && config.sessionSecret);
}

async function sendEmail({ to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text, html })
  });
  if (!response.ok) {
    console.error("Unable to send email", subject, response.status, await response.text());
    throw new Error("We couldn't send the email right now. Please try again shortly.");
  }
}

async function sendLoginCode(email, code) {
  await sendEmail({
    to: email,
    subject: `Your Zenzo sign-in code: ${code}`,
    text: `Your Zenzo sign-in code is ${code}. It expires in ${loginCodeMinutes} minutes. If you did not ask for it, you can ignore this email.`,
    html: `<p>Your Zenzo sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${loginCodeMinutes} minutes. If you did not ask for it, you can ignore this email.</p>`
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

const orderEmailCopy = {
  confirmed: {
    subject: (order) => `Order confirmed: ${order.id}`,
    heading: "Thank you! Your order is confirmed.",
    body: "We've received your payment and will pack your order soon. We'll email you again when it ships."
  },
  dispatched: {
    subject: (order) => `Your Zenzo order ${order.id} is on its way`,
    heading: "Your order has been dispatched.",
    body: "Your collectibles are on their way to you."
  }
};

// Order updates are best effort: a failed email never blocks a payment or
// status change, it is only logged.
async function sendOrderEmail(order, kind) {
  const email = order.customer?.email;
  if (!config.resendApiKey || !config.emailFrom || !email) return;
  const copy = orderEmailCopy[kind];
  const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  const lines = order.items.map((item) => `${item.name} x ${item.quantity} - ${money(item.price * item.quantity)}`);
  const shipping = order.shipping || {};
  const address = [shipping.address, shipping.city, shipping.state, shipping.pin].filter(Boolean).join(", ");
  const tracking = kind === "dispatched" && order.tracking ? `Tracking: ${order.tracking}` : "";
  const ordersUrl = `${config.siteUrl}/account.html`;
  const text = [
    `Hi ${order.customer.name || "there"},`,
    "",
    copy.heading,
    copy.body,
    tracking,
    "",
    `Order ${order.id}`,
    ...lines,
    `Total: ${money(order.total)}`,
    "",
    `Delivering to: ${address}`,
    "",
    `See your orders any time: ${ordersUrl}`
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1d1d1f;max-width:560px">
      <p>Hi ${escapeHtml(order.customer.name || "there")},</p>
      <h2 style="margin:0 0 8px">${copy.heading}</h2>
      <p>${copy.body}</p>
      ${tracking ? `<p><strong>${escapeHtml(tracking)}</strong></p>` : ""}
      <p style="margin-top:20px"><strong>Order ${escapeHtml(order.id)}</strong></p>
      <table style="width:100%;border-collapse:collapse">
        ${order.items.map((item) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(item.name)} &times; ${item.quantity}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${money(item.price * item.quantity)}</td></tr>`).join("")}
        <tr><td style="padding:8px 0"><strong>Total</strong></td><td style="padding:8px 0;text-align:right"><strong>${money(order.total)}</strong></td></tr>
      </table>
      <p>Delivering to: ${escapeHtml(address)}</p>
      <p><a href="${ordersUrl}">See your orders</a></p>
    </div>`;
  try {
    await sendEmail({ to: email, subject: copy.subject(order), text, html });
  } catch (error) {
    console.error("Order email failed", order.id, kind, error.message);
  }
}

let googleKeys = { keys: [], expiresAt: 0 };

async function googleSigningKey(kid) {
  if (Date.now() > googleKeys.expiresAt || !googleKeys.keys.some((key) => key.kid === kid)) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!response.ok) throw new Error("Unable to reach Google. Please try again.");
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3600);
    googleKeys = { keys: (await response.json()).keys || [], expiresAt: Date.now() + maxAge * 1000 };
  }
  const jwk = googleKeys.keys.find((key) => key.kid === kid);
  return jwk ? crypto.createPublicKey({ key: jwk, format: "jwk" }) : null;
}

// Verifies a Google Identity Services ID token and returns its verified email.
async function verifyGoogleCredential(credential) {
  const unauthorized = badRequest("Google sign-in could not be verified.");
  const parts = String(credential || "").split(".");
  if (parts.length !== 3) throw unauthorized;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw unauthorized;
  }
  if (header.alg !== "RS256") throw unauthorized;
  const key = await googleSigningKey(header.kid);
  const valid = key && crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url")
  );
  if (!valid) throw unauthorized;
  const issuerOk = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  if (!issuerOk || claims.aud !== config.googleClientId || claims.exp * 1000 < Date.now()) throw unauthorized;
  if (claims.email_verified !== true || !claims.email) throw badRequest("Your Google account email is not verified.");
  return normalizeEmail(claims.email);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function passwordMatches(password, stored) {
  const [, salt, expected] = String(stored || "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$").split("$");
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(salt, "base64"), 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
  const expectedHash = Buffer.from(expected || "", "base64");
  return expectedHash.length === hash.length && crypto.timingSafeEqual(hash, expectedHash);
}

function cleanPassword(value) {
  const password = String(value || "");
  if (password.length < 8) throw badRequest("Use a password of at least 8 characters.");
  if (password.length > 128) throw badRequest("That password is too long.");
  return password;
}

function customerOrder(order) {
  return {
    ...publicOrder(order),
    createdAt: order.createdAt,
    dispatchedAt: order.dispatchedAt || null,
    deliveredAt: order.deliveredAt || null,
    tracking: order.tracking || null,
    shipping: order.shipping,
    contact: { name: order.customer?.name || "", phone: order.customer?.phone || "" }
  };
}

// Corrections for products saved before they had the right collection. A fix
// only applies while the collection is still unset, so later admin edits win.
const productFixes = {
  "admin-f1-stand-1783480383065": {
    collection: "3D collectibles",
    series: "Display Stands",
    notes: "3D printed display stand for Formula 1 die-cast cars."
  }
};

function applyProductFixes(products) {
  let changed = false;
  for (const product of products) {
    const fix = productFixes[product.id];
    if (fix && !product.collection) {
      Object.assign(product, fix);
      changed = true;
    }
  }
  return changed;
}

async function handleAccountApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/account/config") {
    return send(res, 200, {
      emailCode: emailLoginConfigured(),
      passwords: Boolean(config.sessionSecret),
      googleClientId: googleLoginConfigured() ? config.googleClientId : null
    });
  }

  if (req.method === "GET" && url.pathname === "/api/account/me") {
    return send(res, 200, { email: customerEmail(req) });
  }

  if (req.method === "POST" && url.pathname === "/api/account/logout") {
    return send(res, 200, { ok: true }, {
      "set-cookie": `zenzo_customer=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isVercel ? "; Secure" : ""}`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/account/code") {
    if (!emailLoginConfigured()) return send(res, 503, { error: "Email sign-in is not available yet." });
    const email = normalizeEmail((await readBody(req)).email);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const now = Date.now();
    const allowed = await updateJson(loginCodesFile, {}, (codes) => {
      for (const [key, entry] of Object.entries(codes)) {
        if (now - entry.windowStart > 60 * 60 * 1000 && entry.expiresAt < now) delete codes[key];
      }
      const entry = codes[email] || { windowStart: now, sent: 0 };
      if (now - entry.windowStart > 60 * 60 * 1000) Object.assign(entry, { windowStart: now, sent: 0 });
      if (entry.sentAt && now - entry.sentAt < 60 * 1000) return "wait";
      if (entry.sent >= 5) return "limit";
      Object.assign(entry, {
        hash: hashLoginCode(email, code),
        expiresAt: now + loginCodeMinutes * 60 * 1000,
        attempts: 0,
        sentAt: now,
        sent: entry.sent + 1
      });
      codes[email] = entry;
      return "ok";
    });
    if (allowed === "wait") return send(res, 429, { error: "Please wait a minute before asking for another code." });
    if (allowed === "limit") return send(res, 429, { error: "Too many codes requested. Please try again in an hour." });
    await sendLoginCode(email, code);
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/account/verify") {
    if (!emailLoginConfigured()) return send(res, 503, { error: "Email sign-in is not available yet." });
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || "").trim();
    const password = body.password === undefined ? null : cleanPassword(body.password);
    const result = await updateJson(loginCodesFile, {}, (codes) => {
      const entry = codes[email];
      if (!entry?.hash || entry.expiresAt < Date.now()) return "expired";
      if (entry.attempts >= maxCodeAttempts) return "locked";
      if (!/^\d{6}$/.test(code) || !safeEqual(entry.hash, hashLoginCode(email, code))) {
        entry.attempts += 1;
        return entry.attempts >= maxCodeAttempts ? "locked" : "wrong";
      }
      delete entry.hash;
      return "ok";
    });
    if (result === "expired") return send(res, 400, { error: "That code has expired. Please ask for a new one." });
    if (result === "locked") return send(res, 400, { error: "Too many wrong attempts. Please ask for a new code." });
    if (result === "wrong") return send(res, 400, { error: "That code is not right. Please check and try again." });
    if (password) {
      const passwordHash = await hashPassword(password);
      await updateJson(customersFile, {}, (customers) => {
        customers[email] = {
          ...customers[email],
          passwordHash,
          createdAt: customers[email]?.createdAt || new Date().toISOString(),
          failedLogins: 0,
          lockedUntil: 0
        };
      });
    }
    return send(res, 200, { email }, { "set-cookie": customerCookie(email) });
  }

  if (req.method === "POST" && url.pathname === "/api/account/login") {
    if (!config.sessionSecret) return send(res, 503, { error: "Sign-in is not available yet." });
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "").slice(0, 128);
    const customers = await readJson(customersFile, {}, { fresh: true });
    const account = customers[email];
    if (account?.lockedUntil > Date.now()) {
      return send(res, 429, { error: "Too many attempts. Please try again in 15 minutes or use \"Forgot password\"." });
    }
    // Always run the hash so unknown emails take as long as wrong passwords.
    const valid = await passwordMatches(password, account?.passwordHash);
    if (!account?.passwordHash || !valid) {
      if (account) {
        await updateJson(customersFile, {}, (latest) => {
          const entry = latest[email];
          if (!entry) return;
          entry.failedLogins = (entry.failedLogins || 0) + 1;
          if (entry.failedLogins >= 5) {
            entry.failedLogins = 0;
            entry.lockedUntil = Date.now() + 15 * 60 * 1000;
          }
        });
      }
      return send(res, 401, { error: "Email or password is not right." });
    }
    if (account.failedLogins) {
      await updateJson(customersFile, {}, (latest) => {
        if (latest[email]) latest[email].failedLogins = 0;
      });
    }
    return send(res, 200, { email }, { "set-cookie": customerCookie(email) });
  }

  if (req.method === "POST" && url.pathname === "/api/account/google") {
    if (!googleLoginConfigured()) return send(res, 503, { error: "Google sign-in is not available yet." });
    const email = await verifyGoogleCredential((await readBody(req, 16 * 1024)).credential);
    return send(res, 200, { email }, { "set-cookie": customerCookie(email) });
  }

  if (req.method === "GET" && url.pathname === "/api/account/orders") {
    const email = customerEmail(req);
    if (!email) return send(res, 401, { error: "Please sign in to see your orders." });
    const orders = (await readJson(ordersFile, [], { fresh: true }))
      .filter((order) => String(order.customer?.email || "").toLowerCase() === email && order.paidAt);
    return send(res, 200, orders.map(customerOrder));
  }

  return send(res, 404, { error: "Not found." });
}

async function handleApi(req, res, url) {
  if (url.pathname.startsWith("/api/account/")) return handleAccountApi(req, res, url);

  if (req.method === "GET" && url.pathname === "/api/products") {
    const products = await readJson(productsFile, []);
    if (applyProductFixes(products)) {
      try {
        await updateJson(productsFile, [], (latest) => {
          applyProductFixes(latest);
        });
      } catch (error) {
        console.error("Unable to save product fixes", error);
      }
    }
    return send(res, 200, products);
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    if (!adminConfigured()) {
      return send(res, 503, { error: "Admin login is not configured." });
    }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const emailMatches = safeEqual(email, config.adminEmail);
    const passwordMatches = safeEqual(password, config.adminPassword);
    if (!emailMatches || !passwordMatches) {
      return send(res, 401, { error: "Incorrect email or password." });
    }
    return send(res, 200, { ok: true }, {
      "set-cookie": `zenzo_session=${encodeURIComponent(makeSession(email))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${isVercel ? "; Secure" : ""}`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    return send(res, 200, { ok: true }, {
      "set-cookie": `zenzo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isVercel ? "; Secure" : ""}`
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/session") {
    return send(res, 200, { authenticated: verifySession(req) });
  }

  if (url.pathname.startsWith("/api/admin/") && !verifySession(req)) {
    return send(res, 401, { error: "Admin login required." });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/products") {
    const product = normalizeProduct(await readBody(req, maxAdminBodyBytes));
    await updateJson(productsFile, [], (products) => {
      products.unshift(product);
    });
    return send(res, 201, product);
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/products/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const body = await readBody(req);
    const collection = cleanText(body.collection, "Collection");
    if (!collections.includes(collection)) return send(res, 400, { error: "Unknown collection." });
    const changes = {
      collection,
      series: cleanText(body.series, "Series", { required: true }),
      price: Math.max(0, Math.round(Number(body.price) || 0)),
      stock: Math.max(0, Math.round(Number(body.stock) || 0)),
      notes: cleanText(body.notes, "Notes", { max: 2000 })
    };
    const product = await updateJson(productsFile, [], (products) => {
      const match = products.find((item) => item.id === id);
      if (match) Object.assign(match, changes);
      return match || null;
    });
    if (!product) return send(res, 404, { error: "Product not found." });
    return send(res, 200, product);
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/products/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    await updateJson(productsFile, [], (products) => {
      const index = products.findIndex((product) => product.id === id);
      if (index !== -1) products.splice(index, 1);
    });
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/orders") {
    const recentPending = (await readJson(ordersFile, [], { fresh: true }))
      .filter((order) => order.status === "payment_pending" && Date.now() - Date.parse(order.createdAt) < 1000 * 60 * 60 * 72)
      .slice(0, 5);
    await Promise.allSettled(recentPending.map(reconcileOrder));
    return send(res, 200, await readJson(ordersFile, [], { fresh: true }));
  }

  if (req.method === "POST" && /^\/api\/admin\/orders\/[^/]+\/refresh$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    const order = await findOrder((item) => item.id === id);
    if (!order) return send(res, 404, { error: "Order not found." });
    return send(res, 200, await reconcileOrder(order));
  }

  if (req.method === "POST" && /^\/api\/admin\/orders\/[^/]+\/status$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    const body = await readBody(req);
    const { status } = body;
    if (!["dispatched", "delivered", "cancelled"].includes(status)) {
      return send(res, 400, { error: "Unknown order status." });
    }
    const tracking = cleanText(body.tracking, "Tracking details", { max: 200 });
    let newlyDispatched = false;
    const order = await updateJson(ordersFile, [], (orders) => {
      const match = orders.find((item) => item.id === id);
      if (!match) return null;
      newlyDispatched = status === "dispatched" && match.status !== "dispatched";
      if (status === "dispatched" && tracking) match.tracking = tracking;
      if (status !== "cancelled" && !["paid", "dispatched", "delivered"].includes(match.status)) {
        throw badRequest("Only paid orders can be dispatched or delivered.");
      }
      match.status = status;
      match[`${status}At`] = new Date().toISOString();
      return match;
    });
    if (!order) return send(res, 404, { error: "Order not found." });
    if (newlyDispatched) await sendOrderEmail(order, "dispatched");
    return send(res, 200, order);
  }

  if (req.method === "GET" && url.pathname === "/api/orders/status") {
    const id = String(url.searchParams.get("id") || "");
    const ref = String(url.searchParams.get("ref") || "");
    if (!id || !ref) return send(res, 400, { error: "Order reference is required." });
    let order = await findOrder((item) => item.id === id && item.razorpayOrderId === ref);
    if (!order) return send(res, 404, { error: "Order not found." });
    try {
      order = await reconcileOrder(order);
    } catch (error) {
      console.error("Unable to reconcile order", id, error);
    }
    return send(res, 200, publicOrder(order));
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    const body = await readBody(req);
    const { customer, shipping } = normalizeCheckout(body);
    const products = await readJson(productsFile, []);
    const cart = Array.isArray(body.cart) ? body.cart.slice(0, 100).map(String) : [];
    const items = [];
    for (const id of new Set(cart)) {
      const product = products.find((item) => item.id === id);
      if (!product) continue;
      const quantity = cart.filter((itemId) => itemId === id).length;
      if (quantity > product.stock) {
        return send(res, 409, { error: `${product.name} has only ${product.stock} left. Please update your cart.` });
      }
      items.push({ id, name: product.name, price: product.price, quantity });
    }

    if (!items.length) return send(res, 400, { error: "Cart is empty." });
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (total < 1) return send(res, 400, { error: "Order total must be at least ₹1." });
    const order = {
      id: `Zenzo-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      status: "created",
      customer,
      shipping,
      items,
      total,
      createdAt: new Date().toISOString()
    };
    const razorpayOrder = await createRazorpayOrder(order);
    if (!razorpayOrder) {
      return send(res, 503, { error: "Online payment is not available right now. Please try again later." });
    }
    order.razorpayOrderId = razorpayOrder.id;
    order.status = "payment_pending";
    await updateJson(ordersFile, [], (orders) => {
      orders.unshift(order);
    });
    return send(res, 201, {
      orderId: order.id,
      amount: total * 100,
      currency: "INR",
      razorpayKeyId: config.razorpayKeyId,
      razorpayOrderId: razorpayOrder.id,
      paymentConfigured: true,
      total
    });
  }

  if (req.method === "POST" && url.pathname === "/api/orders/verify") {
    if (!config.razorpayKeySecret) {
      return send(res, 503, { error: "Payment gateway is not configured." });
    }
    const body = await readBody(req);
    const razorpayOrderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const expected = crypto.createHmac("sha256", config.razorpayKeySecret)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest("hex");
    if (!razorpayOrderId || !paymentId || !safeEqualHex(body.razorpay_signature, expected)) {
      return send(res, 400, { error: "Payment could not be verified." });
    }
    try {
      await capturePayment(await razorpayRequest("GET", `/payments/${encodeURIComponent(paymentId)}`));
    } catch (error) {
      console.error("Unable to capture payment", paymentId, error);
    }
    const order = await markOrderPaid(razorpayOrderId, paymentId);
    if (!order) return send(res, 404, { error: "Order not found." });
    return send(res, 200, { ok: true, ...publicOrder(order) });
  }

  if (req.method === "POST" && url.pathname === "/api/webhooks/razorpay") {
    if (!config.razorpayWebhookSecret) {
      return send(res, 503, { error: "Webhook secret is not configured." });
    }
    const rawBody = await readRawBody(req, maxAdminBodyBytes);
    const signature = req.headers["x-razorpay-signature"];
    const expected = crypto.createHmac("sha256", config.razorpayWebhookSecret).update(rawBody).digest("hex");
    if (!safeEqualHex(signature, expected)) {
      return send(res, 401, { error: "Invalid webhook signature." });
    }
    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return send(res, 400, { error: "Invalid webhook body." });
    }
    const payment = event?.payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id || event?.payload?.order?.entity?.id;
    if (razorpayOrderId && (event.event === "order.paid" || event.event === "payment.captured")) {
      await markOrderPaid(razorpayOrderId, payment?.id);
    } else if (razorpayOrderId && event.event === "payment.authorized" && payment) {
      const captured = await capturePayment(payment);
      if (captured.status === "captured") await markOrderPaid(razorpayOrderId, captured.id);
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: "Not found." });
}

function isPublicFile(relativePath) {
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part.startsWith("."))) return false;
  if (parts.length === 1) {
    const extension = path.extname(relativePath);
    return extension === ".html" || extension === ".css" || publicScripts.has(relativePath);
  }
  return parts[0] === "assets";
}

async function serveStatic(req, res, url) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch {
    return send(res, 400, "Bad request");
  }
  const filePath = path.normalize(path.join(rootDir, requestedPath));
  const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !isPublicFile(relativePath)) {
    return send(res, 404, "Not found");
  }
  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const cacheControl = extension === ".html"
      ? "no-store"
      : "public, max-age=300";
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": mimeTypes[extension] || "application/octet-stream",
      "cache-control": cacheControl
    });
    res.end(content);
  } catch {
    res.writeHead(404, { ...securityHeaders, "content-type": "text/html; charset=utf-8" });
    res.end(await fs.readFile(path.join(rootDir, "index.html"), "utf8"));
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error(error);
    if (res.headersSent) return res.end();
    send(res, status, { error: status >= 500 && !error.statusCode ? "Something went wrong. Please try again." : error.message });
  }
}

module.exports = handleRequest;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  seedDataFiles().then(() => {
    server.listen(port, host, () => {
      console.log(`Zenzo production server running on http://${host}:${port}`);
    });
  }).catch((error) => {
    console.error("Unable to start Zenzo server:", error);
    process.exit(1);
  });
}

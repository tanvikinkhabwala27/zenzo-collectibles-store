const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const rootDir = __dirname;
const bundledDataDir = path.join(rootDir, "data");
const dataDir = process.env.DATA_DIR || bundledDataDir;
const productsFile = path.join(dataDir, "products.json");
const ordersFile = path.join(dataDir, "orders.json");
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
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ""
};

const maxPublicBodyBytes = 64 * 1024;
const maxAdminBodyBytes = 4 * 1024 * 1024;
const publicScripts = new Set(["app.js", "product.js", "checkout.js", "admin.js"]);

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

function makeSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 1000 * 60 * 60 * 8 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySession(req) {
  if (!adminConfigured()) return false;
  const token = parseCookies(req).zenzo_session;
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.email === config.adminEmail && data.exp > Date.now();
  } catch {
    return false;
  }
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

async function readJson(file, fallback) {
  if (usesBlobStorage) return (await readBlobEntry(file, fallback)).data;
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
    collection: cleanText(input.collection || "Hot Wheels", "Collection"),
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
  const email = cleanText(customer.email, "Email", { required: true, max: 254 });
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

async function createRazorpayOrder(order) {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    return null;
  }

  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      amount: order.total * 100,
      currency: "INR",
      receipt: order.id,
      notes: {
        order_id: order.id,
        customer_email: order.customer.email
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.description || "Unable to create Razorpay order.");
  }
  return data;
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function markOrderPaid(razorpayOrderId, paymentId) {
  const order = await updateJson(ordersFile, [], (orders) => {
    const match = orders.find((item) => item.razorpayOrderId === razorpayOrderId);
    if (!match || match.status === "paid") return match ? { order: match, newlyPaid: false } : null;
    match.status = "paid";
    match.paidAt = new Date().toISOString();
    if (paymentId) match.razorpayPaymentId = paymentId;
    return { order: match, newlyPaid: true };
  });
  if (!order) return null;
  if (order.newlyPaid) {
    await updateJson(productsFile, [], (products) => {
      for (const line of order.order.items) {
        const product = products.find((item) => item.id === line.id);
        if (product) product.stock = Math.max(0, product.stock - line.quantity);
      }
    });
  }
  return order.order;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/products") {
    return send(res, 200, await readJson(productsFile, []));
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

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/products/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    await updateJson(productsFile, [], (products) => {
      const index = products.findIndex((product) => product.id === id);
      if (index !== -1) products.splice(index, 1);
    });
    return send(res, 200, { ok: true });
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
    if (razorpayOrder) {
      order.razorpayOrderId = razorpayOrder.id;
      order.status = "payment_pending";
    }
    await updateJson(ordersFile, [], (orders) => {
      orders.unshift(order);
    });
    return send(res, 201, {
      orderId: order.id,
      amount: total * 100,
      currency: "INR",
      razorpayKeyId: config.razorpayKeyId,
      razorpayOrderId: razorpayOrder?.id || null,
      paymentConfigured: Boolean(razorpayOrder)
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
    const order = await markOrderPaid(razorpayOrderId, paymentId);
    if (!order) return send(res, 404, { error: "Order not found." });
    return send(res, 200, { ok: true, orderId: order.id, status: order.status });
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

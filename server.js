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
const usesBlobStorage = isVercel && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const port = Number(process.env.PORT || 8092);
const host = process.env.HOST || "0.0.0.0";
let blobClientPromise;

const config = {
  adminEmail: (process.env.ADMIN_EMAIL || "zenzo.org@gmail.com").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || "dev-change-this-session-secret",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ""
};

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

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
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

function sign(value) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

function makeSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 1000 * 60 * 60 * 8 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySession(req) {
  const token = parseCookies(req).zenzo_session;
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || signature !== sign(payload)) return false;
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

async function readBlobJson(file, fallback) {
  const { get, put } = await getBlobClient();
  const pathname = blobPath(file);
  const result = await get(pathname, { access: "private" });
  if (result?.statusCode === 200) {
    return JSON.parse(await new Response(result.stream).text());
  }

  const bundled = await readFileJson(path.join(bundledDataDir, path.basename(file)), fallback);
  try {
    await put(pathname, JSON.stringify(bundled, null, 2), {
      access: "private",
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      contentType: "application/json"
    });
    return bundled;
  } catch {
    const seeded = await get(pathname, { access: "private" });
    if (seeded?.statusCode === 200) {
      return JSON.parse(await new Response(seeded.stream).text());
    }
    throw new Error("Unable to initialize persistent storage.");
  }
}

async function readJson(file, fallback) {
  if (usesBlobStorage) return readBlobJson(file, fallback);
  const source = isVercel ? path.join(bundledDataDir, path.basename(file)) : file;
  return readFileJson(source, fallback);
}

async function writeJson(file, value) {
  if (usesBlobStorage) {
    const { put } = await getBlobClient();
    await put(blobPath(file), JSON.stringify(value, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json"
    });
    return;
  }
  if (isVercel) {
    const error = new Error("Persistent storage is not configured yet.");
    error.statusCode = 503;
    throw error;
  }
  await writeFileJson(file, value);
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeProduct(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Product name is required.");
  return {
    id: input.id || `admin-${slugify(name)}-${Date.now()}`,
    name,
    collection: String(input.collection || "Hot Wheels").trim(),
    series: String(input.series || "Assorted Hot Wheels").trim(),
    year: Number(input.year) || new Date().getFullYear(),
    condition: String(input.condition || "Sealed Pack").trim(),
    price: Math.max(0, Math.round(Number(input.price) || 0)),
    stock: Math.max(0, Math.round(Number(input.stock) || 0)),
    image: String(input.image || "").trim(),
    imageAlt: String(input.imageAlt || name).trim(),
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: String(input.notes || "").trim()
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
  const orders = await readJson(ordersFile, []);
  const order = orders.find((item) => item.razorpayOrderId === razorpayOrderId);
  if (!order) return null;
  if (order.status !== "paid") {
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    if (paymentId) order.razorpayPaymentId = paymentId;
    await writeJson(ordersFile, orders);
  }
  return order;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/products") {
    return send(res, 200, await readJson(productsFile, []));
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    if (!config.adminPassword) {
      return send(res, 503, { error: "Admin login is not configured." });
    }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (email !== config.adminEmail || password !== config.adminPassword) {
      return send(res, 401, { error: "Incorrect email or password." });
    }
    return send(res, 200, { ok: true }, {
      "set-cookie": `zenzo_session=${encodeURIComponent(makeSession(email))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${isVercel ? "; Secure" : ""}`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    return send(res, 200, { ok: true }, {
      "set-cookie": "zenzo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/session") {
    return send(res, 200, { authenticated: verifySession(req) });
  }

  if (url.pathname.startsWith("/api/admin/") && !verifySession(req)) {
    return send(res, 401, { error: "Admin login required." });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/products") {
    const products = await readJson(productsFile, []);
    const product = normalizeProduct(await readBody(req));
    products.unshift(product);
    await writeJson(productsFile, products);
    return send(res, 201, product);
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/products/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const products = await readJson(productsFile, []);
    await writeJson(productsFile, products.filter((product) => product.id !== id));
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    const body = await readBody(req);
    const products = await readJson(productsFile, []);
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const items = [...new Set(cart)].map((id) => {
      const product = products.find((item) => item.id === id);
      const quantity = cart.filter((itemId) => itemId === id).length;
      return product ? { id, name: product.name, price: product.price, quantity } : null;
    }).filter(Boolean);

    if (!items.length) return send(res, 400, { error: "Cart is empty." });
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = {
      id: `Zenzo-${Date.now().toString().slice(-6)}`,
      status: "created",
      customer: body.customer || {},
      shipping: body.shipping || {},
      items,
      total,
      createdAt: new Date().toISOString()
    };
    const razorpayOrder = await createRazorpayOrder(order);
    if (razorpayOrder) {
      order.razorpayOrderId = razorpayOrder.id;
      order.status = "payment_pending";
    }
    const orders = await readJson(ordersFile, []);
    orders.unshift(order);
    await writeJson(ordersFile, orders);
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
    const rawChunks = [];
    for await (const chunk of req) rawChunks.push(chunk);
    const rawBody = Buffer.concat(rawChunks);
    const signature = req.headers["x-razorpay-signature"];
    const expected = crypto.createHmac("sha256", config.razorpayWebhookSecret).update(rawBody).digest("hex");
    if (!safeEqualHex(signature, expected)) {
      return send(res, 401, { error: "Invalid webhook signature." });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    const payment = event?.payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id || event?.payload?.order?.entity?.id;
    if (razorpayOrderId && (event.event === "order.paid" || event.event === "payment.captured")) {
      await markOrderPaid(razorpayOrderId, payment?.id);
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: "Not found." });
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(rootDir, requestedPath));
  if (!filePath.startsWith(rootDir)) return send(res, 403, "Forbidden");
  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    const cacheControl = extension === ".html"
      ? "no-store"
      : "public, max-age=300";
    res.writeHead(200, {
      "content-type": mimeTypes[extension] || "application/octet-stream",
      "cache-control": cacheControl
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
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
    send(res, Number(error.statusCode) || 500, { error: error.message || "Server error." });
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

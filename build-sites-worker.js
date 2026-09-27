const fs = require("fs");
const path = require("path");

const root = __dirname;
const textFiles = [
  "index.html",
  "product.html",
  "checkout.html",
  "admin.html",
  "account.html",
  "styles.css",
  "app.js",
  "product.js",
  "checkout.js",
  "admin.js",
  "showcase-images.js",
  "account.js",
  "admin-studio.js"
];

const staticFiles = [
  "assets/hero-shelf-fast.jpg",
  "assets/zenzo-logo-mark.png",
  "assets/collection-hot-wheels.webp",
  "assets/collection-figurines.webp",
  "assets/collection-3d-prints.webp"
];

for (const folder of ["assets/catalog", "assets/showcase"]) {
  for (const file of fs.readdirSync(path.join(root, folder))) {
    if (file.endsWith(".webp")) staticFiles.push(`${folder}/${file}`);
  }
}

for (const file of fs.readdirSync(path.join(root, "assets/accessories"))) {
  if (/\.(webp|png|jpe?g)$/i.test(file)) staticFiles.push(`assets/accessories/${file}`);
}

function mime(file) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

const textRoutes = {};
for (const file of textFiles) {
  textRoutes[`/${file}`] = {
    body: fs.readFileSync(path.join(root, file), "utf8"),
    type: mime(file)
  };
}
textRoutes["/"] = textRoutes["/index.html"];

const productData = fs.readFileSync(path.join(root, "data/products.json"), "utf8");

const worker = `const textRoutes = ${JSON.stringify(textRoutes)};\n` +
`const productData = ${JSON.stringify(productData)};\n` +
`
function response(body, type, status = 200, cacheControl = "no-cache") {
  return new Response(body, {
    status,
    headers: {
      "cache-control": cacheControl,
      "content-type": type
    }
  });
}

function json(data, status = 200) {
  return response(JSON.stringify(data), "application/json; charset=utf-8", status);
}

function assetMime(pathname) {
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function createRazorpayOrder(env, order) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;

  const auth = btoa(\`\${env.RAZORPAY_KEY_ID}:\${env.RAZORPAY_KEY_SECRET}\`);
  const gatewayResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: \`Basic \${auth}\`,
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

  const data = await gatewayResponse.json();
  if (!gatewayResponse.ok) {
    throw new Error(data?.error?.description || "Unable to create Razorpay order.");
  }
  return data;
}

async function handleOrder(request, env) {
  const body = await request.json();
  const products = JSON.parse(productData);
  const cart = Array.isArray(body.cart) ? body.cart : [];
  const items = [...new Set(cart)].map((id) => {
    const product = products.find((item) => item.id === id);
    const quantity = cart.filter((itemId) => itemId === id).length;
    return product ? { id, name: product.name, price: product.price, quantity } : null;
  }).filter(Boolean);

  if (!items.length) return json({ error: "Your cart is empty." }, 400);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const order = {
    id: \`order-\${Date.now()}\`,
    items,
    total,
    customer: body.customer || {},
    createdAt: new Date().toISOString()
  };
  const razorpayOrder = await createRazorpayOrder(env, order);

  return json({
    ok: true,
    orderId: order.id,
    amount: total * 100,
    currency: "INR",
    paymentConfigured: Boolean(razorpayOrder),
    razorpayOrderId: razorpayOrder?.id || "",
    razorpayKeyId: env.RAZORPAY_KEY_ID || ""
  }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/" : url.pathname;

    try {
      if (request.method === "GET" && pathname === "/api/products") {
        return response(productData, "application/json; charset=utf-8");
      }

      if (request.method === "POST" && pathname === "/api/orders") {
        return handleOrder(request, env);
      }

      if (pathname.startsWith("/api/admin/") || pathname === "/api/webhooks/razorpay") {
        return json({ error: "Admin tools are not enabled on this public site." }, 404);
      }

      if (pathname.startsWith("/assets/")) {
        const assetResponse = await env.ASSETS.fetch(request);
        const headers = new Headers(assetResponse.headers);
        headers.set("cache-control", "public, max-age=86400");
        headers.set("content-type", assetMime(pathname));
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers
        });
      }

      if (textRoutes[pathname]) {
        const page = textRoutes[pathname];
        return response(page.body, page.type);
      }

      return response(textRoutes["/"].body, textRoutes["/"].type);
    } catch (error) {
      return json({ error: error.message || "Something went wrong." }, 500);
    }
  }
};
`;

fs.writeFileSync(path.join(root, "dist/server/index.js"), worker);

fs.writeFileSync(
  path.join(root, "dist/server/wrangler.json"),
  JSON.stringify({
    name: "zenzo-collectibles",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    main: "index.js",
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    no_bundle: true,
    assets: { directory: "../client", binding: "ASSETS", run_worker_first: false }
  })
);

for (const file of [...textFiles, ...staticFiles, "_headers"]) {
  const destination = path.join(root, "dist/client", file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination);
}

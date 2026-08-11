const staticHeaders = {
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function extname(pathname) {
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : "";
}

async function asset(env, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const response = await env.ASSETS.fetch(new Request(url, request));
  if (response.status === 404) return response;

  const headers = new Headers(response.headers);
  const type = staticHeaders[extname(pathname)];
  if (type) headers.set("content-type", type);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function readProducts(env, request) {
  const response = await asset(env, request, "/data/products.json");
  if (!response.ok) return [];
  return response.json();
}

async function createRazorpayOrder(env, order) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;

  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
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

async function handleOrder(request, env) {
  const body = await request.json();
  const products = await readProducts(env, request);
  const cart = Array.isArray(body.cart) ? body.cart : [];
  const items = [...new Set(cart)].map((id) => {
    const product = products.find((item) => item.id === id);
    const quantity = cart.filter((itemId) => itemId === id).length;
    return product ? { id, name: product.name, price: product.price, quantity } : null;
  }).filter(Boolean);

  if (!items.length) return json({ error: "Your cart is empty." }, 400);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const order = {
    id: `order-${Date.now()}`,
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

    try {
      if (request.method === "GET" && url.pathname === "/api/products") {
        return json(await readProducts(env, request));
      }

      if (request.method === "POST" && url.pathname === "/api/orders") {
        return handleOrder(request, env);
      }

      if (url.pathname.startsWith("/api/admin/") || url.pathname === "/api/webhooks/razorpay") {
        return json({ error: "Admin tools are not enabled on this public preview." }, 404);
      }

      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const direct = await asset(env, request, pathname);
      if (direct.status !== 404) return direct;

      return asset(env, request, "/index.html");
    } catch (error) {
      return json({ error: error.message || "Something went wrong." }, 500);
    }
  }
};

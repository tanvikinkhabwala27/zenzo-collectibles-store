// Vercel Routing Middleware: keeps the whole shop private while SITE_PASSWORD
// is set. Static pages on Vercel are served without reaching server.js, so the
// access check has to happen here too. The rules match server.js.
const openPaths = new Set([
  "/access.html",
  "/api/access",
  "/api/webhooks/razorpay",
  "/styles.css",
  "/assets/zenzo-logo-mark.png"
]);

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(header, name) {
  for (const part of (header || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function decodePayload(payload) {
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function hasAccess(request, password, secret) {
  const [payload, signature] = readCookie(request.headers.get("cookie"), "zenzo_access").split(".");
  if (!payload || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (difference) return false;
  try {
    const data = decodePayload(payload);
    const version = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(`access:${password}`))).slice(0, 16);
    return data.kind === "access" && data.v === version && data.exp > Date.now();
  } catch {
    return false;
  }
}

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return undefined;
  const url = new URL(request.url);
  if (openPaths.has(url.pathname)) return undefined;
  const secret = process.env.SESSION_SECRET;
  if (secret && await hasAccess(request, password, secret)) return undefined;
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "This shop is private." }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  const target = new URL("/access.html", url);
  target.searchParams.set("next", `${url.pathname}${url.search}`);
  return Response.redirect(target, 302);
}

let inventory = [];
const cart = JSON.parse(localStorage.getItem("dieCastGarageCart") || "[]");
const orderList = document.querySelector("#orderList");
const subtotalEl = document.querySelector("#checkoutSubtotal");
const form = document.querySelector("#checkoutForm");
const checkoutNote = document.querySelector("#checkoutNote");
const payButton = document.querySelector(".place-order");
const checkoutLayout = document.querySelector(".checkout-layout");
const pendingKey = "zenzoPendingOrder";
const pendingMaxAge = 1000 * 60 * 60 * 24;
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
let paymentWindowOpen = false;
let signedInEmail = null;
const checkoutAccount = document.querySelector("#checkoutAccount");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
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

function cartKey() {
  return [...cart].sort().join(",");
}

// The pending order survives the buyer switching to their UPI app, even if the
// browser reloads this page, so it can be confirmed instead of paid twice.
function loadPendingOrder() {
  try {
    const pending = JSON.parse(localStorage.getItem(pendingKey) || "null");
    if (pending && Date.now() - pending.createdAt < pendingMaxAge) return pending;
  } catch {
    // Ignore unreadable entries.
  }
  localStorage.removeItem(pendingKey);
  return null;
}

function savePendingOrder(order, email) {
  localStorage.setItem(pendingKey, JSON.stringify({ ...order, email, cartKey: cartKey(), createdAt: Date.now() }));
}

function cartQuantity(id) {
  return cart.filter((itemId) => itemId === id).length;
}

function getOrderLines() {
  return [...new Set(cart)].map((id) => {
    const item = inventory.find((product) => product.id === id);
    const quantity = cartQuantity(id);
    return { item, quantity };
  }).filter((line) => line.item);
}

function getSubtotal(orderLines) {
  return orderLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
}

function renderCheckout() {
  const orderLines = getOrderLines();
  const subtotal = getSubtotal(orderLines);

  if (!orderLines.length) {
    orderList.innerHTML = '<p class="empty-state">Your cart is empty.</p>';
  } else {
    orderList.innerHTML = orderLines.map(({ item, quantity }) => `
      <div class="order-line">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>Qty ${quantity}</p>
        </div>
        <strong>${money.format(item.price * quantity)}</strong>
      </div>
    `).join("");
  }

  subtotalEl.textContent = money.format(subtotal);
}

function setBusy(busy) {
  payButton.disabled = busy;
  payButton.textContent = busy ? "Processing..." : "Pay securely";
}

function accountPrompt(email) {
  if (signedInEmail) return "";
  const params = new URLSearchParams({ mode: "signup" });
  if (email) params.set("email", email);
  return `
    <div class="account-prompt">
      <strong>Track this order with a Zenzo account</strong>
      <p class="checkout-note">See this order and future ones in one place${email ? ` using ${escapeHtml(email)}` : ""}. It only takes a minute.</p>
      <a class="secondary-link" href="account.html?${params}">Create an account</a>
    </div>
  `;
}

function showConfirmation(order, { pendingConfirmation = false } = {}) {
  const buyerEmail = loadPendingOrder()?.email || String(form.elements.email?.value || "").trim();
  localStorage.removeItem("dieCastGarageCart");
  localStorage.removeItem(pendingKey);
  cart.length = 0;
  const items = (order.items || []).map((item) => `
    <div class="order-line">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>Qty ${item.quantity}</p>
      </div>
      <strong>${money.format(item.price * item.quantity)}</strong>
    </div>
  `).join("");
  checkoutLayout.innerHTML = `
    <section class="checkout-panel order-confirmed" aria-labelledby="confirmedTitle">
      <div class="checkout-panel__body">
        <p class="eyebrow">Payment received</p>
        <h1 id="confirmedTitle">Thank you! Your order is confirmed.</h1>
        <p class="checkout-note">Order ID <strong>${escapeHtml(order.orderId)}</strong>. Please keep it for any questions about your order.</p>
        ${items ? `<div class="order-list">${items}</div>` : ""}
        ${order.total ? `<div class="checkout-total"><span>Paid</span><strong>${money.format(order.total)}</strong></div>` : ""}
        <p class="checkout-note">${pendingConfirmation
          ? "Your payment went through. Zenzo is finishing the confirmation and will contact you if anything else is needed."
          : "Zenzo will pack and dispatch your order and keep you updated by email."}</p>
        ${accountPrompt(buyerEmail)}
        <div class="checkout-nav__actions">
          <a class="primary-link" href="index.html#catalog">Continue shopping</a>
          ${signedInEmail ? '<a class="secondary-link" href="account.html">View my orders</a>' : ""}
        </div>
      </div>
    </section>
  `;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function fetchOrderStatus(pending) {
  const params = new URLSearchParams({ id: pending.orderId, ref: pending.razorpayOrderId });
  return api(`/api/orders/status?${params}`);
}

// Returns true when the pending order turned out to be paid.
async function confirmIfPaid(pending) {
  if (!pending) return false;
  try {
    const status = await fetchOrderStatus(pending);
    if (status.paidAt) {
      showConfirmation(status);
      return true;
    }
    if (status.status === "cancelled") localStorage.removeItem(pendingKey);
  } catch {
    // Treat as unpaid; the buyer can retry and reuse the same order.
  }
  return false;
}

function openRazorpay(order, formData) {
  if (!window.Razorpay || !order.paymentConfigured) {
    checkoutNote.textContent = "Online payment is not available right now. Please try again later.";
    setBusy(false);
    return;
  }

  const razorpay = new window.Razorpay({
    key: order.razorpayKeyId,
    amount: order.amount,
    currency: order.currency,
    name: "Zenzo",
    image: new URL("assets/zenzo-logo-square.png", window.location.href).href,
    description: `Order ${order.orderId}`,
    order_id: order.razorpayOrderId,
    prefill: {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      contact: String(formData.get("phone") || "")
    },
    notes: {
      order_id: order.orderId
    },
    config: {
      display: {
        blocks: {
          upi: {
            name: "Pay using UPI",
            instruments: [{ method: "upi" }]
          }
        },
        sequence: ["block.upi"],
        preferences: { show_default_blocks: true }
      }
    },
    theme: {
      color: "#242424"
    },
    modal: {
      async ondismiss() {
        paymentWindowOpen = false;
        checkoutNote.textContent = "Checking your payment...";
        if (await confirmIfPaid(order)) return;
        setBusy(false);
        checkoutNote.textContent = "Payment not completed. Your cart is saved, so you can try again.";
      }
    },
    async handler(response) {
      paymentWindowOpen = false;
      checkoutNote.textContent = "Confirming your payment...";
      try {
        const confirmed = await api("/api/orders/verify", {
          method: "POST",
          body: JSON.stringify(response)
        });
        showConfirmation(confirmed);
      } catch {
        // Razorpay only calls this after a successful payment, so never ask
        // the buyer to pay again; the server confirms it via Razorpay.
        if (await confirmIfPaid(order)) return;
        showConfirmation(order, { pendingConfirmation: true });
      }
    }
  });
  razorpay.on("payment.failed", (response) => {
    checkoutNote.textContent = response?.error?.description || "Payment failed. Please try again.";
  });
  razorpay.open();
  paymentWindowOpen = true;
  checkoutNote.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (payButton.disabled) return;
  const orderLines = getOrderLines();

  if (!orderLines.length) {
    alert("Your cart is empty. Please add a product before checkout.");
    return;
  }

  const formData = new FormData(form);
  setBusy(true);
  checkoutNote.textContent = "Preparing secure checkout...";

  try {
    const pending = loadPendingOrder();
    if (pending && await confirmIfPaid(pending)) return;

    // Retry the same order for an unchanged cart so a buyer can never be
    // charged for two orders.
    let order = pending && pending.cartKey === cartKey() ? pending : null;
    if (!order) {
      order = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          cart,
          customer: {
            name: formData.get("name"),
            email: formData.get("email"),
            phone: formData.get("phone")
          },
          shipping: {
            address: formData.get("address"),
            city: formData.get("city"),
            state: formData.get("state"),
            pin: formData.get("pin")
          }
        })
      });
      savePendingOrder(order, String(formData.get("email") || "").trim().toLowerCase());
    }
    openRazorpay(order, formData);
  } catch (error) {
    checkoutNote.textContent = error.message;
    setBusy(false);
  }
});

// Buyers often come back from their UPI app to a reloaded or backgrounded
// page; check the pending order whenever the page is shown again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || paymentWindowOpen) return;
  confirmIfPaid(loadPendingOrder());
});

function fillIfEmpty(name, value) {
  const field = form.elements[name];
  if (field && !field.value && value) field.value = value;
}

// Signing in is optional: it only fills in the buyer's details from their
// most recent order so returning customers check out faster.
async function loadAccount() {
  try {
    const { email } = await api("/api/account/me");
    if (!email) return;
    signedInEmail = email;
    checkoutAccount.innerHTML = `Signed in as <strong>${escapeHtml(email)}</strong>. <button class="remove-button account-link" type="button" id="checkoutSignOut">Sign out</button>`;
    fillIfEmpty("email", email);
    const [latest] = await api("/api/account/orders");
    if (!latest) return;
    fillIfEmpty("name", latest.contact?.name);
    fillIfEmpty("phone", latest.contact?.phone);
    for (const key of ["address", "city", "state", "pin"]) fillIfEmpty(key, latest.shipping?.[key]);
  } catch {
    // Guest checkout keeps working without an account.
  }
}

checkoutAccount.addEventListener("click", async (event) => {
  if (!event.target.closest("#checkoutSignOut")) return;
  await api("/api/account/logout", { method: "POST" }).catch(() => {});
  window.location.reload();
});

async function init() {
  try {
    inventory = await api("/api/products");
  } catch {
    inventory = [];
  }
  renderCheckout();
  loadAccount();
  const pending = loadPendingOrder();
  if (pending) {
    checkoutNote.textContent = "Checking your last payment...";
    if (!(await confirmIfPaid(pending))) checkoutNote.textContent = "";
  }
}

init();

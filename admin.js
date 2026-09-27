const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const dashboard = document.querySelector("#adminDashboard");
const productForm = document.querySelector("#productForm");
const productsList = document.querySelector("#adminProducts");
const logoutButton = document.querySelector("#logoutButton");
const ordersList = document.querySelector("#adminOrders");
const orderFilter = document.querySelector("#orderFilter");
const statusLabels = {
  created: "Not paid",
  payment_pending: "Awaiting payment",
  paid: "Paid - ready to dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  renderProducts();
  renderOrders();
}

function orderActions(order) {
  const id = escapeHtml(order.id);
  if (order.status === "payment_pending") {
    return `<button class="remove-button" type="button" data-order-refresh="${id}">Check payment</button>`;
  }
  if (order.status === "paid") {
    return `<button class="admin-order__action" type="button" data-order-status="dispatched" data-order-id="${id}">Mark dispatched</button>`;
  }
  if (order.status === "dispatched") {
    return `<button class="admin-order__action" type="button" data-order-status="delivered" data-order-id="${id}">Mark delivered</button>`;
  }
  return "";
}

function orderMarkup(order) {
  const customer = order.customer || {};
  const shipping = order.shipping || {};
  const items = (order.items || []).map((item) => `${escapeHtml(item.name)} &times; ${item.quantity}`).join("<br>");
  return `
    <article class="admin-order admin-order--${escapeHtml(order.status)}">
      <div class="admin-order__top">
        <strong>${escapeHtml(order.id)}</strong>
        <span class="admin-order__status">${escapeHtml(statusLabels[order.status] || order.status)}</span>
      </div>
      <p>${order.createdAt ? dateFormat.format(new Date(order.createdAt)) : ""} &middot; ${money.format(order.total || 0)}${order.razorpayPaymentId ? ` &middot; Payment ${escapeHtml(order.razorpayPaymentId)}` : ""}</p>
      <p>${items}</p>
      <p><strong>${escapeHtml(customer.name)}</strong> &middot; ${escapeHtml(customer.phone)} &middot; ${escapeHtml(customer.email)}</p>
      <p>${escapeHtml(shipping.address)}, ${escapeHtml(shipping.city)}, ${escapeHtml(shipping.state)} ${escapeHtml(shipping.pin)}</p>
      <div class="admin-order__actions">${orderActions(order)}</div>
    </article>
  `;
}

async function renderOrders() {
  let orders = [];
  try {
    orders = await api("/api/admin/orders");
  } catch (error) {
    ordersList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    return;
  }
  const filter = orderFilter.value;
  const visible = orders.filter((order) => {
    if (filter === "todo") return order.status === "paid";
    if (filter === "payment_pending") return order.status === "payment_pending";
    return true;
  });
  ordersList.innerHTML = visible.length
    ? visible.map(orderMarkup).join("")
    : '<p class="empty-state">No orders here yet.</p>';
}

function showLogin() {
  loginPanel.hidden = false;
  dashboard.hidden = true;
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxSize = 1100;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8f7f3";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function renderProducts() {
  let products = [];
  try {
    products = await api("/api/products");
  } catch (error) {
    productsList.innerHTML = `<p class="empty-state">${error.message}</p>`;
    return;
  }

  if (!products.length) {
    productsList.innerHTML = '<p class="empty-state">No products added yet.</p>';
    return;
  }

  productsList.innerHTML = products.map((product) => `
    <div class="admin-product">
      ${product.image ? `<img src="${product.image}" alt="${product.name}">` : ""}
      <div>
        <h3>${product.name}</h3>
        <p>${product.collection || "Hot Wheels"} &middot; ${product.series} &middot; ${product.condition} &middot; ${money.format(product.price)} &middot; Stock ${product.stock}</p>
      </div>
      <button class="remove-button" type="button" data-delete="${product.id}">Delete</button>
    </div>
  `).join("");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password")
      })
    });
    loginMessage.textContent = "";
    showDashboard();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(productForm);
  const name = String(form.get("name") || "").trim();
  const image = await resizeImage(productForm.elements.image.files[0]);

  try {
    await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify({
        name,
        collection: form.get("collection"),
        series: form.get("series"),
        year: form.get("year"),
        condition: form.get("condition"),
        price: form.get("price"),
        stock: form.get("stock"),
        image,
        imageAlt: name,
        notes: form.get("notes")
      })
    });
    productForm.reset();
    productForm.elements.collection.value = "Hot Wheels";
    productForm.elements.series.value = "Assorted Hot Wheels";
    productForm.elements.year.value = "2025";
    productForm.elements.stock.value = "1";
    productForm.elements.notes.value = "Sealed Hot Wheels pack photographed from available stock.";
    renderProducts();
  } catch (error) {
    alert(error.message);
  }
});

productsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  try {
    await api(`/api/admin/products/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" });
    renderProducts();
  } catch (error) {
    alert(error.message);
  }
});

orderFilter.addEventListener("change", renderOrders);

ordersList.addEventListener("click", async (event) => {
  const refresh = event.target.closest("[data-order-refresh]");
  const statusButton = event.target.closest("[data-order-status]");
  if (!refresh && !statusButton) return;
  const button = refresh || statusButton;
  button.disabled = true;
  try {
    if (refresh) {
      const order = await api(`/api/admin/orders/${encodeURIComponent(refresh.dataset.orderRefresh)}/refresh`, { method: "POST" });
      if (order.status === "payment_pending") alert("Razorpay has no completed payment for this order yet.");
    } else {
      await api(`/api/admin/orders/${encodeURIComponent(statusButton.dataset.orderId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: statusButton.dataset.orderStatus })
      });
    }
    renderOrders();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  showLogin();
});

async function init() {
  try {
    const session = await api("/api/admin/session");
    if (session.authenticated) {
      showDashboard();
      return;
    }
  } catch {
    // Fall through to login.
  }
  showLogin();
}

init();

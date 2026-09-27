const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const dashboard = document.querySelector("#adminDashboard");
const productForm = document.querySelector("#productForm");
const productsList = document.querySelector("#adminProducts");
const logoutButton = document.querySelector("#logoutButton");
const ordersList = document.querySelector("#adminOrders");
const orderFilters = document.querySelector("#orderFilters");
const productsMessage = document.querySelector("#productsMessage");
const tabs = ["dashboard", "orders", "products", "add"];
const orderFilterLabels = [
  ["paid", "Pending dispatch"],
  ["dispatched", "Dispatched"],
  ["delivered", "Completed"],
  ["payment_pending", "Awaiting payment"],
  ["cancelled", "Cancelled"],
  ["all", "All"]
];
let orderFilter = "paid";
let currentTab = "dashboard";
const statusLabels = {
  created: "Not paid",
  payment_pending: "Awaiting payment",
  paid: "Paid - ready to dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
const collections = ["Hot Wheels", "Figurines", "3D collectibles", "Accessories"];
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
  const requested = window.location.hash.slice(1);
  showTab(tabs.includes(requested) ? requested : "dashboard");
}

function showTab(name) {
  currentTab = name;
  for (const tab of document.querySelectorAll(".admin-tab")) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of document.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== name;
  }
  if (window.location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
  if (name === "dashboard") renderDashboard();
  if (name === "orders") renderOrders();
  if (name === "products") {
    productsMessage.textContent = "";
    renderProducts();
  }
}

function isPaidOrder(order) {
  return Boolean(order.paidAt) && order.status !== "cancelled";
}

function countByStatus(orders) {
  const counts = { all: orders.length };
  for (const order of orders) counts[order.status] = (counts[order.status] || 0) + 1;
  return counts;
}

function updateOrdersBadge(orders) {
  const badge = document.querySelector("#ordersTabCount");
  const waiting = orders.filter((order) => order.status === "paid").length;
  badge.hidden = waiting === 0;
  badge.textContent = waiting;
  badge.setAttribute("aria-label", `${waiting} waiting to be dispatched`);
}

function statTile({ label, value, note = "", go, filter, status }) {
  const tag = go ? "button" : "div";
  const attributes = go ? ` type="button" data-go="${go}"${filter ? ` data-filter="${filter}"` : ""}` : "";
  return `
    <${tag} class="admin-stat${status ? ` admin-stat--${status}` : ""}"${attributes}>
      <span class="admin-stat__label">${label}</span>
      <span class="admin-stat__value">${value}</span>
      ${note ? `<span class="admin-stat__note">${note}</span>` : ""}
    </${tag}>
  `;
}

async function renderDashboard() {
  const stats = document.querySelector("#adminStats");
  let orders;
  let products;
  try {
    [orders, products] = await Promise.all([api("/api/admin/orders"), api("/api/products")]);
  } catch (error) {
    stats.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    return;
  }
  updateOrdersBadge(orders);
  const counts = countByStatus(orders);
  const paid = orders.filter(isPaidOrder);
  const revenue = paid.reduce((sum, order) => sum + (order.total || 0), 0);
  const outOfStock = products.filter((product) => !product.stock);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRevenue = paid
    .filter((order) => String(order.paidAt).startsWith(thisMonth))
    .reduce((sum, order) => sum + (order.total || 0), 0);

  document.querySelector("#statRevenue").textContent = money.format(revenue);
  document.querySelector("#statRevenueNote").textContent = paid.length
    ? `${paid.length} paid ${paid.length === 1 ? "order" : "orders"} · ${money.format(monthRevenue)} this month`
    : "No paid orders yet.";

  stats.innerHTML = [
    statTile({ label: "Orders", value: paid.length, note: "Paid, all time", go: "orders", filter: "all" }),
    statTile({
      label: "Pending dispatch",
      value: counts.paid || 0,
      note: counts.paid ? "Ready to pack and send" : "All caught up",
      go: "orders",
      filter: "paid",
      status: counts.paid ? "attention" : ""
    }),
    statTile({ label: "Dispatched", value: counts.dispatched || 0, note: "On the way", go: "orders", filter: "dispatched" }),
    statTile({ label: "Completed", value: counts.delivered || 0, note: "Delivered", go: "orders", filter: "delivered" }),
    statTile({ label: "Awaiting payment", value: counts.payment_pending || 0, note: "Checkout started, not paid", go: "orders", filter: "payment_pending" }),
    statTile({
      label: "Products",
      value: products.length,
      note: outOfStock.length ? `${outOfStock.length} out of stock` : "All in stock",
      go: "products",
      status: outOfStock.length ? "attention" : ""
    })
  ].join("");

  const waiting = orders.filter((order) => order.status === "paid").slice(0, 5);
  document.querySelector("#attentionOrders").innerHTML = waiting.length
    ? waiting.map(orderMarkup).join("")
    : '<p class="empty-state">Nothing waiting. New paid orders appear here.</p>';
  document.querySelector("#stockList").innerHTML = outOfStock.length
    ? outOfStock.map((product) => `
      <div class="admin-stock-item">
        <span>${escapeHtml(product.name)}</span>
        <span class="admin-stat__note">${escapeHtml(product.collection || "Hot Wheels")}</span>
      </div>
    `).join("")
    : '<p class="empty-state">Every product is in stock.</p>';
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
      ${order.tracking ? `<p>Tracking: ${escapeHtml(order.tracking)}</p>` : ""}
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
  updateOrdersBadge(orders);
  const counts = countByStatus(orders);
  orderFilters.innerHTML = orderFilterLabels.map(([value, label]) => `
    <button class="admin-filter${value === orderFilter ? " is-active" : ""}" type="button" data-filter="${value}" aria-pressed="${value === orderFilter}">
      ${label} <span class="admin-filter__count">${counts[value] || 0}</span>
    </button>
  `).join("");
  const visible = orderFilter === "all" ? orders : orders.filter((order) => order.status === orderFilter);
  const emptyText = {
    paid: "No orders waiting to be dispatched.",
    dispatched: "No orders on the way right now.",
    delivered: "No completed orders yet.",
    payment_pending: "No unfinished checkouts.",
    cancelled: "No cancelled orders.",
    all: "No orders yet."
  }[orderFilter];
  ordersList.innerHTML = visible.length
    ? visible.map(orderMarkup).join("")
    : `<p class="empty-state">${emptyText}</p>`;
}

function showLogin() {
  loginPanel.hidden = false;
  dashboard.hidden = true;
}

const preparedPhotos = new WeakMap();
const studioNotes = {
  studio: "Background removed and placed on the Zenzo stage. If any old background is left (for example inside a loop), tap it in the preview to remove it.",
  "studio-photo": "The background was too busy to remove, so the whole photo got the Zenzo lighting. A photo on a plain background gives the best result.",
  original: "Original photo, cropped square."
};

function showPreview(form, photo) {
  const preview = form.querySelector(".studio-preview");
  if (!preview) return;
  preview.hidden = false;
  preview.querySelector("img").src = photo.dataUrl;
  preview.querySelector("img").classList.toggle("is-editable", Boolean(photo.canEdit));
  const longest = Math.max(photo.sourceWidth || 0, photo.sourceHeight || 0);
  const lowResolution = longest && longest < 1000
    ? ` This photo is only ${photo.sourceWidth} × ${photo.sourceHeight} pixels, so it will look soft. For a sharp result, upload a photo at least 1200 pixels wide (any recent phone photo is fine).`
    : "";
  preview.querySelector("p").textContent = studioNotes[photo.mode] + lowResolution;
  preview.classList.toggle("is-low-res", Boolean(lowResolution));
  let reset = preview.querySelector(".studio-reset");
  if (photo.canEdit && !reset) {
    reset = document.createElement("button");
    reset.type = "button";
    reset.className = "remove-button account-link studio-reset";
    reset.textContent = "Reset background removal";
    preview.append(reset);
  }
  if (reset) reset.hidden = !photo.canEdit;
}

// Builds the photo for a form from its file input and studio switch, and
// shows a preview so the admin sees exactly what will be saved.
async function preparePhoto(form) {
  const file = form.elements.image?.files[0];
  const preview = form.querySelector(".studio-preview");
  if (!file) {
    preparedPhotos.delete(form);
    if (preview) preview.hidden = true;
    return null;
  }
  const job = window.zenzoStudio.createStudioPhoto(file, { studio: form.elements.studio?.checked !== false });
  preparedPhotos.set(form, job);
  if (preview) {
    preview.hidden = false;
    preview.querySelector("p").textContent = "Preparing photo...";
  }
  try {
    const photo = await job;
    if (preparedPhotos.get(form) === job) showPreview(form, photo);
    return photo;
  } catch (error) {
    if (preview) preview.querySelector("p").textContent = error.message;
    throw error;
  }
}

async function photoFor(form) {
  if (!form.elements.image?.files[0]) return "";
  const photo = await (preparedPhotos.get(form) || preparePhoto(form));
  return photo.dataUrl;
}

document.addEventListener("change", (event) => {
  const form = event.target.closest("form");
  if (form && (event.target.name === "image" || event.target.name === "studio")) {
    preparePhoto(form).catch(() => {});
  }
});

document.addEventListener("click", async (event) => {
  const preview = event.target.closest(".studio-preview");
  const form = preview?.closest("form");
  const job = form && preparedPhotos.get(form);
  if (!job) return;
  const photo = await job;
  if (!photo.canEdit) return;
  if (event.target.closest(".studio-reset")) {
    photo.reset();
    showPreview(form, photo);
    return;
  }
  const img = event.target.closest(".studio-preview img");
  if (!img) return;
  const box = img.getBoundingClientRect();
  const removed = photo.removeAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  showPreview(form, photo);
  if (!removed) preview.querySelector("p").textContent = "Tap directly on the leftover background inside the product to remove it.";
});

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

  productsList.innerHTML = products.map((product) => {
    const collection = product.collection || "Hot Wheels";
    return `
    <div class="admin-product">
      ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">` : ""}
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(collection)} &middot; ${escapeHtml(product.series)} &middot; ${money.format(product.price)} &middot; Stock ${product.stock}</p>
      </div>
      <button class="remove-button" type="button" data-delete="${escapeHtml(product.id)}">Delete</button>
      <details class="admin-product__edit">
        <summary>Edit</summary>
        <form class="form-grid" data-edit="${escapeHtml(product.id)}">
          <label class="field">
            Collection
            <select name="collection">
              ${collections.map((name) => `<option ${name === collection ? "selected" : ""}>${name}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            Series
            <input name="series" value="${escapeHtml(product.series)}" required>
          </label>
          <label class="field">
            Price in INR
            <input name="price" inputmode="numeric" value="${product.price}" required>
          </label>
          <label class="field">
            Stock
            <input name="stock" inputmode="numeric" value="${product.stock}" required>
          </label>
          <label class="field field--full">
            Notes
            <textarea name="notes">${escapeHtml(product.notes)}</textarea>
          </label>
          <label class="field field--full">
            Replace photo (optional)
            <input name="image" type="file" accept="image/*">
          </label>
          <label class="studio-toggle field--full">
            <input name="studio" type="checkbox" checked>
            Studio look, like the other product photos
          </label>
          <div class="studio-preview field--full" hidden>
            <img alt="Preview of the new product photo">
            <p class="checkout-note"></p>
          </div>
          <button class="admin-order__action field--full" type="submit">Save changes</button>
        </form>
      </details>
    </div>
  `;
  }).join("");
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
  let image = "";
  try {
    image = await photoFor(productForm);
  } catch (error) {
    alert(error.message);
    return;
  }

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
    preparedPhotos.delete(productForm);
    productForm.querySelector(".studio-preview").hidden = true;
    productForm.elements.collection.value = "Hot Wheels";
    productForm.elements.series.value = "Assorted Hot Wheels";
    productForm.elements.year.value = "2025";
    productForm.elements.stock.value = "1";
    productForm.elements.notes.value = "Sealed Hot Wheels pack photographed from available stock.";
    showTab("products");
    productsMessage.textContent = `"${name}" was added to the shop.`;
  } catch (error) {
    alert(error.message);
  }
});

productsList.addEventListener("submit", async (event) => {
  const editForm = event.target.closest("[data-edit]");
  if (!editForm) return;
  event.preventDefault();
  const form = new FormData(editForm);
  const button = editForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const changes = {
      collection: form.get("collection"),
      series: form.get("series"),
      price: form.get("price"),
      stock: form.get("stock"),
      notes: form.get("notes")
    };
    const image = await photoFor(editForm);
    if (image) changes.image = image;
    await api(`/api/admin/products/${encodeURIComponent(editForm.dataset.edit)}`, {
      method: "PATCH",
      body: JSON.stringify(changes)
    });
    renderProducts();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});

productsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const name = button.closest(".admin-product")?.querySelector("h3")?.textContent || "this product";
  if (!window.confirm(`Delete "${name}"? This removes it from the shop and cannot be undone.`)) return;
  button.disabled = true;
  try {
    await api(`/api/admin/products/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" });
    renderProducts();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});

orderFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  orderFilter = button.dataset.filter;
  renderOrders();
});

document.querySelector(".admin-tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (tab) showTab(tab.dataset.tab);
});

document.querySelector(".admin-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const index = tabs.indexOf(currentTab) + (event.key === "ArrowRight" ? 1 : -1);
  const next = tabs[(index + tabs.length) % tabs.length];
  showTab(next);
  document.querySelector(`[data-tab="${next}"]`).focus();
});

dashboard.addEventListener("click", (event) => {
  const link = event.target.closest("[data-go]");
  if (!link) return;
  if (link.dataset.filter) orderFilter = link.dataset.filter;
  showTab(link.dataset.go);
});

window.addEventListener("hashchange", () => {
  const requested = window.location.hash.slice(1);
  if (!dashboard.hidden && tabs.includes(requested) && requested !== currentTab) showTab(requested);
});

dashboard.addEventListener("click", async (event) => {
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
      const status = statusButton.dataset.orderStatus;
      let tracking = "";
      if (status === "dispatched") {
        tracking = window.prompt("Courier and tracking number (optional). The customer gets this in their dispatch email.", "");
        if (tracking === null) {
          button.disabled = false;
          return;
        }
      }
      await api(`/api/admin/orders/${encodeURIComponent(statusButton.dataset.orderId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status, tracking })
      });
    }
    if (currentTab === "dashboard") renderDashboard();
    else renderOrders();
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

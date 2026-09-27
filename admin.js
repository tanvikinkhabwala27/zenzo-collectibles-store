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
  preview.querySelector("p").textContent = studioNotes[photo.mode];
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
    renderProducts();
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

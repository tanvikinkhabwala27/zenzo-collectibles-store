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
  if (name === "add") refreshVariantSelect();
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
  studio: "If any old background is left (for example inside a loop), tap it in the large preview to remove it."
};

function showPreview(form, photo) {
  const preview = form.querySelector(".studio-preview");
  if (!preview) return;
  preview.hidden = false;
  preview.querySelector("img").src = photo.editedDataUrl || photo.dataUrl;
  let choices = preview.querySelector(".studio-choices");
  if (photo.variants && !choices) {
    choices = document.createElement("div");
    choices.className = "studio-choices";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Choose the photo style");
    preview.querySelector("img").after(choices);
  }
  if (choices) {
    choices.hidden = !photo.variants;
    if (photo.variants) {
      choices.innerHTML = [
        ["standard", "Standard"],
        ["accent", "Red accent", "Best for dark or black products"]
      ].map(([value, label, hint]) => `
        <button class="studio-choice${photo.choice === value ? " is-selected" : ""}" type="button" data-studio-choice="${value}" aria-pressed="${photo.choice === value}">
          <img src="${photo.variants[value]}" alt="">
          <span>${label}${photo.choice === value ? " (selected)" : ""}</span>
          ${hint ? `<small>${hint}</small>` : ""}
        </button>
      `).join("");
    }
  }
  preview.querySelector("img").classList.toggle("is-editable", Boolean(photo.canEdit));
  const longest = Math.max(photo.sourceWidth || 0, photo.sourceHeight || 0);
  const lowResolution = longest && longest < 1000
    ? ` This photo is only ${photo.sourceWidth} × ${photo.sourceHeight} pixels, so it will look soft. For a sharp result, upload a photo at least 1200 pixels wide (any recent phone photo is fine).`
    : "";
  preview.querySelector("p").textContent = ((studioNotes[photo.mode] || "") + lowResolution).trim();
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
  let adjust = preview.querySelector(".studio-adjust");
  if (!adjust) {
    adjust = document.createElement("button");
    adjust.type = "button";
    adjust.className = "account-link studio-adjust";
    preview.querySelector("p").before(adjust);
  }
  adjust.textContent = photo.editedDataUrl ? "Adjust crop & lighting again" : "Adjust crop & lighting";
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
  const job = window.zenzoStudio.createStudioPhoto(file, {
    studio: form.elements.studio?.checked !== false,
    stand: usesStand(form.elements.collection?.value)
  });
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
  return photo.editedDataUrl || photo.dataUrl;
}

document.addEventListener("change", (event) => {
  const form = event.target.closest("form");
  if (form && ["image", "studio", "collection"].includes(event.target.name)) {
    preparePhoto(form).catch(() => {});
  }
});

async function fileFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("A product photo could not be loaded.");
  const blob = await response.blob();
  return new File([blob], "current-photo.jpg", { type: blob.type || "image/jpeg" });
}

// Opens the adjust dialog. Studio photos with a cut-out product are adjusted
// on the product only, so the background stays the same as every other
// photo; other photos are adjusted as a whole.
async function adjustPhoto(form, photo) {
  const result = await window.zenzoPhotoEditor.open(photo.adjustable ? photo : photo.editedDataUrl || photo.dataUrl);
  if (!result) return false;
  if (result === "adjusted") delete photo.editedDataUrl;
  else photo.editedDataUrl = result;
  showPreview(form, photo);
  form.querySelector(".studio-preview p").textContent = "Edited photo ready. Select Save changes to publish it.";
  return true;
}

async function prepareExistingPhoto(form, url) {
  const file = await fileFromUrl(url);
  const files = new DataTransfer();
  files.items.add(file);
  form.elements.image.files = files.files;
  return preparePhoto(form);
}

// Bulk studio look: runs every product photo that does not have the dark
// studio look yet through the tool, then lets the admin review and save.
const bulkStudio = document.querySelector("#bulkStudio");
let bulkResults = [];

function renderBulkReview() {
  if (!bulkResults.length) {
    bulkStudio.innerHTML = '<p class="checkout-note">Every product photo already has the studio look. To add red accents to one, use Edit, then "Or edit the current photo".</p>';
    return;
  }
  const selected = bulkResults.filter((item) => item.include).length;
  bulkStudio.innerHTML = `
    <div class="admin-orders-head">
      <div>
        <h2>Review ${bulkResults.length} ${bulkResults.length === 1 ? "photo" : "photos"}</h2>
        <p class="checkout-note">Pick Standard or Red accent for each, untick any to leave as they are, then save.</p>
      </div>
      <button class="remove-button account-link" type="button" data-bulk-cancel>Cancel</button>
    </div>
    <div class="bulk-studio__list">
      ${bulkResults.map((item, index) => `
        <article class="bulk-studio__item${item.include ? "" : " is-skipped"}">
          <label class="bulk-studio__include">
            <input type="checkbox" data-bulk-include="${index}" ${item.include ? "checked" : ""}>
            <strong>${escapeHtml(productLabel(item.product))}</strong>
          </label>
          <div class="bulk-studio__photos">
            <figure><img src="${escapeHtml(item.url)}" alt=""><figcaption>Now</figcaption></figure>
            ${["standard", "accent"].map((variant) => `
              <button class="studio-choice${item.photo.choice === variant ? " is-selected" : ""}" type="button" data-bulk-item="${index}" data-bulk-choice="${variant}" aria-pressed="${item.photo.choice === variant}">
                <img src="${item.photo.variants[variant]}" alt="">
                <span>${variant === "accent" ? "Red accent" : "Standard"}</span>
              </button>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
    <button class="place-order" type="button" data-bulk-save ${selected ? "" : "disabled"}>Save ${selected} selected ${selected === 1 ? "photo" : "photos"}</button>
  `;
}

async function runBulkStudio() {
  const button = document.querySelector("#bulkStudioButton");
  button.disabled = true;
  bulkStudio.hidden = false;
  bulkResults = [];
  bulkStudio.innerHTML = '<p class="checkout-note">Checking photos...</p>';
  try {
    const products = await api("/api/products");
    knownProducts = products;
    for (const [index, product] of products.entries()) {
      bulkStudio.innerHTML = `<p class="checkout-note">Checking photo ${index + 1} of ${products.length}: ${escapeHtml(productLabel(product))}...</p>`;
      let url = currentPhotoUrl(product);
      if (!url) continue;
      try {
        const options = { studio: true, stand: usesStand(product.collection) };
        let photo = await window.zenzoStudio.createStudioPhoto(await fileFromUrl(url), options);
        // A stand that should not be there: start again from the real photo
        // when the repo still has it.
        const original = (window.zenzoOriginalPhotos || {})[product.id];
        if (photo.mode === "unstand" && original) {
          url = original;
          photo = await window.zenzoStudio.createStudioPhoto(await fileFromUrl(url), options);
          photo.choice = "standard";
          bulkResults.push({ product, url, photo, include: true });
          continue;
        }
        // Photos that already have the dark studio look are left alone.
        if (photo.mode !== "restyle" && photo.variants) bulkResults.push({ product, url, photo, include: true });
      } catch {
        // Skip photos that cannot be read.
      }
    }
    renderBulkReview();
  } catch (error) {
    bulkStudio.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
  }
}

async function saveBulkStudio(button) {
  const chosen = bulkResults.filter((item) => item.include);
  button.disabled = true;
  let saved = 0;
  const failed = [];
  for (const item of chosen) {
    button.textContent = `Saving ${saved + 1} of ${chosen.length}...`;
    const { product } = item;
    try {
      await api(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          collection: product.collection || "Hot Wheels",
          series: product.series || "Assorted Hot Wheels",
          price: product.price,
          stock: product.stock,
          notes: product.notes || "",
          image: item.photo.dataUrl
        })
      });
      saved += 1;
    } catch (error) {
      failed.push(`${productLabel(product)}: ${error.message}`);
    }
  }
  bulkResults = [];
  bulkStudio.hidden = true;
  productsMessage.textContent = failed.length
    ? `Saved ${saved} ${saved === 1 ? "photo" : "photos"}. Not saved: ${failed.join("; ")}`
    : `Saved ${saved} ${saved === 1 ? "photo" : "photos"} with the studio look.`;
  renderProducts();
}

document.querySelector("#bulkStudioButton").addEventListener("click", runBulkStudio);

bulkStudio.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-bulk-choice]");
  if (choice) {
    bulkResults[Number(choice.dataset.bulkItem)].photo.choice = choice.dataset.bulkChoice;
    renderBulkReview();
    return;
  }
  if (event.target.closest("[data-bulk-cancel]")) {
    bulkResults = [];
    bulkStudio.hidden = true;
    return;
  }
  const save = event.target.closest("[data-bulk-save]");
  if (save) saveBulkStudio(save);
});

bulkStudio.addEventListener("change", (event) => {
  const include = event.target.closest("[data-bulk-include]");
  if (!include) return;
  bulkResults[Number(include.dataset.bulkInclude)].include = include.checked;
  renderBulkReview();
});

// Runs the product's existing photo through the studio tool, as if it had
// been chosen with Replace photo.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-reedit]");
  if (!button) return;
  const form = button.closest("form");
  button.disabled = true;
  try {
    await prepareExistingPhoto(form, button.dataset.reedit);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", async (event) => {
  const preview = event.target.closest(".studio-preview");
  const form = preview?.closest("form");
  const job = form && preparedPhotos.get(form);
  if (!job) return;
  const photo = await job;
  if (event.target.closest(".studio-adjust")) {
    await adjustPhoto(form, photo);
    return;
  }
  const choice = event.target.closest("[data-studio-choice]");
  if (choice && photo.variants) {
    photo.choice = choice.dataset.studioChoice;
    delete photo.editedDataUrl;
    showPreview(form, photo);
    return;
  }
  if (!photo.canEdit) return;
  if (event.target.closest(".studio-reset")) {
    delete photo.editedDataUrl;
    photo.reset();
    showPreview(form, photo);
    return;
  }
  const img = event.target.closest(".studio-preview > img");
  if (!img) return;
  const box = img.getBoundingClientRect();
  const removed = photo.removeAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  if (removed) delete photo.editedDataUrl;
  showPreview(form, photo);
  if (!removed) preview.querySelector("p").textContent = "Tap directly on the leftover background inside the product to remove it.";
});

let knownProducts = [];

// Hot Wheels photos sit on the black display stand like the car photos;
// every other collection floats like the accessory photos.
function usesStand(collection) {
  return (collection || "Hot Wheels") === "Hot Wheels";
}

// The photo shoppers currently see for a product.
function currentPhotoUrl(product) {
  if (product.image?.startsWith("data:")) return product.image;
  return (window.zenzoShowcaseImages || {})[product.id] || product.image || "";
}

// Where the studio tool starts from: the real photo when the repo still has
// it, so edits never stack on an already edited copy.
function sourcePhotoUrl(product) {
  return (window.zenzoOriginalPhotos || {})[product.id] || currentPhotoUrl(product);
}

function productLabel(product) {
  return product.colorName ? `${product.name} – ${product.colorName}` : product.name;
}

function variantOptions(selectedId, excludeId) {
  return `<option value="">Not a colour of another product</option>${knownProducts
    .filter((product) => product.id !== excludeId)
    .map((product) => `<option value="${escapeHtml(product.id)}" ${product.id === selectedId ? "selected" : ""}>${escapeHtml(productLabel(product))}</option>`)
    .join("")}`;
}

// The product this one is currently grouped with, if any.
function groupedWith(product) {
  if (!product.group || product.group.endsWith(":single")) return "";
  const other = knownProducts.find((item) => item.id !== product.id && (item.group || item.id) === product.group);
  return other ? other.id : "";
}

async function refreshVariantSelect() {
  try {
    knownProducts = await api("/api/products");
  } catch {
    return;
  }
  const select = productForm.querySelector("[data-variant-select]");
  const current = select.value;
  select.innerHTML = variantOptions(current, null);
}

async function renderProducts() {
  let products = [];
  try {
    products = await api("/api/products");
    knownProducts = products;
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
      ${currentPhotoUrl(product) ? `<img src="${escapeHtml(currentPhotoUrl(product))}" alt="${escapeHtml(product.name)}">` : ""}
      <div>
        <h3>${escapeHtml(product.name)}${product.colorName ? ` <span class="admin-colour"><span class="admin-colour__dot" style="background: ${escapeHtml(product.colorHex || "#8a8f98")}"></span>${escapeHtml(product.colorName)}</span>` : ""}</h3>
        <p>${escapeHtml(collection)} &middot; ${escapeHtml(product.series)} &middot; ${money.format(product.price)} &middot; Stock ${product.stock}</p>
      </div>
      <div class="admin-product__quick-actions">
        ${currentPhotoUrl(product) ? `<button class="account-link" type="button" data-edit-photo="${escapeHtml(product.id)}">Edit photo</button>` : ""}
        <button class="remove-button" type="button" data-delete="${escapeHtml(product.id)}">Delete</button>
      </div>
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
            Colour of
            <select name="variantOf">${variantOptions(groupedWith(product), product.id)}</select>
          </label>
          <label class="field">
            Colour name
            <input name="colorName" maxlength="40" value="${escapeHtml(product.colorName || "")}" placeholder="e.g. Pink">
          </label>
          <label class="field">
            Colour dot
            <input name="colorHex" type="color" value="${escapeHtml(product.colorHex || "#e0457b")}">
          </label>
          <label class="field field--full">
            Replace photo (optional)
            <input name="image" type="file" accept="image/*">
          </label>
          ${currentPhotoUrl(product) ? `<button class="remove-button account-link field--full" type="button" data-reedit="${escapeHtml(sourcePhotoUrl(product))}">Or edit the current photo (Standard / Red accent)</button>` : ""}
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

productForm.querySelector("[data-variant-select]").addEventListener("change", (event) => {
  const base = knownProducts.find((product) => product.id === event.target.value);
  if (!base) return;
  const fields = productForm.elements;
  if (!fields.name.value) fields.name.value = base.name;
  fields.collection.value = base.collection || "Hot Wheels";
  fields.series.value = base.series || fields.series.value;
  if (!fields.price.value) fields.price.value = base.price;
  if (base.year) fields.year.value = base.year;
  if (base.notes && !fields.notes.dataset.edited) fields.notes.value = base.notes;
  fields.colorName.focus();
});

productForm.elements.notes.addEventListener("input", () => {
  productForm.elements.notes.dataset.edited = "true";
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
        notes: form.get("notes"),
        variantOf: form.get("variantOf") || "",
        colorName: form.get("colorName") || "",
        colorHex: form.get("colorHex") || ""
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
    delete productForm.elements.notes.dataset.edited;
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
      notes: form.get("notes"),
      variantOf: form.get("variantOf") || "",
      colorName: form.get("colorName") || "",
      colorHex: form.get("colorHex") || ""
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
  const editPhotoButton = event.target.closest("[data-edit-photo]");
  if (editPhotoButton) {
    const product = knownProducts.find((item) => String(item.id) === editPhotoButton.dataset.editPhoto);
    const card = editPhotoButton.closest(".admin-product");
    const details = card?.querySelector(".admin-product__edit");
    const form = details?.querySelector("form");
    if (!product || !form) return;
    details.open = true;
    editPhotoButton.disabled = true;
    editPhotoButton.textContent = "Preparing...";
    try {
      const photo = await prepareExistingPhoto(form, sourcePhotoUrl(product));
      if (await adjustPhoto(form, photo)) {
        form.querySelector(".studio-preview").scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (error) {
      alert(error.message);
    } finally {
      editPhotoButton.disabled = false;
      editPhotoButton.textContent = "Edit photo";
    }
    return;
  }

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

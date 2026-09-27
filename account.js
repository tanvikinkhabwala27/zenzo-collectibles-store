const signInPanel = document.querySelector("#signInPanel");
const ordersPanel = document.querySelector("#ordersPanel");
const passwordForm = document.querySelector("#passwordForm");
const emailForm = document.querySelector("#emailForm");
const codeForm = document.querySelector("#codeForm");
const googleSignIn = document.querySelector("#googleSignIn");
const signInDivider = document.querySelector("#signInDivider");
const signInLinks = document.querySelector("#signInLinks");
const codeLinks = document.querySelector("#codeLinks");
const signInUnavailable = document.querySelector("#signInUnavailable");
const signInMessage = document.querySelector("#signInMessage");
const signInTitle = document.querySelector("#signInTitle");
const signInIntro = document.querySelector("#signInIntro");
const codeSentTo = document.querySelector("#codeSentTo");
const codeSubmit = document.querySelector("#codeSubmit");
const newPasswordField = document.querySelector("#newPasswordField");
const newPasswordLabel = document.querySelector("#newPasswordLabel");
const signedInAs = document.querySelector("#signedInAs");
const customerOrders = document.querySelector("#customerOrders");
const signupTab = document.querySelector('.account-tab[data-mode="signup"]');
const modes = {
  signin: {
    title: "Welcome back",
    intro: "Sign in to see your orders."
  },
  signup: {
    title: "Create an account",
    intro: "We'll email you a code to confirm your address, then you choose a password. Orders placed with this email appear in your account automatically.",
    submit: "Create account",
    passwordLabel: "Choose a password (at least 8 characters)"
  },
  code: {
    title: "Sign in with a code",
    intro: "No account needed. We'll email you a 6-digit code to see the orders placed with your email.",
    submit: "Sign in"
  },
  reset: {
    title: "Reset your password",
    intro: "We'll email you a code, then you can choose a new password.",
    submit: "Save password and sign in",
    passwordLabel: "New password (at least 8 characters)"
  }
};
let currentMode = "signin";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const statusLabels = {
  payment_pending: "Payment not completed",
  paid: "Confirmed - being packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
let pendingEmail = "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
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

function formatDate(value) {
  return value ? dateFormat.format(new Date(value)) : "";
}

function orderMarkup(order) {
  const items = order.items.map((item) => `
    <div class="order-line">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>Qty ${item.quantity}</p>
      </div>
      <strong>${money.format(item.price * item.quantity)}</strong>
    </div>
  `).join("");
  const steps = [
    ["Ordered", order.createdAt],
    ["Paid", order.paidAt],
    ["Dispatched", order.dispatchedAt],
    ["Delivered", order.deliveredAt]
  ].filter(([, date]) => date).map(([label, date]) => `${label} ${formatDate(date)}`).join(" &middot; ");
  const shipping = order.shipping || {};
  return `
    <article class="admin-order admin-order--${escapeHtml(order.status)}">
      <div class="admin-order__top">
        <strong>${escapeHtml(order.orderId)}</strong>
        <span class="admin-order__status">${escapeHtml(statusLabels[order.status] || order.status)}</span>
      </div>
      <p>${steps}</p>
      <div class="order-list">${items}</div>
      <div class="checkout-total"><span>Total</span><strong>${money.format(order.total)}</strong></div>
      <p>Delivering to ${escapeHtml(shipping.city)}${shipping.pin ? ` ${escapeHtml(shipping.pin)}` : ""}</p>
    </article>
  `;
}

async function showOrders(email) {
  signInPanel.hidden = true;
  ordersPanel.hidden = false;
  signedInAs.textContent = `Signed in as ${email}`;
  customerOrders.innerHTML = '<p class="empty-state">Loading your orders...</p>';
  try {
    const orders = await api("/api/account/orders");
    customerOrders.innerHTML = orders.length
      ? orders.map(orderMarkup).join("")
      : '<p class="empty-state">No orders for this email yet. <a href="index.html#catalog">Start shopping</a></p>';
  } catch (error) {
    if (error.status === 401) {
      showSignIn();
      return;
    }
    customerOrders.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function showSignIn() {
  ordersPanel.hidden = true;
  signInPanel.hidden = false;
}

function showEmailStep() {
  codeForm.hidden = true;
  codeForm.reset();
  emailForm.hidden = false;
  signInMessage.textContent = "";
}

function setMode(mode) {
  currentMode = mode;
  const settings = modes[mode];
  signInTitle.textContent = settings.title;
  signInIntro.textContent = settings.intro;
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    panel.hidden = !panel.dataset.modePanel.split(" ").includes(mode);
  });
  document.querySelectorAll(".account-tab").forEach((tab) => {
    const active = tab.dataset.mode === (mode === "signup" ? "signup" : "signin");
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const needsPassword = Boolean(settings.passwordLabel);
  newPasswordField.hidden = !needsPassword;
  newPasswordField.querySelector("input").required = needsPassword;
  if (needsPassword) newPasswordLabel.textContent = settings.passwordLabel;
  codeSubmit.textContent = settings.submit || "Continue";
  codeLinks.innerHTML = mode === "signup"
    ? '<button class="remove-button account-link" type="button" data-mode="code">Just checking an order? Use a one-time code instead</button>'
    : '<button class="remove-button account-link" type="button" data-mode="signin">Back to sign in</button>';
  showEmailStep();
}

async function signedIn(email) {
  signInMessage.textContent = "";
  passwordForm.reset();
  showEmailStep();
  await showOrders(email);
}

function loadGoogle(clientId) {
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.onload = () => {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        signInMessage.textContent = "Signing you in...";
        try {
          const { email } = await api("/api/account/google", {
            method: "POST",
            body: JSON.stringify({ credential })
          });
          signedIn(email);
        } catch (error) {
          signInMessage.textContent = error.message;
        }
      }
    });
    window.google.accounts.id.renderButton(googleSignIn, {
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: Math.min(360, googleSignIn.clientWidth || 360)
    });
  };
  script.onerror = () => {
    googleSignIn.hidden = true;
    signInDivider.hidden = true;
  };
  document.head.append(script);
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = emailForm.querySelector("button");
  pendingEmail = String(new FormData(emailForm).get("email") || "").trim().toLowerCase();
  button.disabled = true;
  signInMessage.textContent = "Sending your code...";
  try {
    await api("/api/account/code", { method: "POST", body: JSON.stringify({ email: pendingEmail }) });
    emailForm.hidden = true;
    codeForm.hidden = false;
    codeSentTo.textContent = `We emailed a 6-digit code to ${pendingEmail}. It expires in 10 minutes.`;
    signInMessage.textContent = "";
    codeForm.elements.code.focus();
  } catch (error) {
    signInMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(codeForm);
  const body = { email: pendingEmail, code: String(form.get("code") || "") };
  if (modes[currentMode].passwordLabel) body.password = String(form.get("password") || "");
  codeSubmit.disabled = true;
  signInMessage.textContent = "Checking your code...";
  try {
    const { email } = await api("/api/account/verify", { method: "POST", body: JSON.stringify(body) });
    signedIn(email);
  } catch (error) {
    signInMessage.textContent = error.message;
  } finally {
    codeSubmit.disabled = false;
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = passwordForm.querySelector("button");
  const form = new FormData(passwordForm);
  button.disabled = true;
  signInMessage.textContent = "Signing you in...";
  try {
    const { email } = await api("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    signedIn(email);
  } catch (error) {
    signInMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

signInPanel.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-mode]");
  if (trigger) setMode(trigger.dataset.mode);
});

document.querySelector("#changeEmail").addEventListener("click", showEmailStep);

document.querySelector("#signOut").addEventListener("click", async () => {
  await api("/api/account/logout", { method: "POST" }).catch(() => {});
  window.google?.accounts.id.disableAutoSelect();
  setMode("signin");
  showSignIn();
});

async function init() {
  const [config, me] = await Promise.all([
    api("/api/account/config").catch(() => ({})),
    api("/api/account/me").catch(() => ({}))
  ]);
  const emailAccounts = Boolean(config.emailCode);
  passwordForm.hidden = !(emailAccounts && config.passwords);
  signInLinks.hidden = !emailAccounts;
  signupTab.hidden = !emailAccounts;
  if (config.googleClientId) {
    googleSignIn.hidden = false;
    loadGoogle(config.googleClientId);
  }
  signInDivider.hidden = !(!passwordForm.hidden && config.googleClientId);
  signInUnavailable.hidden = Boolean(emailAccounts || config.googleClientId);
  setMode(new URLSearchParams(window.location.search).get("mode") === "signup" && emailAccounts ? "signup" : "signin");
  if (me.email) {
    showOrders(me.email);
  } else {
    showSignIn();
  }
}

init();

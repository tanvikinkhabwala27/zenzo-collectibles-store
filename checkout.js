let inventory = [];
const cart = JSON.parse(localStorage.getItem("dieCastGarageCart") || "[]");
const orderList = document.querySelector("#orderList");
const subtotalEl = document.querySelector("#checkoutSubtotal");
const form = document.querySelector("#checkoutForm");
const checkoutNote = document.querySelector("#checkoutNote");
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
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
          <h3>${item.name}</h3>
          <p>Qty ${quantity}</p>
        </div>
        <strong>${money.format(item.price * quantity)}</strong>
      </div>
    `).join("");
  }

  subtotalEl.textContent = money.format(subtotal);
}

function openRazorpay(order, formData) {
  if (!window.Razorpay || !order.paymentConfigured) {
    checkoutNote.textContent = "Payment gateway keys are not configured yet. Add Razorpay live keys on the production server before taking payments.";
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
      ondismiss() {
        checkoutNote.textContent = "Payment window closed. Your cart is saved, so you can try again.";
      }
    },
    async handler(response) {
      checkoutNote.textContent = "Confirming your payment...";
      try {
        await api("/api/orders/verify", {
          method: "POST",
          body: JSON.stringify(response)
        });
        localStorage.removeItem("dieCastGarageCart");
        checkoutNote.textContent = `Payment confirmed for order ${order.orderId}. Zenzo will dispatch your order soon.`;
        form.reset();
        orderList.innerHTML = '<p class="empty-state">Payment received. Your cart is now clear.</p>';
        subtotalEl.textContent = money.format(0);
      } catch {
        checkoutNote.textContent = `Payment received but confirmation is still pending for order ${order.orderId}. Please keep your UPI reference; Zenzo will confirm shortly.`;
      }
    }
  });
  razorpay.on("payment.failed", (response) => {
    checkoutNote.textContent = response?.error?.description || "Payment failed. Please try again.";
  });
  razorpay.open();
  checkoutNote.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const orderLines = getOrderLines();

  if (!orderLines.length) {
    alert("Your cart is empty. Please add a product before checkout.");
    return;
  }

  const formData = new FormData(form);
  checkoutNote.textContent = "Preparing secure checkout...";

  try {
    const order = await api("/api/orders", {
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
    openRazorpay(order, formData);
  } catch (error) {
    checkoutNote.textContent = error.message;
  }
});

async function init() {
  try {
    inventory = await api("/api/products");
  } catch {
    inventory = [];
  }
  renderCheckout();
}

init();

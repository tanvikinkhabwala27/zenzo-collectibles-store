const baseInventory = [
  {
    id: "f1-race-team-5-pack",
    name: "Hot Wheels Formula 1 Race Team 5-Pack",
    series: "Formula 1 Collection",
    year: 2025,
    condition: "Sealed Pack",
    price: 1499,
    stock: 7,
    image: "assets/catalog/f1-5-pack.jpg",
    imageAlt: "Hot Wheels Formula 1 Race Team 5-Pack in retail packaging",
    color: "#e1262f",
    bg: "#e7edf2",
    glass: "#b9dfee",
    notes: "Set of 5 Formula 1-themed 1:64 die-cast race cars. New carded packs; 7 available."
  },
  {
    id: "mystery-models-foil-pack",
    name: "Hot Wheels Mystery Models Foil Pack",
    series: "Mystery Models",
    year: 2025,
    condition: "Sealed",
    price: 249,
    stock: 25,
    image: "assets/catalog/mystery-models.jpg",
    imageAlt: "Hot Wheels Mystery Models sealed foil pack",
    color: "#0b8ec9",
    bg: "#dceef8",
    glass: "#b9dfee",
    notes: "Sealed surprise pack with one 1:64 Hot Wheels vehicle and matching sticker inside. 25 available."
  },
  {
    id: "assorted-2-pack-blue-orange",
    name: "Hot Wheels Blue & Orange Sealed 2-Pack",
    series: "Assorted Hot Wheels",
    year: 2025,
    condition: "Sealed Pack",
    price: 899,
    stock: 1,
    image: "assets/catalog/blue-orange-2-pack.jpg",
    imageAlt: "Two sealed Hot Wheels packs with blue and orange cars",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Two sealed Hot Wheels packs photographed from the actual available stock."
  },
  {
    id: "assorted-3-pack-sports-cars",
    name: "Hot Wheels Sports Car Sealed 3-Pack",
    series: "Assorted Hot Wheels",
    year: 2025,
    condition: "Sealed Pack",
    price: 1199,
    stock: 1,
    image: "assets/catalog/sports-car-3-pack.jpg",
    imageAlt: "Three sealed Hot Wheels sports car packs",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Three sealed Hot Wheels packs photographed from the actual available stock."
  },
  {
    id: "classic-black-racer",
    name: "Hot Wheels Classic Black Racer",
    series: "Vintage Racing Club",
    year: 2025,
    condition: "Sealed Pack",
    price: 699,
    stock: 1,
    image: "assets/catalog/classic-black-racer.jpg",
    imageAlt: "Sealed Hot Wheels classic black race car",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Single sealed Hot Wheels pack with actual product photo."
  },
  {
    id: "classic-red-racer",
    name: "Hot Wheels Classic Red Racer",
    series: "Vintage Racing Club",
    year: 2025,
    condition: "Sealed Pack",
    price: 699,
    stock: 1,
    image: "assets/catalog/classic-red-racer.jpg",
    imageAlt: "Sealed Hot Wheels classic red race car",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Single sealed Hot Wheels pack with actual product photo."
  },
  {
    id: "classic-orange-pickup",
    name: "Hot Wheels Classic Orange Pickup",
    series: "Vintage Racing Club",
    year: 2025,
    condition: "Sealed Pack",
    price: 699,
    stock: 1,
    image: "assets/catalog/classic-orange-pickup.jpg",
    imageAlt: "Sealed Hot Wheels classic orange pickup",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Single sealed Hot Wheels pack with actual product photo."
  },
  {
    id: "assorted-jdm-3-pack",
    name: "Hot Wheels JDM Sealed 3-Pack",
    series: "Assorted Hot Wheels",
    year: 2025,
    condition: "Sealed Pack",
    price: 1199,
    stock: 1,
    image: "assets/catalog/jdm-3-pack.jpg",
    imageAlt: "Three sealed Hot Wheels JDM-style packs",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Three sealed Hot Wheels packs photographed from the actual available stock."
  },
  {
    id: "assorted-city-3-pack",
    name: "Hot Wheels City Sealed 3-Pack",
    series: "Assorted Hot Wheels",
    year: 2025,
    condition: "Sealed Pack",
    price: 1199,
    stock: 1,
    image: "assets/catalog/city-3-pack.jpg",
    imageAlt: "Three sealed Hot Wheels city vehicle packs",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Three sealed Hot Wheels packs photographed from the actual available stock."
  },
  {
    id: "classic-silver-wagon",
    name: "Hot Wheels Classic Silver Wagon",
    series: "Vintage Racing Club",
    year: 2025,
    condition: "Sealed Pack",
    price: 699,
    stock: 1,
    image: "assets/catalog/classic-silver-wagon.jpg",
    imageAlt: "Sealed Hot Wheels classic silver wagon",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Single sealed Hot Wheels pack with actual product photo."
  },
  {
    id: "assorted-character-3-pack",
    name: "Hot Wheels Character & Concept 3-Pack",
    series: "Assorted Hot Wheels",
    year: 2025,
    condition: "Sealed Pack",
    price: 1199,
    stock: 1,
    image: "assets/catalog/character-concept-3-pack.jpg",
    imageAlt: "Three sealed Hot Wheels character and concept vehicle packs",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Three sealed Hot Wheels packs photographed from the actual available stock."
  },
  {
    id: "assorted-performance-3-pack",
    name: "Hot Wheels Performance Sealed 3-Pack",
    series: "Assorted Hot Wheels",
    year: 2025,
    condition: "Sealed Pack",
    price: 1199,
    stock: 1,
    image: "assets/catalog/performance-3-pack.jpg",
    imageAlt: "Three sealed Hot Wheels performance vehicle packs",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Three sealed Hot Wheels packs photographed from the actual available stock."
  },
  {
    id: "batman-barbie-2-pack",
    name: "Hot Wheels Batman & Barbie 2-Pack",
    series: "Character Cars",
    year: 2025,
    condition: "Sealed Pack",
    price: 999,
    stock: 1,
    image: "assets/catalog/batman-barbie-2-pack.jpg",
    imageAlt: "Two sealed Hot Wheels Batman and Barbie themed packs",
    color: "#242424",
    bg: "#f8f7f3",
    glass: "#ffffff",
    notes: "Two sealed themed Hot Wheels packs photographed from the actual available stock."
  }
];

function loadAdminProducts() {
  try {
    return JSON.parse(localStorage.getItem("zenzoAdminProducts") || "[]");
  } catch {
    return [];
  }
}

let inventory = [...baseInventory, ...loadAdminProducts()];

const state = {
  query: "",
  collection: "all",
  sort: "featured",
  cart: JSON.parse(localStorage.getItem("dieCastGarageCart") || "[]")
};

const productGrid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const cartPanel = document.querySelector("#cartPanel");
const cartButton = document.querySelector("#cartButton");
const closeCart = document.querySelector("#closeCart");
const scrim = document.querySelector("#scrim");
const cartCount = document.querySelector("#cartCount");
const cartItems = document.querySelector("#cartItems");
const cartSubtotal = document.querySelector("#cartSubtotal");
const checkoutLink = document.querySelector("#checkoutLink");

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const assetVersion = "zenzo-race-theme-18";

function productCollection(product) {
  return product.collection || "Hot Wheels";
}

async function loadProductsFromApi() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Products API unavailable.");
    inventory = await response.json();
  } catch {
    inventory = [...baseInventory, ...loadAdminProducts()];
  }
}

function filteredInventory() {
  const query = state.query.trim().toLowerCase();
  const cars = inventory.filter((car) => {
    const matchesCollection = state.collection === "all" || productCollection(car) === state.collection;
    const haystack = `${car.name} ${productCollection(car)} ${car.series} ${car.year} ${car.condition}`.toLowerCase();
    return matchesCollection && haystack.includes(query);
  });

  return cars.sort((a, b) => {
    if (state.sort === "priceAsc") return a.price - b.price;
    if (state.sort === "priceDesc") return b.price - a.price;
    if (state.sort === "yearDesc") return b.year - a.year;
    return inventory.indexOf(a) - inventory.indexOf(b);
  });
}

function cartQuantity(id) {
  return state.cart.filter((itemId) => itemId === id).length;
}

function carMarkup(car) {
  const inCart = cartQuantity(car.id);
  const remaining = car.stock - inCart;
  const stockLabel = car.stock > 1 ? `${remaining} of ${car.stock} left` : remaining > 0 ? "1 available" : "Sold out";
  const buttonText = remaining > 0 ? inCart > 0 ? "Add another" : "Add to cart" : "Sold out";
  const imageSrc = car.image && car.image.startsWith("data:") ? car.image : `${car.image}?v=${assetVersion}`;
  const detailsHref = `product.html?id=${encodeURIComponent(car.id)}`;
  const media = car.image ? `<img class="product-photo" src="${imageSrc}" alt="${car.imageAlt || car.name}" onerror="this.hidden = true; this.nextElementSibling.hidden = false;"><span class="photo-fallback" hidden>Photo unavailable</span>` : `
        <div class="toy-car" aria-hidden="true">
          <div class="toy-car__roof"></div>
          <div class="toy-car__body"></div>
          <div class="toy-car__stripe"></div>
          <div class="toy-car__wheel"></div>
          <div class="toy-car__wheel"></div>
        </div>
  `;

  return `
    <article class="product-card" data-details="${detailsHref}">
      <a class="product-link product-media" href="${detailsHref}" style="--car: ${car.color}; --car-bg: ${car.bg}; --glass: ${car.glass};" aria-label="View ${car.name}">
        ${media}
      </a>
      <div class="product-info">
        <a class="product-title-link" href="${detailsHref}">
          <div class="product-topline">
            <h3>${car.name}</h3>
          </div>
        </a>
        <div class="product-actions-row">
          <span class="price">${money.format(car.price)}</span>
        </div>
        <p class="meta">
          <span>${productCollection(car)}</span>
          <span>${car.series}</span>
          <span>${car.year}</span>
          <span>${stockLabel}</span>
        </p>
        <a class="details-link" href="${detailsHref}">View details</a>
        <button class="add-button" type="button" data-add="${car.id}" ${remaining <= 0 ? "disabled" : ""}>${buttonText}</button>
      </div>
    </article>
  `;
}

function renderProducts() {
  const cars = filteredInventory();
  productGrid.innerHTML = cars.map(carMarkup).join("");
  emptyState.hidden = cars.length > 0;
}

function renderCart() {
  localStorage.setItem("dieCastGarageCart", JSON.stringify(state.cart));
  cartCount.textContent = state.cart.length;
  const subtotal = state.cart.reduce((sum, id) => {
    const car = inventory.find((item) => item.id === id);
    return sum + (car ? car.price : 0);
  }, 0);

  if (!state.cart.length) {
    cartItems.innerHTML = '<p class="empty-state">Your cart is empty.</p>';
  } else {
    cartItems.innerHTML = [...new Set(state.cart)].map((id) => {
      const car = inventory.find((item) => item.id === id);
      const quantity = cartQuantity(id);
      return `
        <div class="cart-item">
          <div>
            <h3>${car.name}</h3>
            <p>${car.series} &middot; Qty ${quantity}</p>
          </div>
          <strong>${money.format(car.price * quantity)}</strong>
          <button class="remove-button" type="button" data-remove="${car.id}">Remove</button>
        </div>
      `;
    }).join("");
  }

  cartSubtotal.textContent = money.format(subtotal);
  checkoutLink.href = state.cart.length ? "checkout.html" : "#catalog";
}

function openCart() {
  cartPanel.classList.add("is-open");
  cartPanel.setAttribute("aria-hidden", "false");
  cartButton.setAttribute("aria-expanded", "true");
  scrim.hidden = false;
}

function hideCart() {
  cartPanel.classList.remove("is-open");
  cartPanel.setAttribute("aria-hidden", "true");
  cartButton.setAttribute("aria-expanded", "false");
  scrim.hidden = true;
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) {
    const card = event.target.closest("[data-details]");
    if (card && !event.target.closest("a")) window.location.href = card.dataset.details;
    return;
  }
  const car = inventory.find((item) => item.id === button.dataset.add);
  if (!car || cartQuantity(car.id) >= car.stock) return;
  state.cart.push(car.id);
  renderProducts();
  renderCart();
  openCart();
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  const index = state.cart.indexOf(button.dataset.remove);
  if (index >= 0) state.cart.splice(index, 1);
  renderProducts();
  renderCart();
});

document.querySelectorAll("[data-collection]").forEach((button) => {
  button.addEventListener("click", () => {
    state.collection = button.dataset.collection;
    document.querySelectorAll("[data-collection]").forEach((card) => card.classList.toggle("is-active", card === button));
    renderProducts();
  });
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderProducts();
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  renderProducts();
});

cartButton.addEventListener("click", openCart);
closeCart.addEventListener("click", hideCart);
scrim.addEventListener("click", hideCart);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCart();
});

async function init() {
  await loadProductsFromApi();
  renderProducts();
  renderCart();
}

init();

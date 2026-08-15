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
const productDetail = document.querySelector("#productDetail");
const params = new URLSearchParams(window.location.search);
let product = inventory.find((item) => item.id === params.get("id"));
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const assetVersion = "zenzo-race-theme-30";

function productCollection(item) {
  return item.collection || "Hot Wheels";
}

async function loadProductsFromApi() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Products API unavailable.");
    inventory = await response.json();
    product = inventory.find((item) => item.id === params.get("id"));
  } catch {
    inventory = [...baseInventory, ...loadAdminProducts()];
    product = inventory.find((item) => item.id === params.get("id"));
  }
}

function getCart() {
  return JSON.parse(localStorage.getItem("dieCastGarageCart") || "[]");
}

function setCart(cart) {
  localStorage.setItem("dieCastGarageCart", JSON.stringify(cart));
}

function cartQuantity(id) {
  return getCart().filter((itemId) => itemId === id).length;
}

function renderMissingProduct() {
  productDetail.innerHTML = `
    <div class="checkout-panel">
      <div class="checkout-panel__body">
        <p class="eyebrow">Product</p>
        <h1>Listing not found</h1>
        <p class="checkout-note">This product may have moved or been removed.</p>
        <a class="primary-link" href="index.html#catalog">Back to current listings</a>
      </div>
    </div>
  `;
}

function renderProduct() {
  const inCart = cartQuantity(product.id);
  const remaining = product.stock - inCart;
  const stockLabel = product.stock > 1 ? `${remaining} of ${product.stock} left` : remaining > 0 ? "1 available" : "Sold out";
  const buttonText = remaining > 0 ? inCart > 0 ? "Add another" : "Add to cart" : "Sold out";
  const imageSrc = product.image && product.image.startsWith("data:") ? product.image : `${product.image}?v=${assetVersion}`;
  document.title = `${product.name} | Zenzo`;

  productDetail.innerHTML = `
    <div class="product-detail__media">
      <img src="${imageSrc}" alt="${product.imageAlt || product.name}" onerror="this.hidden = true; this.nextElementSibling.hidden = false;">
      <span class="photo-fallback" hidden>Photo unavailable</span>
    </div>
    <div class="product-detail__info">
      <p class="eyebrow">${productCollection(product)}</p>
      <h1>${product.name}</h1>
      <strong class="product-detail__price">${money.format(product.price)}</strong>
      <p class="meta">
        <span>${product.series}</span>
        <span>${product.year}</span>
        <span>${stockLabel}</span>
      </p>
      <div class="detail-block">
        <h2>Description</h2>
        <p>${product.notes}</p>
      </div>
      <div class="detail-block">
        <h2>Payment</h2>
        <p>UPI payment is handled through secure checkout and confirmed before dispatch.</p>
      </div>
      <div class="product-detail__actions">
        <button class="add-button" id="detailAddButton" type="button" ${remaining <= 0 ? "disabled" : ""}>${buttonText}</button>
        <a class="checkout-link" href="checkout.html">Go to checkout</a>
      </div>
      <p class="checkout-note" id="detailMessage"></p>
    </div>
  `;
}

async function init() {
  await loadProductsFromApi();
  if (!product) {
    renderMissingProduct();
    return;
  }
  renderProduct();
  productDetail.addEventListener("click", (event) => {
    const button = event.target.closest("#detailAddButton");
    if (!button) return;
    const cart = getCart();
    if (cartQuantity(product.id) >= product.stock) return;
    cart.push(product.id);
    setCart(cart);
    renderProduct();
    const message = document.querySelector("#detailMessage");
    if (message) message.textContent = "Added to cart.";
  });
}

init();

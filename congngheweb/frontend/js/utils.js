let cart = [];

function syncCartState() {
    try {
        cart = JSON.parse(localStorage.getItem("cart")) || [];
    } catch {
        cart = [];
    }
}

syncCartState();

function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
    window.dispatchEvent(new Event("cart-updated"));
}

function formatCurrency(num) {
    return num.toLocaleString("vi-VN") + "đ";
}

function updateCartUI() {
    syncCartState();

    let count = 0;
    let total = 0;

    cart.forEach((item) => {
        count += item.quantity;
        total += item.price * item.quantity;
    });

    const cartCount = document.getElementById("cart-count");
    const cartTotal = document.getElementById("cart-total");

    if (cartCount) cartCount.innerText = count;
    if (cartTotal) cartTotal.innerText = total.toLocaleString("vi-VN") + "đ";

    renderMiniCart();
}

function renderMiniCart() {
    const box = document.getElementById("mini-cart");
    if (!box) return;

    if (!cart.length) {
        box.innerHTML = `<p class="mini-empty">Giỏ hàng trống</p>`;
        return;
    }

    box.innerHTML = "";

    cart.slice(0, 4).forEach((item) => {
        box.innerHTML += `
      <div class="mini-item">
        <img src="${item.img}" alt="">
        <div class="mini-info">
          <p>${item.name}</p>
          <small>${item.quantity} x ${item.price.toLocaleString()}đ</small>
        </div>
      </div>
    `;
    });

    if (cart.length > 4) {
        box.innerHTML += `<p style="text-align:center;">+ thêm...</p>`;
    }
}

window.addEventListener("storage", (event) => {
    if (event.key !== "cart") return;
    syncCartState();
    updateCartUI();
});

window.addEventListener("cart-updated", () => {
    syncCartState();
    updateCartUI();
});

window.addEventListener("pageshow", () => {
    syncCartState();
    updateCartUI();
});

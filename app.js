import {
  productViewer,
  mountProductViewer,
} from "./components/product-viewer.js";
import "./components/ambient-waves.css";
import {
  mountScrollEffect,
  clearScrollEffect,
} from "./components/home-scroll-effect.jsx";
import {
  clearProductEffects,
  mountProductEffects,
} from "./components/home-product-effects.js";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import { catalog, connected, supabase } from "./catalog.js";
import {
  money,
  priceSen,
  addToBag,
  subtotal,
  bagErrors,
  restore,
  escapeHTML as e,
} from "./model.js";
const app = document.querySelector("#app");
let demoAdmin = sessionStorage.getItem("crownetic.demo.admin") === "yes";
let products = [],
  allProducts = [],
  filter = "All",
  toastTimer;
let bag = restore(localStorage.getItem("crownetic.bag.v1"), []).filter(
  (l) =>
    l !== null &&
    typeof l === "object" &&
    typeof l.productId === "string" &&
    typeof l.size === "string" &&
    Number.isSafeInteger(l.quantity) &&
    l.quantity > 0,
);
const arrow =
  '<span aria-hidden="true" class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 12h17M14 6l6 6-6 6"/></svg></span>';
const bagIcon =
  '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 6h12l1 12H3L4 6Z"/><path d="M7 7V5a3 3 0 0 1 6 0v2"/></svg>';
const link = (path, text, cls = "") =>
  `<a class="${cls}" href="#${path}" data-link>${text}</a>`;
function toast(message) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}
function persistBag() {
  localStorage.setItem(
    "crownetic.bag.v1",
    JSON.stringify({ version: 1, data: bag }),
  );
}
function shell(content) {
  return `<div class="announcement">INDEPENDENT STREETWEAR <span>·</span> KUALA LUMPUR, MALAYSIA</div><header class="masthead">${link("/", '<img src="/assets/logo-black.png" alt="CROWNETIC" width="2172" height="724">', "wordmark brand-logo")}<nav class="nav" aria-label="Main navigation"><div class="nav-left">${link("/shop", "SHOP ALL")}${link("/shop?collection=new", "NEW DROP")}${link("/about", "OUR STORY")}</div><span class="location">3.1390° N &nbsp; 101.6869° E</span><div class="nav-right">${link("/bag", `${bagIcon} BAG (${bag.reduce((n, l) => n + l.quantity, 0)})`, "bag-link")}</div></nav></header><main id="main">${content}</main><footer class="footer"><div class="footer-top"><div>${link("/", '<img src="/assets/logo-black.png" alt="CROWNETIC" width="2172" height="724" loading="lazy">', "footer-logo brand-logo")}<p>Same city. Different perspective.</p></div><div class="footer-links">${link("/shop", "Shop the collection")}${link("/about", "Our story")}<a href="https://www.instagram.com/crownnetic.official/" target="_blank" rel="noopener noreferrer">Instagram ↗</a>${link("/admin", "Studio / Admin")}</div></div><div class="footer-bottom"><span>Copyright © ${new Date().getFullYear()} CROWNETIC. All rights reserved.</span><span>${connected ? "SUPABASE CONNECTED" : "INTERACTIVE DEMO"} &nbsp; · &nbsp; MYR RM &nbsp; · &nbsp; SAMPLE IMAGERY</span></div></footer>`;
}
function card(p, i = 0) {
  return `<article class="product-card">${link(`/product/${encodeURIComponent(p.id)}`, `<div class="product-image"><img src="${e(p.image_url)}" alt="${e(p.name)} — illustrative product photograph" loading="lazy">${i === 0 ? '<span class="product-badge">COLLECTION 001</span>' : ""}<span class="product-open" aria-hidden="true">${arrow}</span></div><div class="product-meta"><span>${e(p.name)}</span><span>${money(p.price_sen)}</span></div><p class="product-caption">${e(p.tag || "THE CROWNETIC COLLECTION")}</p>`)}</article>`;
}
function home() {
  return `<section id="scroll-campaign" aria-label="Collection 001 campaign"></section><section class="campaign-intro"><span class="small-label">THE CONCRETE ARCHIVE / VOL. 001</span><p>Heavyweight essentials.<br>Made for your everyday rotation.</p>${link("/shop", "SHOP THE COLLECTION " + arrow, "button")}</section><div class="ticker"><span>INDEPENDENT BY NATURE</span><b>✳</b><span>NOT FOR EVERYONE. FOR YOU.</span><b>✳</b><span>KUALA LUMPUR TO EVERYWHERE</span></div><section class="section home-products"><div class="section-top"><div><span class="small-label">THE NEW ROTATION / 001</span><h2>THE EVERYDAY UNIFORM.</h2></div>${link("/shop", "EXPLORE ALL " + arrow, "text-link")}</div><div class="product-grid">${products.slice(0, 3).map(card).join("")}</div></section><section class="brand-strip"><div><span class="small-label">OUR POINT OF VIEW</span><h2>QUIET CONFIDENCE.<br>LOUD PRESENCE.</h2></div><div><p>For the ones who find their own way. CROWNETIC is an independent streetwear label from Kuala Lumpur, built around a simple idea: wear what feels like you.</p>${link("/about", "THIS IS CROWNETIC " + arrow, "text-link")}</div></section>`;
}
function shop() {
  const list =
    filter === "All" ? products : products.filter((p) => p.category === filter);
  return `<section class="page"><span class="small-label">CROWNETIC / COLLECTION 001</span><h1 class="page-heading">YOUR NEXT ROTATION.</h1><div class="section-top"><div class="filters" aria-label="Product categories">${["All", "Tees", "Bottoms", "Accessories"].map((f) => `<button class="filter ${f === filter ? "active" : ""}" data-filter="${f}" aria-pressed="${f === filter}">${f}</button>`).join("")}</div><span class="small-label">${list.length} PIECES</span></div>${list.length ? `<div class="product-grid">${list.map(card).join("")}</div>` : '<div class="empty"><h2>Something good is coming.</h2><p>No pieces in this category yet.</p></div>'}</section>`;
}
function productPage(id) {
  const p = products.find((p) => p.id === id);
  if (!p) return notFound();
  return `<section class="page"><span class="small-label">${link("/shop", "COLLECTION 001")} / ${e(p.category)}</span><div class="detail">${productViewer(p)}<div class="detail-copy"><span class="small-label">${e(p.tag || "CROWNETIC / 001")}</span><h1>${e(p.name)}</h1><p class="price">${money(p.price_sen)}</p><p class="description">${e(p.description)}</p><form id="add-form" data-product="${e(p.id)}"><label>SELECT YOUR SIZE</label><div class="size-row" role="group" aria-label="Available sizes">${p.variants.map((v) => `<button class="size" type="button" data-size="${e(v.size)}" ${v.stock < 1 ? "disabled" : ""} aria-pressed="false">${e(v.size)}${v.stock < 1 ? " — sold out" : ""}</button>`).join("")}</div><input type="hidden" name="size"><label for="quantity">QUANTITY</label><input id="quantity" name="quantity" type="number" min="1" max="99" value="1" style="width:90px"><p id="product-error" class="error" role="alert"></p><button class="button" type="submit">ADD TO BAG ${arrow}</button></form><div class="detail-note">COLLECTION 001 &nbsp; / &nbsp; ILLUSTRATIVE SAMPLE PRODUCT<br>MYR pricing. Shipping and payments are simulated in this sample.</div></div></div></section>`;
}
function bagPage() {
  if (!bag.length)
    return `<section class="page empty"><span class="small-label">GOOD THINGS TAKE SPACE</span><h1 class="page-heading">YOUR BAG IS EMPTY.</h1><p>Find your next everyday essential.</p>${link("/shop", "EXPLORE THE COLLECTION " + arrow, "button")}</section>`;
  return `<section class="page"><span class="small-label">YOUR SELECTION</span><h1 class="page-heading">THE BAG.</h1><div class="bag-layout"><div>${bag
    .map((line, i) => {
      const p = products.find((p) => p.id === line.productId);
      return `<article class="bag-item">${p ? `<img src="${e(p.image_url)}" alt="${e(p.name)}">` : "<div>Unavailable</div>"}<div><h2>${e(p?.name || "Unavailable item")}</h2><p>SIZE ${e(line.size)}</p><div class="quantity"><button data-quantity="${i}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${line.quantity}</span><button data-quantity="${i}" data-delta="1" aria-label="Increase quantity">+</button></div><button class="remove" data-remove="${i}">Remove</button></div><strong>${money((p?.price_sen || 0) * line.quantity)}</strong></article>`;
    })
    .join("")}</div>${summary(true)}</div></section>`;
}
function summary(checkout = false) {
  const errors = bagErrors(bag, products);
  return `<aside class="summary"><h2>THE DETAILS.</h2><div class="summary-row"><span>Subtotal</span><span>${money(subtotal(bag, products))}</span></div><div class="summary-row"><span>Sample shipping</span><span>RM 0.00</span></div><div class="summary-row summary-total"><strong>Total</strong><strong>${money(subtotal(bag, products))}</strong></div>${errors.length ? `<p class="error">${errors.map(e).join("<br>")}</p>` : ""}${checkout ? `<button class="button" data-checkout ${errors.length ? "disabled" : ""}>SAMPLE CHECKOUT ${arrow}</button>` : ""}<p>Demo only. No payment will be collected. Shipping is illustrative; no items will be dispatched.</p></aside>`;
}
function checkoutPage() {
  if (!bag.length) return bagPage();
  return `<section class="page"><span class="small-label">THE FINAL STEP / SIMULATED CHECKOUT</span><h1 class="page-heading">MAKE IT YOURS.</h1><div class="notice">This is a sample checkout. Use fictional details. No card information, real payment, or delivery is involved.</div><div class="bag-layout"><form id="checkout-form"><div class="form-grid"><div class="field"><label for="first">First name</label><input id="first" required value="Sample" autocomplete="off"></div><div class="field"><label for="last">Last name</label><input id="last" required value="Customer" autocomplete="off"></div><div class="field full"><label for="email">Example email</label><input id="email" type="email" value="sample@example.com" required autocomplete="off"></div><div class="field full"><label for="address">Example delivery address</label><input id="address" value="123 Sample Street, Kuala Lumpur" required autocomplete="off"></div><div class="field"><label for="postcode">Example postcode</label><input id="postcode" value="50000" pattern="[0-9]{5}" required></div><div class="field"><label for="country">Country</label><input id="country" value="Malaysia" readonly></div></div><p id="checkout-error" role="alert" class="error"></p><button class="button" type="submit">COMPLETE SAMPLE ORDER ${arrow}</button><p class="small-label" style="margin-top:20px">SIMULATION ONLY — NOT A REAL PURCHASE</p></form>${summary()}</div></section>`;
}
function about() {
  return `<section class="page"><div class="about"><span class="small-label">INDEPENDENT BY NATURE / KUALA LUMPUR</span><h1 class="page-heading">SAME CITY.<br>DIFFERENT PERSPECTIVE.</h1><img src="/assets/campaign.png" alt="CROWNETIC campaign in concrete architecture"><p>Some follow the current. Others find their own way.</p><p>CROWNETIC is a streetwear brand from Kuala Lumpur, made for a generation that doesn't need permission to stand apart.</p><p>Considered silhouettes. A quieter palette. Everyday pieces with a presence of their own. This is the first chapter.</p>${link("/shop", "DISCOVER COLLECTION 001 " + arrow, "button")}</div></section>`;
}
function loginPage() {
  return `<section class="page login"><span class="small-label">CROWNETIC STUDIO / SAMPLE</span><h1 class="page-heading">ADMIN SIGN IN.</h1><p class="description">Your collection. Your creative control.</p><form id="login-form"><div class="field"><label for="login-email">${connected ? "Email" : "Username"}</label><input id="login-email" type="${connected ? "email" : "text"}" name="email" required autocomplete="username"></div><div class="field"><label for="password">Password</label><input id="password" type="password" name="password" required autocomplete="current-password"></div><p id="login-error" class="error" role="alert"></p><button class="button" type="submit">SIGN IN ${arrow}</button></form>${connected ? "" : '<p class="notice" style="margin-top:25px">Sample login: admin@123 / admin@123. This local demo login is for trying the sample, not production security.</p>'}</section>`;
}
async function adminPage() {
  if (!connected && !demoAdmin) return loginPage();
  if (connected) {
    const db = await supabase();
    const {
      data: { session },
    } = await db.auth.getSession();
    if (!session) return loginPage();
    const { data, error } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return `<section class="page empty"><h1 class="page-heading">ADMIN ACCESS REQUIRED.</h1><p>This account does not have catalogue management permission.</p><button class="button" data-signout>Sign out</button></section>`;
  }
  allProducts = await catalog.list(true);
  return `<section class="page"><div class="section-top"><div><span class="small-label">CROWNETIC STUDIO</span><h1 class="page-heading" style="margin-bottom:0">THE PRODUCT ROOM.</h1></div>${connected ? '<button class="small-button" data-signout>SIGN OUT</button>' : '<div><button class="small-button" data-reset>RESET DEMO</button> <button class="small-button" data-signout>SIGN OUT</button></div>'}</div><div class="notice">${connected ? "Supabase catalogue. Only authorized administrators can publish products." : "SAMPLE ADMIN — Signed in as admin@123. Changes are saved in this browser only. Publish a product here to see it in the shop."}</div><div class="admin-layout"><div><div class="section-top"><span class="small-label">${allProducts.length} PRODUCTS</span><button class="small-button" data-new>+ NEW PRODUCT</button></div><div class="admin-list">${allProducts.map((p) => `<article class="admin-item"><img src="${e(p.image_url)}" alt="${e(p.name)}"><div><h3>${e(p.name)}</h3><p>${money(p.price_sen)} &nbsp; / &nbsp; ${p.published ? "PUBLISHED" : "DRAFT"}</p></div><button class="small-button" data-edit="${e(p.id)}" aria-label="Edit ${e(p.name)}">EDIT ↗</button></article>`).join("")}</div></div><div id="editor">${editor()}</div></div></section>`;
}
function editor(p) {
  return `<form id="product-form" class="admin-form" data-id="${e(p?.id || "")}"><h2>${p ? "EDIT THE PIECE." : "ADD A NEW PIECE."}</h2><div class="field"><label for="p-name">Product name</label><input name="name" id="p-name" required maxlength="120" value="${e(p?.name || "")}"></div><div class="form-grid"><div class="field"><label for="p-category">Category</label><select id="p-category" name="category">${["Tees", "Bottoms", "Accessories"].map((c) => `<option ${p?.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div><div class="field"><label for="p-price">Price (MYR)</label><input id="p-price" name="price" type="number" min="0" max="999999" step="0.01" required value="${p ? (p.price_sen / 100).toFixed(2) : ""}"></div></div><div class="field"><label for="p-description">Description</label><textarea name="description" id="p-description" required maxlength="2500">${e(p?.description || "")}</textarea></div><div class="field"><label for="p-image">Image URL (HTTPS) or upload below</label><input id="p-image" name="image" value="${e(p?.image_url || (connected ? "" : "/assets/tee.png"))}"></div><div class="field"><label for="p-file">Upload JPEG, PNG or WebP (max 2 MB)</label><input type="file" id="p-file" accept="image/jpeg,image/png,image/webp"><p class="small-label">IMAGE IS UPLOADED WHEN YOU SAVE</p></div><div class="form-grid">${["left", "right"].map((side) => `<div class="field"><label for="view-${side}">${side} angle image URL (optional)</label><input id="view-${side}" name="view-${side}" value="${e(p?.[`view_${side}`] || "")}"><label for="file-${side}" style="margin-top:10px">Upload ${side} angle</label><input id="file-${side}" type="file" accept="image/jpeg,image/png,image/webp"></div>`).join("")}</div><label>STOCK BY SIZE (0 = SOLD OUT)</label><div class="stock-grid">${["S", "M", "L", "XL", "ONE SIZE"].map((s) => `<div><label for="stock-${s}">${s}</label><input type="number" id="stock-${s}" name="stock-${s}" min="0" step="1" required value="${p?.variants.find((v) => v.size === s)?.stock || 0}"></div>`).join("")}</div><label style="margin:25px 0 15px"><input type="checkbox" name="published" ${p?.published ? "checked" : ""}>PUBLISHED — VISIBLE IN SHOP</label><p id="save-error" class="error" role="alert"></p><button class="button" type="submit">${p ? "SAVE CHANGES" : "CREATE PRODUCT"} ${arrow}</button></form>`;
}
function notFound() {
  return `<section class="page empty"><h1 class="page-heading">THIS WAY BACK.</h1><p>We couldn't find that page or product.</p>${link("/shop", "SHOP THE COLLECTION " + arrow, "button")}</section>`;
}
async function render({ scroll = true } = {}) {
  clearProductEffects();
  clearScrollEffect();
  app.innerHTML = shell('<div class="loading">Opening the archive…</div>');
  try {
    products = await catalog.list();
    const path = decodeURIComponent(
      location.hash.startsWith("#/")
        ? location.hash.slice(1).split("?")[0]
        : location.protocol === "file:" ||
            location.pathname.endsWith(".html") ||
            location.pathname.endsWith("/")
          ? "/"
          : location.pathname,
    );
    document.body.classList.toggle("storefront-page", path !== "/admin");
    let content;
    if (path === "/") content = home();
    else if (path === "/shop") content = shop();
    else if (path.startsWith("/product/")) content = productPage(path.slice(9));
    else if (path === "/bag") content = bagPage();
    else if (path === "/checkout") content = checkoutPage();
    else if (path === "/about") content = about();
    else if (path === "/admin") content = await adminPage();
    else content = notFound();
    app.innerHTML = shell(content);
    if (path === "/") {
      mountScrollEffect();
      mountProductEffects();
    }
    if (path.startsWith("/product/")) mountProductViewer();
    document.title = `${path === "/admin" ? "Studio" : path === "/shop" ? "Collection 001" : "Built to stand apart."} — CROWNETIC`;
    if (scroll) window.scrollTo(0, 0);
  } catch (error) {
    app.innerHTML = shell(
      `<section class="page empty"><h1 class="page-heading">A MOMENT, PLEASE.</h1><p>We couldn't load the catalogue.</p><p class="error">${e(error.message)}</p><button class="button" data-retry>TRY AGAIN ${arrow}</button></section>`,
    );
  }
}
function navigate(path) {
  history.pushState({}, "", path.startsWith("#/") ? path : `#${path}`);
  render();
}
window.addEventListener("popstate", () => render());
window.addEventListener("hashchange", () => render());
document.addEventListener("click", async (event) => {
  const anchor = event.target.closest("a[data-link]");
  if (
    anchor &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.button === 0
  ) {
    event.preventDefault();
    navigate(anchor.getAttribute("href"));
    return;
  }
  const target = event.target.closest("button");
  if (!target) return;
  try {
    if (target.dataset.filter) {
      filter = target.dataset.filter;
      await render({ scroll: false });
    }
    if (target.dataset.size) {
      const form = target.closest("form");
      form.elements.size.value = target.dataset.size;
      form.querySelectorAll("[data-size]").forEach((b) => {
        b.classList.toggle("active", b === target);
        b.setAttribute("aria-pressed", b === target ? "true" : "false");
      });
    }
    if (target.hasAttribute("data-remove")) {
      bag.splice(Number(target.dataset.remove), 1);
      persistBag();
      render({ scroll: false });
    }
    if (target.hasAttribute("data-quantity")) {
      const i = Number(target.dataset.quantity),
        line = bag[i],
        delta = Number(target.dataset.delta);
      if (delta > 0) {
        const p = products.find((p) => p.id === line.productId);
        if (!p) throw Error("This item is unavailable.");
        bag = addToBag(bag, p, line.size, 1);
      } else if (line.quantity > 1) line.quantity--;
      else bag.splice(i, 1);
      persistBag();
      render({ scroll: false });
    }
    if (target.hasAttribute("data-checkout")) navigate("/checkout");
    if (target.hasAttribute("data-edit")) {
      document.querySelector("#editor").innerHTML = editor(
        allProducts.find((p) => p.id === target.dataset.edit),
      );
      document
        .querySelector("#editor")
        .scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (target.hasAttribute("data-new"))
      document.querySelector("#editor").innerHTML = editor();
    if (
      target.hasAttribute("data-reset") &&
      confirm("Reset demo catalogue to the original sample products?")
    ) {
      await catalog.reset();
      render({ scroll: false });
      toast("Demo catalogue reset.");
    }
    if (target.hasAttribute("data-signout")) {
      if (connected) {
        const db = await supabase();
        await db.auth.signOut();
      } else {
        demoAdmin = false;
        sessionStorage.removeItem("crownetic.demo.admin");
      }
      render();
    }
    if (target.hasAttribute("data-retry")) render();
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "add-form") {
    try {
      const p = products.find((p) => p.id === form.dataset.product);
      bag = addToBag(
        bag,
        p,
        form.elements.size.value,
        Number(form.elements.quantity.value),
      );
      persistBag();
      await render({ scroll: false });
      toast("Added to your bag. Make it your own.");
    } catch (error) {
      document.querySelector("#product-error").textContent = error.message;
    }
  }
  if (form.id === "product-form") {
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    document.querySelector("#save-error").textContent = "";
    try {
      const data = new FormData(form);
      let image_url = data.get("image");
      const file = form.querySelector("[type=file]").files[0];
      if (file) image_url = await catalog.upload(file);
      const angleViews = {};
      for (const side of ["left", "right"]) {
        const sideFile = form.querySelector(`#file-${side}`).files[0];
        angleViews[`view_${side}`] = sideFile
          ? await catalog.upload(sideFile)
          : String(data.get(`view-${side}`) || "").trim();
      }
      const existing = allProducts.find((p) => p.id === form.dataset.id);
      const view_sprite =
        existing &&
        existing.image_url === image_url &&
        !angleViews.view_left &&
        !angleViews.view_right
          ? existing.view_sprite || ""
          : "";
      await catalog.save(
        {
          name: data.get("name").trim(),
          category: data.get("category"),
          price_sen: priceSen(data.get("price")),
          description: data.get("description").trim(),
          image_url,
          ...angleViews,
          view_sprite,
          published: data.has("published"),
          variants: ["S", "M", "L", "XL", "ONE SIZE"].map((size) => ({
            size,
            stock: Number(data.get(`stock-${size}`)),
          })),
        },
        form.dataset.id || undefined,
      );
      await render({ scroll: false });
      toast(
        data.has("published")
          ? "Product published. It is now in the shop."
          : "Draft saved.",
      );
    } catch (error) {
      document.querySelector("#save-error").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }
  if (form.id === "checkout-form") {
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const fresh = await catalog.list();
      const errors = bagErrors(bag, fresh);
      if (errors.length) throw Error(errors.join(" "));
      if (subtotal(bag, fresh) !== subtotal(bag, products)) {
        products = fresh;
        await render({ scroll: false });
        throw Error(
          "Prices changed. Review your updated total before trying again.",
        );
      }
      bag = [];
      persistBag();
      app.innerHTML = shell(
        `<section class="page success"><div class="success-symbol">✓</div><span class="small-label">SIMULATION COMPLETE</span><h1>GOOD TASTE.<br>GREAT CHOICE.</h1><p>Your sample checkout is complete.<br>No payment was taken and no real order was placed.</p>${link("/shop", "BACK TO THE COLLECTION " + arrow, "button")}</section>`,
      );
      window.scrollTo(0, 0);
    } catch (error) {
      const el = document.querySelector("#checkout-error");
      if (el) el.textContent = error.message;
      else toast(error.message);
    } finally {
      button.disabled = false;
    }
  }
  if (form.id === "login-form") {
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      if (!connected) {
        if (
          form.elements.email.value !== "admin@123" ||
          form.elements.password.value !== "admin@123"
        )
          throw Error("Incorrect username or password.");
        demoAdmin = true;
        sessionStorage.setItem("crownetic.demo.admin", "yes");
        await render();
        return;
      }
      const db = await supabase();
      const { error } = await db.auth.signInWithPassword({
        email: form.elements.email.value,
        password: form.elements.password.value,
      });
      if (error) throw error;
      render();
    } catch (error) {
      document.querySelector("#login-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
});
render();

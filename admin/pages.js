import { escapeHTML as e, money } from "../model.js";
import { loyaltyTier } from "../customer/model.js";
import { connected } from "../catalog.js";
import "./styles.css";

const views = {
  products: ["Product Room", "THE PRODUCT ROOM."],
  overview: ["Overview", "YOUR BUSINESS. IN VIEW."],
  customers: ["Customers", "THE INNER CIRCLE."],
  orders: ["Orders", "EVERY ORDER. IN ORDER."],
  points: ["Points", "REWARDS WITH PURPOSE."],
  activity: ["Activity", "THE STUDIO LOG."],
};
const number = (value) => Number(value || 0).toLocaleString("en-MY");
const date = (value, includeTime = false) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric", month: "short", year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
};
const path = (view, key, id) => `/admin?view=${view}${key && id ? `&${key}=${encodeURIComponent(id)}` : ""}`;
const link = (href, label, cls = "text-link") => `<a href="#${e(href)}" data-link class="${cls}">${label}</a>`;
const empty = (title, text, extra = "") => `<div class="admin-empty"><span class="admin-empty-mark" aria-hidden="true">↗</span><h3>${e(title)}</h3><p>${e(text)}</p>${extra}</div>`;
const card = (label, value, caption = "") => `<article class="admin-stat"><span class="small-label">${e(label)}</span><strong>${value}</strong>${caption ? `<p>${e(caption)}</p>` : ""}</article>`;
const tier = (points) => `<span class="admin-tier admin-tier-${loyaltyTier(Number(points || 0)).name.toLowerCase()}">${loyaltyTier(Number(points || 0)).name}</span>`;
const status = (value) => `<span class="admin-status admin-status-${e(value)}">${e(value || "unfulfilled")}</span>`;
const table = (label, heads, rows) => `<div class="admin-table-scroll" role="region" aria-label="${e(label)}" tabindex="0"><table class="admin-table"><thead><tr>${heads.map((heading) => `<th scope="col">${heading}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
const panelHead = (title, detail = "", action = "") => `<div class="admin-panel-head"><div><h2>${e(title)}</h2>${detail ? `<p>${e(detail)}</p>` : ""}</div>${action}</div>`;
const feedback = () => '<p class="error admin-form-error" role="alert"></p>';
const signedPoints = (points) => `<span class="${Number(points) < 0 ? "admin-negative" : "admin-positive"}">${Number(points) > 0 ? "+" : ""}${number(points)}</span>`;

export function adminShell(content, view = "products") {
  const selected = Object.hasOwn(views, view) ? view : "overview";
  return `<section class="page admin-portal" data-admin-portal data-view="${selected}">
    <div class="admin-heading"><div><span class="small-label">CROWNETIC / STUDIO</span><h1 class="page-heading">${views[selected][1]}</h1></div><div class="admin-heading-actions">${!connected && selected === "products" ? '<button class="small-button" data-reset>RESET DEMO</button>' : ""}<button class="small-button" data-signout>SIGN OUT</button></div></div>
    <nav class="admin-tabs" aria-label="Admin navigation">${Object.entries(views).map(([key, [label]]) => `<a href="#/admin?view=${key}" data-link ${key === selected ? 'class="active" aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    <div class="admin-mode ${connected ? "admin-mode-connected" : ""}"><span class="admin-mode-dot" aria-hidden="true"></span><span>${connected ? "SUPABASE STUDIO — Connected customer records, recorded sales and rewards." : "DEMO STUDIO — Changes stay in this browser. Use sample customer details; no money is moved."}</span></div>
    <p class="admin-refresh-message" role="status" data-admin-message></p>
    ${content}
  </section>`;
}

function orderRows(orders, showCustomer = true, filterable = false) {
  return orders.map((order) => `<tr ${filterable ? `data-admin-row="orders" data-status="${e(order.status)}" data-search="${e([order.reference, order.customer_name, order.customer_email].join(" ").toLowerCase())}"` : ""}>
    <td>${link(path("orders", "order", order.id), e(order.reference), "admin-row-link")}<small>${date(order.created_at)}</small></td>
    ${showCustomer ? `<td>${e(order.customer_name || "Customer")}<small>${e(order.customer_email || "")}</small></td>` : ""}
    <td>${money(Number(order.total_sen || 0))}<small>${number(order.item_count)} ${Number(order.item_count) === 1 ? "item" : "items"}</small></td><td>${status(order.status)}</td><td>${status(order.fulfillment_status || "unfulfilled")}</td><td>${link(path("orders", "order", order.id), '<span aria-hidden="true">↗</span><span class="sr-only">View order ' + e(order.reference) + "</span>", "admin-arrow-link")}</td>
  </tr>`).join("");
}

function orderTable(orders, showCustomer = true, filterable = false) {
  return table("Orders", ["Order", ...(showCustomer ? ["Customer"] : []), "Total", "Payment", "Fulfillment", '<span class="sr-only">Details</span>'], orderRows(orders, showCustomer, filterable));
}

function pointsTable(events, showCustomer = true) {
  return table("Points history", ["Event", ...(showCustomer ? ["Customer"] : []), "Points", "Date"], events.map((event) => `<tr><td><strong>${e(event.event_type === "adjustment" ? "Manual adjustment" : event.event_type === "refund" ? "Refund reversal" : "Purchase points")}</strong><small>${e(event.reason || event.event_ref || "")}</small>${event.order_id ? link(path("orders", "order", event.order_id), "View order", "admin-inline-link") : ""}</td>${showCustomer ? `<td>${link(path("customers", "customer", event.user_id), e(event.customer_name || event.customer_email || "Customer"), "admin-row-link")}<small>${e(event.customer_email || "")}</small></td>` : ""}<td class="admin-point-value">${signedPoints(event.points)}</td><td>${date(event.created_at, true)}</td></tr>`).join(""));
}

function activityList(activity) {
  return `<div class="admin-activity-list">${activity.map((event) => `<article class="admin-activity-item"><span class="admin-activity-dot" aria-hidden="true"></span><div><strong>${e(event.summary || String(event.action || "Studio update").replaceAll("_", " "))}</strong><p>${e([event.actor_email, event.customer_email, event.reference].filter(Boolean).join(" · "))}</p></div><time datetime="${e(event.created_at || "")}">${date(event.created_at, true)}</time></article>`).join("")}</div>`;
}

function overviewPage(snapshot, products) {
  const { customers, orders, activity } = snapshot;
  const paid = orders.filter((order) => order.status === "paid");
  const low = products.flatMap((product) => (product.variants || []).filter((variant) => Number(variant.stock) <= 3).map((variant) => ({ name: product.name, ...variant })));
  return `<p class="admin-intro">A clear view of your customers, recorded sales and rewards.</p><div class="admin-stats">
    ${card("PAID SALES", money(paid.reduce((sum, order) => sum + Number(order.total_sen || 0), 0)), "Excludes refunded sales")}
    ${card("CUSTOMERS", number(customers.length), "Registered customer accounts")}
    ${card("PAID ORDERS", number(paid.length), `${orders.length} orders recorded in total`)}
    ${card("POINTS BALANCE", number(customers.reduce((sum, customer) => sum + Number(customer.points || 0), 0)), "Combined current customer balances")}
    </div><div class="admin-quick-actions">${link(path("orders"), "RECORD A PAID SALE ↗", "button")}${link(path("customers"), "EXPLORE CUSTOMERS", "small-button")}${link(path("points"), "MANAGE POINTS", "small-button")}</div>
    <section class="admin-panel">${panelHead("RECENT ORDERS.", "Your latest recorded sales.", link(path("orders"), "View all orders ↗"))}${orders.length ? orderTable(orders.slice(0, 5)) : empty("Your first sale starts here.", "Record an already paid Instagram or offline sale to connect it to a customer and award points.")}</section>
    <div class="admin-two-columns"><section class="admin-panel">${panelHead("RECENT ACTIVITY.")}${activity.length ? activityList(activity.slice(0, 5)) : empty("A fresh studio.", "Sales, refunds and point changes will appear here.")}</section>
    <section class="admin-panel">${panelHead("STOCK TO WATCH.", "Sizes with 3 or fewer units.", link(path("products"), "Manage stock ↗"))}${low.length ? `<div class="admin-stock-list">${low.slice(0, 8).map((item) => `<div><span>${e(item.name)}<small>${e(item.size)}</small></span><strong class="${Number(item.stock) === 0 ? "admin-negative" : ""}">${number(item.stock)} left</strong></div>`).join("")}</div>` : empty("Stock looks comfortable.", "No low-stock sizes in the current catalogue.")}</section></div>`;
}

function customerRows(customers) {
  return customers.map((customer) => `<tr data-admin-row="customers" data-search="${e([customer.name, customer.email, customer.phone].join(" ").toLowerCase())}"><td>${link(path("customers", "customer", customer.id), e(customer.name || "Customer"), "admin-row-link")}<small>${e(customer.email || "")}</small></td><td>${tier(customer.points)}</td><td class="admin-point-value ${Number(customer.points) < 0 ? "admin-negative" : ""}">${number(customer.points)}</td><td>${money(Number(customer.total_spent_sen || 0))}</td><td>${number(customer.order_count)}</td><td>${link(path("customers", "customer", customer.id), "View profile ↗", "admin-inline-link")}</td></tr>`).join("");
}

function customersPage(snapshot, customerId) {
  const customer = customerId && snapshot.customers.find((item) => item.id === customerId);
  if (customerId && !customer) return empty("Customer unavailable.", "This customer is no longer in your customer list.", link(path("customers"), "Back to customers", "button"));
  if (customer) return customerDetail(customer, snapshot);
  return `<p class="admin-intro">Know who is behind every purchase.</p><section class="admin-panel">${panelHead("YOUR CUSTOMERS.", `${snapshot.customers.length} registered customers`)}<div class="admin-toolbar"><div class="field"><label for="admin-customer-search">Search customers</label><input type="search" id="admin-customer-search" data-admin-search="customers" placeholder="Name, email or phone" autocomplete="off"></div></div>${snapshot.customers.length ? table("Customers", ["Customer", "Membership", "Points", "Paid spend", "Orders", '<span class="sr-only">Details</span>'], customerRows(snapshot.customers)) : empty("Build your inner circle.", "Customers appear here after creating an account.", link("/signup", "OPEN CUSTOMER SIGNUP ↗", "small-button"))}<p class="admin-filter-empty" data-admin-empty="customers" hidden>No customers match your search.</p></section>`;
}

function customerDetail(customer, snapshot) {
  const orders = snapshot.orders.filter((order) => order.user_id === customer.id);
  const events = snapshot.events.filter((event) => event.user_id === customer.id);
  const membership = loyaltyTier(Number(customer.points || 0));
  return `${link(path("customers"), "← All customers", "admin-back")}<div class="admin-detail-heading"><div><span class="small-label">CUSTOMER PROFILE</span><h2>${e(customer.name || "Customer")}</h2><p>${e(customer.email || "")}</p></div>${tier(customer.points)}</div>
    <div class="admin-stats admin-stats-three">${card("CURRENT POINTS", number(customer.points), membership.next ? `${number(membership.next.threshold - Number(customer.points || 0))} points to ${membership.next.name}` : "Platinum membership")}${card("PAID SPEND", money(Number(customer.total_spent_sen || 0)), "Excludes refunded sales")}${card("RECORDED ORDERS", number(customer.order_count), `Last paid purchase: ${date(customer.last_purchase_at)}`)}</div>
    <div class="admin-two-columns"><section class="admin-panel admin-contact">${panelHead("CONTACT DETAILS.")}<dl><div><dt>Email address</dt><dd>${e(customer.email || "Not provided")}</dd></div><div><dt>Phone number</dt><dd>${e(customer.phone || "Not provided")}</dd></div><div><dt>Delivery address</dt><dd class="admin-address">${e(customer.address || "Not provided")}</dd></div><div><dt>Member since</dt><dd>${date(customer.created_at)}</dd></div></dl></section>
    <section class="admin-panel admin-customer-actions">${panelHead("KEEP THE CIRCLE MOVING.")}<p>Connect a paid sale to this customer or make a reasoned points correction.</p>${link(path("orders", "customer", customer.id), "RECORD PAID SALE ↗", "button")}${link(path("points", "customer", customer.id), "ADJUST POINTS", "small-button")}<p class="admin-subtle">Refund reversals can leave a negative balance. New purchase points count toward that balance.</p></section></div>
    <section class="admin-panel">${panelHead("ORDER HISTORY.")}${orders.length ? orderTable(orders, false) : empty("No orders recorded.", "Recorded sales for this customer will appear here.")}</section>
    <section class="admin-panel">${panelHead("POINTS HISTORY.")}${events.length ? pointsTable(events, false) : empty("No points activity yet.", "Purchase points, adjustments and refund reversals will appear here.")}</section>`;
}

export function saleItemRow(index, products) {
  return `<div class="admin-sale-line" data-sale-line><div class="field admin-sale-product"><label for="sale-product-${index}">Product</label><select id="sale-product-${index}" data-sale-product required><option value="">Choose a product</option>${products.map((product) => `<option value="${e(product.id)}">${e(product.name)} — ${money(Number(product.price_sen || 0))}</option>`).join("")}</select></div><div class="field"><label for="sale-size-${index}">Size</label><select id="sale-size-${index}" data-sale-size required><option value="">Choose size</option></select></div><div class="field"><label for="sale-quantity-${index}">Quantity</label><input type="number" id="sale-quantity-${index}" data-sale-quantity value="1" min="1" max="9999" step="1" required></div><button class="admin-remove-line" type="button" data-remove-sale-line aria-label="Remove item ${index + 1}">×</button><p class="admin-line-summary" data-sale-line-summary>Select a product to preview its price and points.</p></div>`;
}

function saleForm(customers, products, customerId) {
  if (!customers.length) return `<section class="admin-panel">${panelHead("RECORD A PAID SALE.")}${empty("A customer account comes first.", "Ask the customer to sign up before recording a sale and awarding their points.", link("/signup", "OPEN CUSTOMER SIGNUP ↗", "small-button"))}</section>`;
  if (!products.length) return `<section class="admin-panel">${panelHead("RECORD A PAID SALE.")}${empty("Add your first piece.", "A product with a price, size and reward points is needed to record a sale.", link(path("products"), "OPEN PRODUCT ROOM ↗", "small-button"))}</section>`;
  return `<section class="admin-panel admin-record-panel">${panelHead("RECORD A PAID SALE.", "For payments you have already received through Instagram, in person or another channel.")}<p class="admin-form-notice">This records a sale and awards points. It does not charge a customer. Manage stock separately in Product Room.</p><form id="admin-record-sale" data-admin-form="sale"><div class="form-grid"><div class="field full"><label for="sale-customer">Customer</label><select name="user_id" id="sale-customer" required><option value="">Choose a customer</option>${customers.map((customer) => `<option value="${e(customer.id)}" ${customer.id === customerId ? "selected" : ""}>${e(customer.name || "Customer")} · ${e(customer.email || "")}</option>`).join("")}</select></div><div class="field"><label for="sale-reference">Receipt / payment reference</label><input id="sale-reference" name="reference" required minlength="1" maxlength="120" placeholder="e.g. IG-2026-001" autocomplete="off"></div><div class="field"><label for="sale-channel">Sales channel</label><select id="sale-channel" name="channel"><option value="instagram">Instagram</option><option value="offline">Offline / in person</option><option value="website">Website (record only)</option></select></div></div>
    <fieldset class="admin-sale-items"><legend>SALE ITEMS</legend><div data-sale-lines>${saleItemRow(0, products)}</div><button class="small-button" data-add-sale-line type="button">+ ADD ANOTHER ITEM</button></fieldset><div class="admin-sale-preview" aria-live="polite"><span>Sale total <strong data-sale-total>${money(0)}</strong></span><span>Points awarded <strong data-sale-points>0</strong></span><span>Items <strong data-sale-items>0</strong></span></div><label class="admin-check" for="sale-paid-confirm"><input type="checkbox" id="sale-paid-confirm" name="payment_confirmed" required><span>I verified that payment was received.</span></label>${feedback()}<button class="button" type="submit">RECORD PAID SALE <span aria-hidden="true">↗</span></button></form></section>`;
}

function ordersPage(snapshot, products, orderId, customerId) {
  const order = orderId && snapshot.orders.find((item) => item.id === orderId);
  if (orderId && !order) return empty("Order unavailable.", "This order could not be found.", link(path("orders"), "Back to orders", "button"));
  if (order) return orderDetail(order);
  return `<p class="admin-intro">Keep paid sales, customer rewards and delivery progress together.</p><section class="admin-panel">${panelHead("YOUR ORDERS.", "Every sale recorded in the studio.")}<div class="admin-toolbar"><div class="field"><label for="admin-order-search">Search orders</label><input type="search" id="admin-order-search" data-admin-search="orders" placeholder="Reference, customer or email" autocomplete="off"></div><div class="field"><label for="admin-order-filter">Payment status</label><select id="admin-order-filter" data-order-filter><option value="all">All orders</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select></div></div>${snapshot.orders.length ? orderTable(snapshot.orders, true, true) : empty("Your order book is ready.", "Use the form below to record a sale after receiving payment.")}<p class="admin-filter-empty" data-admin-empty="orders" hidden>No orders match your filters.</p></section>${saleForm(snapshot.customers, products, customerId)}`;
}

function orderDetail(order) {
  return `${link(path("orders"), "← All orders", "admin-back")}<div class="admin-detail-heading"><div><span class="small-label">${e(String(order.channel || "offline").toUpperCase())} / ${date(order.created_at, true)}</span><h2>${e(order.reference)}</h2><p>${link(path("customers", "customer", order.user_id), e(order.customer_name || "Customer"), "admin-row-link")} · ${e(order.customer_email || "")}</p></div>${status(order.status)}</div>
    <div class="admin-stats admin-stats-three">${card("ORDER TOTAL", money(Number(order.total_sen || 0)))}${card("ORIGINAL POINTS", number(order.points), order.status === "refunded" ? "Reversed when this sale was refunded" : "Awarded for this recorded sale")}${card("ITEMS", number(order.item_count), `${date(order.created_at)}`)}</div>
    <section class="admin-panel">${panelHead("THE PIECES.")}${table("Order items", ["Product", "Size", "Quantity", "Unit price", "Line total", "Points"], (order.items || []).map((item) => `<tr><td><strong>${e(item.name || "Product")}</strong></td><td>${e(item.size)}</td><td>${number(item.quantity)}</td><td>${money(Number(item.unit_price_sen || 0))}</td><td>${money(Number(item.unit_price_sen || 0) * Number(item.quantity || 0))}</td><td>${number(Number(item.reward_points || 0) * Number(item.quantity || 0))}</td></tr>`).join(""))}</section>
    <div class="admin-two-columns"><section class="admin-panel">${panelHead("DELIVERY PROGRESS.", "Update your internal record. Customer notifications are not sent automatically.")}<form id="admin-fulfillment" data-admin-form="fulfillment"><input type="hidden" name="order_id" value="${e(order.id)}"><div class="field"><label for="fulfillment-status">Fulfillment status</label><select id="fulfillment-status" name="status" ${order.status === "refunded" ? "disabled" : ""}>${["unfulfilled", "processing", "shipped", "delivered"].map((value) => `<option value="${value}" ${(order.fulfillment_status || "unfulfilled") === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></div><div class="field"><label for="fulfillment-tracking">Tracking number (optional)</label><input id="fulfillment-tracking" name="tracking_number" value="${e(order.tracking_number || "")}" maxlength="200" ${order.status === "refunded" ? "readonly" : ""}></div>${feedback()}<button type="submit" class="small-button" ${order.status === "refunded" ? "disabled" : ""}>SAVE DELIVERY UPDATE</button></form></section>
    <section class="admin-panel admin-refund-panel">${panelHead(order.status === "refunded" ? "REFUND RECORDED." : "RECORD A REFUND.")}${order.status === "refunded" ? `<p>${e(order.refund_reason || "Refund recorded")}</p><p class="admin-subtle">${date(order.refunded_at, true)} · Original points reversed. This order cannot be refunded again.</p>` : `<p class="admin-form-notice">Records an external refund and reverses the original points once. It does not send money or restock items.</p><form id="admin-refund-order" data-admin-form="refund"><input type="hidden" name="order_id" value="${e(order.id)}"><div class="field"><label for="refund-reason">Reason for refund</label><textarea id="refund-reason" name="reason" minlength="3" maxlength="500" required placeholder="Explain why the sale was refunded"></textarea></div><label class="admin-check" for="refund-confirm"><input type="checkbox" id="refund-confirm" name="refund_confirmed" required><span>I have completed the refund outside this website.</span></label>${feedback()}<button type="submit" class="small-button admin-danger-button">RECORD REFUND & REVERSE POINTS</button></form>`}</section></div>`;
}

function pointsPage(snapshot, customerId) {
  const selected = snapshot.customers.find((customer) => customer.id === customerId);
  const events = selected ? snapshot.events.filter((event) => event.user_id === selected.id) : snapshot.events;
  return `<p class="admin-intro">A clear record of every purchase award, correction and refund reversal.</p><div class="admin-reward-thresholds"><span>Member <strong>0+</strong></span><span>Bronze <strong>1,000</strong></span><span>Gold <strong>5,000</strong></span><span>Platinum <strong>10,000</strong></span></div>
    <section class="admin-panel admin-adjust-panel">${panelHead("ADJUST A CUSTOMER’S POINTS.", "For a correction or an agreed goodwill award. Every change needs a reason.")}${snapshot.customers.length ? `<form id="admin-adjust-points" data-admin-form="points"><div class="form-grid"><div class="field full"><label for="points-customer">Customer</label><select id="points-customer" name="user_id" required><option value="">Choose a customer</option>${snapshot.customers.map((customer) => `<option value="${e(customer.id)}" ${customer.id === customerId ? "selected" : ""}>${e(customer.name || "Customer")} · ${e(customer.email)} · ${number(customer.points)} points</option>`).join("")}</select><p class="admin-subtle" data-points-balance>${selected ? `Current balance: ${number(selected.points)} points` : "Select a customer to see their current balance."}</p></div><div class="field"><label for="points-direction">Adjustment</label><select id="points-direction" name="direction"><option value="add">Add points</option><option value="remove">Remove points</option></select></div><div class="field"><label for="points-amount">Number of points</label><input id="points-amount" name="points" type="number" min="1" max="100000" step="1" required></div><div class="field full"><label for="points-reason">Reason for adjustment</label><textarea id="points-reason" name="reason" minlength="3" maxlength="500" required placeholder="e.g. Correcting a missed purchase reward"></textarea></div></div><p class="admin-subtle">Points have no cash value. A manual deduction cannot take a balance below zero.</p>${feedback()}<button class="button" type="submit">SAVE POINTS ADJUSTMENT <span aria-hidden="true">↗</span></button></form>` : empty("No customers yet.", "Customers need an account before you can manage their points.", link("/signup", "OPEN CUSTOMER SIGNUP ↗", "small-button"))}</section>
    <section class="admin-panel">${panelHead(selected ? `${selected.name || "CUSTOMER"} / POINTS HISTORY.` : "ALL POINTS HISTORY.", selected ? selected.email : "Purchase awards, adjustments and reversals.", selected ? link(path("points"), "View all history ↗") : "")}${events.length ? pointsTable(events) : empty("No points activity yet.", "Rewards and adjustments will appear here as they are recorded.")}</section>`;
}

export function renderAdminPortal({ view = "overview", snapshot, products = [], customerId, orderId }) {
  const data = { customers: [], orders: [], events: [], activity: [], ...snapshot };
  let content;
  if (view === "customers") content = customersPage(data, customerId);
  else if (view === "orders") content = ordersPage(data, products, orderId, customerId);
  else if (view === "points") content = pointsPage(data, customerId);
  else if (view === "activity") content = `<p class="admin-intro">Follow the changes that keep your business moving.</p><section class="admin-panel">${panelHead("STUDIO ACTIVITY.", "A record of sales, refunds, fulfillment updates and points adjustments.")}${data.activity.length ? activityList(data.activity) : empty("Nothing recorded yet.", "Your team’s studio activity will appear here.")}</section>`;
  else content = overviewPage(data, products);
  return adminShell(content, view);
}

export function adminSetupPage(view, error) {
  const message = error?.message || String(error || "Customer and order tools could not be loaded.");
  const migrationMissing = message.includes("004_admin_portal.sql");
  return adminShell(`<section class="admin-panel admin-setup">${panelHead(migrationMissing ? "CONNECT YOUR STUDIO." : "A MOMENT, PLEASE.")}<p>${migrationMissing ? "The customer and order tools need the admin portal database migration before they can be used." : "We could not load the customer and order tools. Check the connection and try again."}</p><p class="error" role="alert">${e(message)}</p><p class="admin-subtle">${migrationMissing ? "Apply supabase/004_admin_portal.sql in your Supabase project, then try again. " : ""}Existing products remain available in Product Room.</p><button type="button" data-retry class="small-button">TRY AGAIN</button>${link(path("products"), "OPEN PRODUCT ROOM ↗", "button")}</section>`, view);
}

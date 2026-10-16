const maxInteger = 2147483647;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const channels = ["instagram", "offline", "website"];
const fulfillmentStatuses = ["unfulfilled", "processing", "shipped", "delivered"];

function text(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw Error(`Enter a valid ${label}.`);
  return value.trim();
}
function integer(value, label, min = 0, max = maxInteger) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`Enter a valid ${label}.`);
  return value;
}
function requestId(value) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw Error("A valid request ID is required. Try submitting the form again.");
  return value.toLowerCase();
}
function customer(state, id) {
  const user = state.users.find((row) => row.id === id);
  if (!user) throw Error("Choose a registered customer.");
  return user;
}
function context(options = {}) {
  return {
    now: options.now || (() => new Date().toISOString()),
    uuid: options.uuid || (() => crypto.randomUUID()),
    actor: options.actor || "admin@123",
  };
}
function balance(state, userId) {
  return state.events.filter((event) => event.user_id === userId).reduce((sum, event) => sum + event.points, 0);
}
function replay(state, request, type, payload) {
  const order = state.orders.find((row) => row.request_id === request);
  const event = state.events.find((row) => row.request_id === request);
  const existing = order || event;
  if (!existing) return null;
  const existingType = order ? "sale" : "adjustment";
  if (existingType !== type || existing.request_payload !== JSON.stringify(payload)) throw Error("This request ID was already used for different information. Start a new request.");
  return { data: structuredClone(state), id: existing.id };
}
function audit(data, ctx, action, user, reference, summary, at) {
  data.activity.push({ id: ctx.uuid(), action, actor_email: ctx.actor, customer_email: user.email || "", reference: reference || "", summary, created_at: at });
}
function sortedNewest(rows) {
  return rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export function adminSnapshot(state) {
  const users = new Map(state.users.map((user) => [user.id, user]));
  const orders = sortedNewest(state.orders.map((order) => ({
    id: order.id,
    reference: order.reference,
    user_id: order.user_id,
    customer_name: order.customer_name ?? users.get(order.user_id)?.name ?? "",
    customer_email: order.customer_email ?? users.get(order.user_id)?.email ?? "",
    channel: order.channel,
    status: order.status,
    total_sen: order.total_sen,
    points: order.points,
    item_count: order.item_count,
    created_at: order.created_at,
    created_by: order.created_by,
    fulfillment_status: order.fulfillment_status,
    tracking_number: order.tracking_number || "",
    refund_reason: order.refund_reason || "",
    refunded_at: order.refunded_at || null,
    items: order.items.map((item) => ({ id: item.id, order_id: order.id, product_id: item.product_id, name: item.name, size: item.size, quantity: item.quantity, unit_price_sen: item.unit_price_sen, reward_points: item.reward_points })),
  })));
  const customers = state.users.map((user) => {
    const ownOrders = orders.filter((order) => order.user_id === user.id);
    const paid = ownOrders.filter((order) => order.status === "paid");
    return {
      id: user.id, email: user.email || "", name: user.name || "", phone: user.phone || "", address: user.address || "", created_at: user.created_at || null,
      points: balance(state, user.id), total_spent_sen: paid.reduce((sum, order) => sum + order.total_sen, 0), order_count: ownOrders.length, last_purchase_at: paid[0]?.created_at || null,
    };
  });
  const events = sortedNewest(state.events.map((event) => ({
    id: event.id, event_ref: event.event_ref, user_id: event.user_id, points: event.points, item_count: event.item_count,
    created_at: event.created_at, event_type: event.event_type || "purchase", reason: event.reason || "Sample checkout", created_by: event.created_by || null,
    order_id: event.order_id || null, customer_name: users.get(event.user_id)?.name || "", customer_email: users.get(event.user_id)?.email || "",
  })));
  const activity = sortedNewest(state.activity.map((entry) => ({ id: entry.id, action: entry.action, actor_email: entry.actor_email, customer_email: entry.customer_email, reference: entry.reference, summary: entry.summary, created_at: entry.created_at })));
  return { customers, orders, events, activity };
}

export function applyRecordSale(state, input, products, options) {
  const ctx = context(options), request = requestId(input.request_id);
  const reference = text(input.reference, "purchase reference", 1, 120);
  const user = customer(state, input.user_id);
  if (!channels.includes(input.channel)) throw Error("Choose a valid sales channel.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw Error("Choose between 1 and 100 items.");
  const selections = input.items.map((line) => ({ product_id: text(line.product_id, "product", 1, 200), size: text(line.size, "size", 1, 20), quantity: integer(line.quantity, "quantity", 1, 9999) }));
  const payload = { user_id: user.id, reference: reference.toLowerCase(), channel: input.channel, items: selections };
  const repeated = replay(state, request, "sale", payload);
  if (repeated) return repeated;
  if (state.orders.some((order) => order.reference.toLowerCase() === reference.toLowerCase())) throw Error("This purchase reference already exists. Use the existing order instead.");
  if (new Set(selections.map((line) => JSON.stringify([line.product_id, line.size]))).size !== selections.length) throw Error("Combine duplicate product sizes into one item.");
  const items = selections.map((line) => {
    const product = products.find((row) => row.id === line.product_id);
    if (!product || !product.variants?.some((variant) => variant.size === line.size)) throw Error("Choose a valid product and size.");
    return { ...line, name: text(product.name, "product name", 1, 120), unit_price_sen: integer(product.price_sen, "product price"), reward_points: integer(product.reward_points ?? 100, "product points", 0, 100000) };
  });
  const total = integer(items.reduce((sum, item) => sum + item.unit_price_sen * item.quantity, 0), "sale total");
  const points = integer(items.reduce((sum, item) => sum + item.reward_points * item.quantity, 0), "sale points");
  const count = integer(items.reduce((sum, item) => sum + item.quantity, 0), "item count", 1);
  const data = structuredClone(state), id = ctx.uuid(), at = ctx.now();
  data.orders.push({ id, request_id: request, request_payload: JSON.stringify(payload), reference, user_id: user.id, customer_name: user.name || "", customer_email: user.email || "", channel: input.channel, status: "paid", total_sen: total, points, item_count: count, created_at: at, created_by: ctx.actor, fulfillment_status: "unfulfilled", tracking_number: "", refund_reason: "", refunded_at: null, items: items.map((item) => ({ ...item, id: ctx.uuid(), order_id: id })) });
  data.events.push({ id: ctx.uuid(), event_ref: `order-purchase:${id}`, user_id: user.id, points, item_count: count, created_at: at, event_type: "purchase", reason: `Recorded ${input.channel} purchase`, created_by: ctx.actor, order_id: id, demo: true });
  audit(data, ctx, "sale_recorded", user, reference, `Recorded ${count} item(s), ${total} sen, +${points} points.`, at);
  return { data, id };
}

export function applyAdjustPoints(state, input, options) {
  const ctx = context(options), request = requestId(input.request_id), user = customer(state, input.user_id);
  const points = integer(input.points, "point adjustment", -100000, 100000);
  if (!points) throw Error("The point adjustment must be greater or less than zero.");
  const reason = text(input.reason, "reason (3–500 characters)", 3, 500);
  const payload = { user_id: user.id, points, reason };
  const repeated = replay(state, request, "adjustment", payload);
  if (repeated) return repeated;
  if (points < 0 && balance(state, user.id) + points < 0) throw Error("This adjustment would make the customer's points balance negative.");
  const data = structuredClone(state), id = ctx.uuid(), at = ctx.now();
  data.events.push({ id, request_id: request, request_payload: JSON.stringify(payload), event_ref: `admin-adjustment:${request}`, user_id: user.id, points, item_count: 0, created_at: at, event_type: "adjustment", reason, created_by: ctx.actor, order_id: null, demo: true });
  audit(data, ctx, "points_adjusted", user, "", `${points > 0 ? "+" : ""}${points} points: ${reason}`, at);
  return { data, id };
}

export function applyRefundOrder(state, input, options) {
  const ctx = context(options), reason = text(input.reason, "reason (3–500 characters)", 3, 500);
  const existing = state.orders.find((order) => order.id === input.order_id);
  if (!existing) throw Error("Choose an existing order.");
  if (existing.status === "refunded") {
    if (existing.refund_reason !== reason) throw Error("This order was already refunded with a different reason.");
    return { data: structuredClone(state), id: existing.id };
  }
  if (existing.status !== "paid") throw Error("Only a paid order can be refunded.");
  const purchase = state.events.find((event) => event.order_id === existing.id && event.event_type === "purchase");
  if (!purchase) throw Error("Original purchase award is missing; review this order before refunding.");
  const user = customer(state, existing.user_id), data = structuredClone(state), at = ctx.now();
  Object.assign(data.orders.find((order) => order.id === existing.id), { status: "refunded", refund_reason: reason, refunded_at: at });
  data.events.push({ id: ctx.uuid(), event_ref: `order-refund:${existing.id}`, user_id: user.id, points: -purchase.points, item_count: purchase.item_count, created_at: at, event_type: "refund", reason, created_by: ctx.actor, order_id: existing.id, demo: true });
  audit(data, ctx, "order_refunded", user, existing.reference, `Full refund recorded; ${purchase.points} points reversed: ${reason}`, at);
  return { data, id: existing.id };
}

export function applyUpdateFulfillment(state, input, options) {
  const ctx = context(options), existing = state.orders.find((order) => order.id === input.order_id);
  if (!existing) throw Error("Choose an existing order.");
  if (existing.status !== "paid") throw Error("Fulfillment cannot be changed for a refunded order.");
  if (!fulfillmentStatuses.includes(input.status)) throw Error("Choose a valid fulfillment status.");
  const tracking = text(input.tracking_number ?? "", "tracking number", 0, 200);
  const data = structuredClone(state);
  if (existing.fulfillment_status === input.status && (existing.tracking_number || "") === tracking) return { data, id: existing.id };
  Object.assign(data.orders.find((order) => order.id === existing.id), { fulfillment_status: input.status, tracking_number: tracking });
  audit(data, ctx, "fulfillment_updated", customer(state, existing.user_id), existing.reference, `Fulfillment set to ${input.status}${tracking ? `; tracking ${tracking}` : ""}.`, ctx.now());
  return { data, id: existing.id };
}

import { buildSampleInvoice, normalizeCheckout } from "./invoice.js";

const ordersKey = "crownetic.sample-orders.v1";
const pendingKey = "crownetic.checkout.pending.v1";
const guestKey = "crownetic.checkout.guest.v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function consumeInvoiceBag(current, items) {
  const remaining = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.product_id, item.size]);
    remaining.set(key, (remaining.get(key) || 0) + item.quantity);
  }
  return current.flatMap(line => {
    const key = JSON.stringify([line.productId, line.size]);
    const used = Math.min(line.quantity, remaining.get(key) || 0);
    remaining.set(key, (remaining.get(key) || 0) - used);
    return line.quantity > used ? [{ ...line, quantity: line.quantity - used }] : [];
  });
}

export function createCheckoutStore({ connected, getClient, getProducts, getUser, storage, sessionStorage, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) {
  function load() {
    try {
      const value = JSON.parse(storage.getItem(ordersKey) || "{}");
      return value.version === 1 && Array.isArray(value.orders)
        ? value.orders.filter(entry => entry && typeof entry.owner === "string" && entry.order && uuidPattern.test(entry.order.id || "")) : [];
    } catch { return []; }
  }
  async function identity() {
    const user = await getUser();
    if (user) return { owner: `customer:${user.id}`, user };
    if (connected) throw Error("Please sign in with a verified customer account to receive your invoice.");
    let guest = sessionStorage.getItem(guestKey);
    if (!guest) {
      guest = uuid();
      sessionStorage.setItem(guestKey, guest);
    }
    return { owner: `guest:${guest}`, user: null, guest };
  }
  function pendingFor(owner) {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      return pending?.owner === owner && pending.canonical
        ? { ...pending, canonical: normalizeCheckout(pending.canonical) } : null;
    } catch { return null; }
  }
  function request(input, owner) {
    // Resolve the original attempt before making a new one. A changed price or
    // reset form after a lost response must not allocate a second request UUID.
    const previous = pendingFor(owner);
    if (previous) return previous;
    const guestEmail = String(input.customer?.email || "sample@example.com").trim().toLowerCase();
    if (owner.startsWith("guest:") && (guestEmail.length > 254 || !/^\S+@\S+\.\S+$/.test(guestEmail))) throw Error("Enter a valid example email address.");
    const canonical = normalizeCheckout({ ...input, request_id: uuid() });
    const pending = { owner, canonical, request_id: canonical.request_id, guest_email: guestEmail };
    sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    return pending;
  }
  function clearRequest(owner, requestId) {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      if (pending?.owner === owner && pending.request_id === requestId) sessionStorage.removeItem(pendingKey);
    } catch { /* Never replace the original error or a successfully saved receipt. */ }
  }
  async function invoke(body) {
    const db = await getClient();
    const { data, error } = await db.functions.invoke("sample-checkout", { body });
    if (error) {
      let response;
      try { response = await error.context?.json(); } catch { /* Transport errors have no JSON response. */ }
      const failure = Error(response?.error || "Sample invoice checkout is unavailable. Your bag and any saved invoice are safe. Please try again later.");
      failure.code = response?.code;
      throw failure;
    }
    if (!data?.order?.id) throw Error(data?.error || "We could not confirm the sample invoice. Please try again with the same bag.");
    return data.order;
  }
  async function readConnected(id) {
    const { user } = await identity();
    const db = await getClient();
    let query = db.from("sample_orders").select("*").eq("user_id", user.id);
    if (id) query = query.eq("id", id).maybeSingle();
    else query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) {
      // Account pages remain usable before the owner installs the new table.
      if (["42P01", "PGRST205"].includes(error.code)) return id ? null : [];
      throw error;
    }
    return data || (id ? null : []);
  }
  return {
    async complete(input) {
      if (input.outcome === "declined") throw Error("The sample payment was declined. Your bag is unchanged. Choose a successful sample result to try again.");
      if (input.outcome === "cancelled") throw Error("The sample payment was cancelled. Your bag is unchanged.");
      if (input.outcome !== "success") throw Error("Choose a sample payment result.");
      const who = await identity();
      const pending = request(input, who.owner), canonical = pending.canonical;
      if (connected) {
        let order;
        try { order = await invoke({ action: "checkout", ...canonical }); }
        catch (error) {
          if (["price_changed", "item_unavailable"].includes(error.code)) clearRequest(who.owner, canonical.request_id);
          throw error;
        }
        if ((await identity()).owner !== who.owner || order.user_id !== who.user.id) throw Error("Your account changed. Please sign in again to view the saved invoice.");
        return order;
      }
      const previous = load().find(entry => entry.owner === who.owner && entry.order?.request_id === canonical.request_id);
      if (previous) return structuredClone(previous.order);
      const products = await getProducts();
      if ((await identity()).owner !== who.owner) throw Error("Your account changed. Please sign in again before completing checkout.");
      let order;
      try {
        order = { ...buildSampleInvoice({
          id: uuid(), requestId: canonical.request_id,
          user: who.user || { id: who.guest, email: pending.guest_email },
          customer: canonical.customer, lines: canonical.items, products,
          expectedTotal: canonical.expected_total_sen, createdAt: now(),
        }), email_status: "preview_only" };
        order.reward_eligible = Boolean(who.user);
        if (!who.user) order.points = 0;
      } catch (error) {
        if (["price_changed", "item_unavailable"].includes(error.code)) clearRequest(who.owner, canonical.request_id);
        throw error;
      }
      // Re-read after async work so another invoice's write is never discarded.
      const orders = load();
      const replay = orders.find(entry => entry.owner === who.owner && entry.order?.request_id === canonical.request_id);
      if (replay) return structuredClone(replay.order);
      orders.push({ owner: who.owner, order });
      storage.setItem(ordersKey, JSON.stringify({ version: 1, orders }));
      return structuredClone(order);
    },
    acknowledge(order) {
      try {
        const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
        if (pending?.request_id === order.request_id) sessionStorage.removeItem(pendingKey);
      } catch { /* The persisted invoice and bag receipt remain authoritative. */ }
    },
    async pending() {
      const who = await identity(), pending = pendingFor(who.owner);
      return pending ? { ...pending.canonical, preview_email: who.user?.email || pending.guest_email } : null;
    },
    async get(id) {
      if (!uuidPattern.test(id || "")) return null;
      if (connected) return readConnected(id);
      const { owner } = await identity();
      const entry = load().find(entry => entry.owner === owner && entry.order?.id === id);
      return entry ? structuredClone(entry.order) : null;
    },
    async list() {
      if (connected) return readConnected();
      const { owner } = await identity();
      return load().filter(entry => entry.owner === owner && entry.order)
        .map(entry => structuredClone(entry.order))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },
    async resend(id) {
      if (!connected) throw Error("Email preview only. No email has been sent from this browser-only sample.");
      await identity();
      if (!uuidPattern.test(id || "")) throw Error("Choose an existing sample invoice.");
      return invoke({ action: "resend", order_id: id });
    },
  };
}

let runtime;
async function runtimeStore() {
  return runtime ??= Promise.all([import("../catalog.js"), import("../customer/service.js")]).then(([{ connected, supabase, catalog }, { customers }]) => createCheckoutStore({
    connected, getClient: supabase, getProducts: () => catalog.list(), getUser: () => customers.current(), storage: localStorage, sessionStorage,
  }));
}
export const checkoutStore = Object.fromEntries(["complete", "acknowledge", "pending", "get", "list", "resend"].map(method => [method, async (...args) => (await runtimeStore())[method](...args)]));

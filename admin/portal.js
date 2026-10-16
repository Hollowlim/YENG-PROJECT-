import { adminStore } from "./service.js";
import { escapeHTML as e, money } from "../model.js";
import { saleItemRow } from "./pages.js";

export function mountAdminPortal({ view, snapshot, products = [], onRefresh, onNavigate }) {
  const root = document.querySelector("[data-admin-portal]");
  if (!root) return () => {};
  const abort = new AbortController();
  const { signal } = abort;
  let nextLine = root.querySelectorAll("[data-sale-line]").length;
  let disposed = false;

  function filterRows(kind) {
    const term = root.querySelector(`[data-admin-search="${kind}"]`)?.value.trim().toLowerCase() || "";
    const status = kind === "orders" ? root.querySelector("[data-order-filter]")?.value || "all" : "all";
    const rows = [...root.querySelectorAll(`[data-admin-row="${kind}"]`)];
    let visible = 0;
    for (const row of rows) {
      row.hidden = !(row.dataset.search.includes(term) && (status === "all" || row.dataset.status === status));
      if (!row.hidden) visible += 1;
    }
    const empty = root.querySelector(`[data-admin-empty="${kind}"]`);
    if (empty) empty.hidden = rows.length === 0 || visible > 0;
  }

  function populateSizes(row) {
    const product = products.find((item) => item.id === row.querySelector("[data-sale-product]").value);
    const select = row.querySelector("[data-sale-size]");
    select.innerHTML = '<option value="">Choose size</option>' + (product?.variants || []).map((variant) => `<option value="${e(variant.size)}">${e(variant.size)}</option>`).join("");
    if (product?.variants?.length === 1) select.value = product.variants[0].size;
  }

  function updateSalePreview() {
    let total = 0;
    let points = 0;
    let items = 0;
    const rows = [...root.querySelectorAll("[data-sale-line]")];
    for (const row of rows) {
      const product = products.find((item) => item.id === row.querySelector("[data-sale-product]").value);
      const quantity = Number(row.querySelector("[data-sale-quantity]").value);
      const valid = product && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 9999;
      const summary = row.querySelector("[data-sale-line-summary]");
      if (valid) {
        const lineTotal = product.price_sen * quantity;
        const linePoints = (product.reward_points ?? 100) * quantity;
        total += lineTotal;
        points += linePoints;
        items += quantity;
        summary.textContent = `${money(lineTotal)} · ${linePoints.toLocaleString("en-MY")} points (${(product.reward_points ?? 100).toLocaleString("en-MY")} per item)`;
      } else {
        summary.textContent = product ? "Enter a whole quantity from 1 to 9,999." : "Select a product to preview its price and points.";
      }
      row.querySelector("[data-remove-sale-line]").disabled = rows.length < 2;
    }
    const totalNode = root.querySelector("[data-sale-total]");
    if (totalNode) totalNode.textContent = money(total);
    const pointsNode = root.querySelector("[data-sale-points]");
    if (pointsNode) pointsNode.textContent = points.toLocaleString("en-MY");
    const itemNode = root.querySelector("[data-sale-items]");
    if (itemNode) itemNode.textContent = items.toLocaleString("en-MY");
  }

  function updatePointsPreview() {
    const form = root.querySelector("#admin-adjust-points");
    if (!form) return;
    const customer = snapshot?.customers?.find((item) => item.id === form.elements.user_id.value);
    const node = form.querySelector("[data-points-balance]");
    if (!customer) {
      node.textContent = "Select a customer to see their current balance.";
      return;
    }
    const amount = Number(form.elements.points.value);
    const delta = form.elements.direction.value === "remove" ? -amount : amount;
    node.textContent = `Current balance: ${Number(customer.points || 0).toLocaleString("en-MY")} points${Number.isSafeInteger(amount) && amount > 0 ? ` · After adjustment: ${(Number(customer.points || 0) + delta).toLocaleString("en-MY")} points` : ""}`;
  }

  function showError(form, message) {
    const error = form.querySelector(".admin-form-error");
    if (!error) return;
    error.textContent = message;
    error.tabIndex = -1;
    error.focus();
  }

  async function submitForm(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-admin-form]")) return;
    event.preventDefault();
    if (form.dataset.pending === "true" || form.dataset.saved === "true") return;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const kind = form.dataset.adminForm;
    const error = form.querySelector(".admin-form-error");
    if (error) error.textContent = "";
    let payload;
    let action;
    let message;
    try {
      if (kind === "sale") {
        const items = [...form.querySelectorAll("[data-sale-line]")].map((row) => ({
          product_id: row.querySelector("[data-sale-product]").value,
          size: row.querySelector("[data-sale-size]").value,
          quantity: Number(row.querySelector("[data-sale-quantity]").value),
        }));
        if (!items.length || items.some((item) => !item.product_id || !item.size || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999)) throw Error("Choose a product, size and valid quantity for every item.");
        if (new Set(items.map((item) => JSON.stringify([item.product_id, item.size]))).size !== items.length) throw Error("Use one line per product and size. Increase the quantity on the existing line instead.");
        if (!data.get("payment_confirmed")) throw Error("Confirm that payment was received before recording this sale.");
        form.dataset.requestId ||= crypto.randomUUID();
        payload = { request_id: form.dataset.requestId, user_id: String(data.get("user_id")), reference: String(data.get("reference")).trim(), channel: String(data.get("channel")), items };
        action = () => adminStore.recordSale(payload);
        message = "Paid sale recorded. Customer points have been updated. Manage product stock separately.";
      } else if (kind === "points") {
        const amount = Number(data.get("points"));
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) throw Error("Enter a whole number of points from 1 to 100,000.");
        form.dataset.requestId ||= crypto.randomUUID();
        payload = { request_id: form.dataset.requestId, user_id: String(data.get("user_id")), points: data.get("direction") === "remove" ? -amount : amount, reason: String(data.get("reason")).trim() };
        action = () => adminStore.adjustPoints(payload);
        message = "Points adjustment saved. The customer balance is up to date.";
      } else if (kind === "refund") {
        if (!data.get("refund_confirmed")) throw Error("Confirm that the refund was completed outside this website.");
        payload = { order_id: String(data.get("order_id")), reason: String(data.get("reason")).trim() };
        action = () => adminStore.refundOrder(payload);
        message = "Refund recorded and original points reversed. Manage product stock separately.";
      } else if (kind === "fulfillment") {
        payload = { order_id: String(data.get("order_id")), status: String(data.get("status")), tracking_number: String(data.get("tracking_number") || "").trim() };
        action = () => adminStore.updateFulfillment(payload);
        message = "Delivery progress saved.";
      } else return;
    } catch (failure) {
      showError(form, failure.message || "Check the form and try again.");
      return;
    }
    form.dataset.pending = "true";
    form.setAttribute("aria-busy", "true");
    const controls = [...form.querySelectorAll("input,select,textarea,button")].map((control) => ({ control, disabled: control.disabled }));
    controls.forEach(({ control }) => { control.disabled = true; });
    let saved = false;
    try {
      await action();
      saved = true;
      form.dataset.saved = "true";
      delete form.dataset.requestId;
      if (!disposed) {
        const notice = root.querySelector("[data-admin-message]");
        if (notice) notice.textContent = message;
        await onRefresh?.(message);
      }
    } catch (failure) {
      if (!disposed) showError(form, saved ? "Your change was saved, but the latest view could not load. Reload the page before trying again." : failure.message || "The change could not be saved. Try again.");
    } finally {
      if (!disposed) {
        delete form.dataset.pending;
        form.removeAttribute("aria-busy");
        if (!saved) controls.forEach(({ control, disabled }) => { control.disabled = disabled; });
      }
    }
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !root.contains(target)) return;
    if (target.matches("[data-add-sale-line]")) {
      root.querySelector("[data-sale-lines]").insertAdjacentHTML("beforeend", saleItemRow(nextLine++, products));
      updateSalePreview();
      root.querySelector("[data-sale-line]:last-child [data-sale-product]")?.focus();
    }
    if (target.matches("[data-remove-sale-line]") && root.querySelectorAll("[data-sale-line]").length > 1) {
      target.closest("[data-sale-line]").remove();
      updateSalePreview();
    }
    if (target.matches("[data-admin-retry]")) {
      target.disabled = true;
      Promise.resolve(onRefresh?.("")).catch((failure) => {
        const notice = root.querySelector("[data-admin-message]");
        if (notice && !disposed) notice.textContent = failure.message || "The studio could not reload. Try again.";
      }).finally(() => { if (!disposed) target.disabled = false; });
    }
  }, { signal });
  root.addEventListener("input", (event) => {
    const kind = event.target.dataset.adminSearch;
    if (kind) filterRows(kind);
    if (event.target.closest("[data-sale-line]")) updateSalePreview();
    if (event.target.closest("#admin-adjust-points")) updatePointsPreview();
  }, { signal });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-sale-product]")) populateSizes(event.target.closest("[data-sale-line]"));
    if (event.target.closest("[data-sale-line]")) updateSalePreview();
    if (event.target.matches("[data-order-filter]")) filterRows("orders");
    if (event.target.closest("#admin-adjust-points")) updatePointsPreview();
  }, { signal });
  root.addEventListener("submit", submitForm, { signal });
  updateSalePreview();
  updatePointsPreview();
  return () => {
    disposed = true;
    abort.abort();
  };
}

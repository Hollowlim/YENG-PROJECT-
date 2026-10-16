import { escapeHTML as e, money } from "../model.js";
import { renderInvoiceEmail } from "./invoice.js";
import "./styles.css";

const date = value => new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value));
const link = (path, label, cls = "text-link") => `<a href="#${path}" data-link class="${cls}">${label}</a>`;
const arrow = '<span class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 12h17M14 6l6 6-6 6"/></svg></span>';
export function checkoutPage({ user, connected, orderSummary, pending }) {
  const billing = pending?.customer;
  const names = (billing?.name || user?.name || "Sample Customer").trim().split(/\s+/);
  const locked = pending ? "readonly" : "";
  const recovery = pending ? `<div class="notice checkout-recovery">Your previous sample attempt will be checked using its original details and total before another invoice can be created. New items stay in your bag.</div>` : "";
  if (pending) orderSummary = `<aside class="summary"><h2>PREVIOUS SAMPLE.</h2><p>${pending.items.reduce((sum, item) => sum + item.quantity, 0)} selected piece(s)</p><div class="summary-row summary-total"><strong>Original total</strong><strong>${money(pending.expected_total_sen)}</strong></div><p>No payment will be collected. Complete this step to recover the saved invoice or check the original quote.</p></aside>`;
  return `<section class="page"><span class="small-label">THE FINAL STEP / SIMULATED CHECKOUT</span><h1 class="page-heading">MAKE IT YOURS.</h1><div class="notice">This is a no-charge sample payment. Use an example delivery address. No card information or real delivery is involved.</div><p class="checkout-email-note">${connected ? user ? "A successful sample saves your invoice and sample points. Invoice emails go to your verified account email once the store has enabled delivery." : `Sign in with your verified customer account to save a sample invoice and test email delivery. ${link("/login", "SIGN IN")}` : "This browser-only sample creates a printable invoice and email preview. No email will be sent."}</p>${recovery}<div class="bag-layout"><form id="checkout-form"><div class="form-grid"><div class="field"><label for="first">First name</label><input id="first" required maxlength="60" value="${e(names[0])}" autocomplete="off" ${locked}></div><div class="field"><label for="last">Last name</label><input id="last" required maxlength="59" value="${e(names.slice(1).join(" ") || "Customer")}" autocomplete="off" ${locked}></div><div class="field full"><label for="email">${user ? "Email address" : "Example email"}</label><input id="email" type="email" value="${e(pending?.preview_email || user?.email || "sample@example.com")}" required maxlength="254" autocomplete="off" ${user ? "readonly" : ""}></div><div class="field full"><label for="address">Example delivery address</label><input id="address" value="${e(billing?.address || "123 Sample Street, Kuala Lumpur")}" required maxlength="400" autocomplete="off" ${locked}></div><div class="field"><label for="postcode">Example postcode</label><input id="postcode" value="${e(billing?.postcode || "50000")}" maxlength="20" required ${locked}></div><div class="field"><label for="country">Country</label><input id="country" value="${e(billing?.country || "Malaysia")}" readonly></div><div class="field full"><label for="sample-payment-result">Sample payment result</label><select id="sample-payment-result" ${pending ? "disabled" : ""}><option value="success">Successful sample payment — no charge</option><option value="declined">Declined sample payment</option><option value="cancelled">Cancelled sample payment</option></select></div></div><p id="checkout-error" role="alert" class="error"></p><button class="button" type="submit">COMPLETE SAMPLE ORDER ${arrow}</button><p class="small-label" style="margin-top:20px">SIMULATION ONLY — NOT A REAL PURCHASE</p></form>${orderSummary}</div></section>`;
}

function emailStatus(order) {
  if (order.email_status === "preview_only") return "Email preview only. No email has been sent.";
  if (order.email_status === "accepted") return `Your invoice email was accepted for delivery to ${order.customer_email}. Check your inbox and spam folder.`;
  if (order.email_status === "not_configured") return "Your invoice is saved. Test email delivery has not been set up yet.";
  if (order.email_status === "restricted") return "Your invoice is saved. This email test can send only to the configured Resend test inbox.";
  if (order.email_status === "failed") return "Your invoice is saved, but the email provider rejected the request. You can retry without creating another order.";
  if (order.email_status === "review" || order.email_retry_blocked) return "Email delivery could not be confirmed. Check your inbox and spam folder, or ask the store to review delivery before sending again.";
  return "Your invoice is saved. Its email request is still processing. Check the status or retry in a minute.";
}

export function invoicePage(order) {
  if (!order) return `<section class="page empty"><h1 class="page-heading">INVOICE UNAVAILABLE.</h1><p>Sign in with the customer account that created this sample invoice.</p>${link("/account", "GO TO MY ACCOUNT", "button")}</section>`;
  const canRetry = !order.email_retry_blocked && !["preview_only", "accepted", "review"].includes(order.email_status);
  const points = new Intl.NumberFormat("en-MY").format(Number.isSafeInteger(order.points) && order.points >= 0 ? order.points : 0);
  const email = renderInvoiceEmail(order);
  return `<section class="page invoice-page"><div class="section-top invoice-page-heading"><div><span class="small-label">SIMULATION COMPLETE</span><h1 class="page-heading">YOUR SAMPLE INVOICE.</h1><p>No payment was taken. No items will be dispatched.</p></div>${link("/account", "View your dashboard")}</div>
    <div class="invoice-layout"><article class="invoice-document" aria-label="Sample invoice">
      <header class="invoice-paper-heading"><span class="invoice-wordmark">CROWNNETIC</span><span class="invoice-sample-badge">SAMPLE ONLY</span><h2>SAMPLE INVOICE</h2><p>NO PAYMENT COLLECTED · NOT A TAX INVOICE</p></header>
      <div class="invoice-paper-body"><div class="invoice-identifiers"><div><span class="invoice-label">INVOICE REFERENCE</span><strong>${e(order.reference)}</strong></div><div><span class="invoice-label">DATE / MALAYSIA TIME</span><span>${e(date(order.created_at))}</span></div></div>
      <div class="invoice-billing"><span class="invoice-label">PREPARED FOR</span><strong>${e(order.customer_name)}</strong><span>${e(order.customer_email)}</span><span class="invoice-address">${e(order.billing_address)}</span><span>${e(order.postcode)}, ${e(order.country)}</span></div>
      <table class="invoice-table"><thead><tr><th scope="col">THE PIECES</th><th scope="col">AMOUNT</th></tr></thead><tbody>${order.items.map(item => `<tr><td><strong>${e(item.name)}</strong><span>Size ${e(item.size)} · Quantity ${e(item.quantity)}</span><span>${money(item.unit_price_sen)} each</span></td><td>${money(item.unit_price_sen * item.quantity)}</td></tr>`).join("")}</tbody></table>
      <dl class="invoice-totals"><div><dt>Subtotal</dt><dd>${money(order.subtotal_sen)}</dd></div><div><dt>Illustrative shipping</dt><dd>${money(order.shipping_sen)}</dd></div><div class="invoice-grand-total"><dt>Sample total</dt><dd>${money(order.total_sen)} <small>MYR</small></dd></div></dl>
      <p class="invoice-paper-note">This invoice demonstrates a sample purchase. No real payment, delivery, stock deduction, or real reward points are involved.</p><footer class="invoice-paper-footer">Copyright © ${new Date().getFullYear()} CROWNNETIC. All rights reserved.</footer></div>
    </article><aside class="invoice-actions"><div class="invoice-reward-status" role="status"><span class="small-label">SAMPLE REWARDS</span><strong>+${points}</strong><p>${order.reward_eligible === false ? `0 account points. ${link("/signup", "Create an account")} before your next sample purchase to earn points.` : "Sample points earned. View your sample balance and tier in your dashboard."}</p><span class="invoice-action-note">For testing only. No cash value.</span></div><div class="invoice-email-status" role="status"><span class="small-label">INVOICE EMAIL</span><p>${e(emailStatus(order))}</p>${order.email_error && order.email_status !== "accepted" ? `<p class="invoice-email-error">${e(order.email_error)}</p>` : ""}</div>
      <button class="button" type="button" data-print-invoice>PRINT / SAVE PDF ${arrow}</button>
      ${canRetry ? `<button class="small-button" type="button" data-send-invoice="${e(order.id)}">RETRY INVOICE EMAIL</button><p class="invoice-action-note">Wait at least a minute between email attempts. Retrying reuses this invoice.</p>` : ""}
      <details class="invoice-email-preview"><summary>PREVIEW INVOICE EMAIL</summary><iframe title="Invoice email preview" sandbox loading="lazy" srcdoc="${e(email.html)}"></iframe></details>
      ${link("/shop", "BACK TO THE COLLECTION", "text-link")}
    </aside></div></section>`;
}

export function sampleInvoiceHistory(orders = []) {
  if (!orders.length) return "";
  return `<section class="sample-invoice-history"><div class="section-top"><div><span class="small-label">YOUR CHECKOUT REHEARSALS</span><h2>SAMPLE INVOICES.</h2><p>No payment collected. These samples do not count as purchases or real rewards.</p></div></div><div class="sample-invoice-list">${orders.map(order => `<article><div><strong>${e(order.reference)}</strong><p>${e(date(order.created_at))}</p><span class="small-label">SAMPLE PAYMENT COMPLETE</span></div><strong>${money(order.total_sen)}</strong>${link(`/invoice/${encodeURIComponent(order.id)}`, `View sample invoice ${e(order.reference)}`)}</article>`).join("")}</div></section>`;
}

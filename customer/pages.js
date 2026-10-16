import { escapeHTML as e, money } from "../model.js";
import { connected } from "../catalog.js";
import { usesEmailCode } from "./service.js";
import { loyaltyTier } from "./model.js";
import { sampleInvoiceHistory } from "../checkout/pages.js";
import { summarizeSampleRewards } from "../checkout/rewards.js";
import "./styles.css";
const link = (path, text, cls = "") =>
  `<a href="#${path}" data-link class="${cls}">${text}</a>`;
const sample = () =>
  connected
    ? ""
    : '<p class="notice">SAMPLE ACCOUNT — Stored in this browser only. Use example details. Demo points have no cash value.</p>';
export function authPage(signup = false, message = "", email = "") {
  return `<section class="page customer-auth"><span class="small-label">CROWNNETIC MEMBERS</span><h1 class="page-heading">${signup ? "JOIN THE INNER CIRCLE." : "WELCOME BACK."}</h1><p class="description">${signup ? "Your own space. Your next level." : "Sign in to your collection and rewards."}</p>${sample()}${connected && signup ? `<p class="notice">${usesEmailCode ? "Verify your email with a code before signing in." : "Confirm your email using the link we send before signing in."}</p>` : ""}${message ? `<p class="notice">${e(message)}</p>` : ""}<form id="customer-auth" data-mode="${signup ? "signup" : "login"}">${signup ? '<div class="field"><label for="customer-name">Full name</label><input id="customer-name" name="name" required maxlength="80" autocomplete="name"></div>' : ""}<div class="field"><label for="customer-email">${signup ? "Email address" : "Email address or username"}</label><input id="customer-email" name="email" value="${e(email)}" type="${signup ? "email" : "text"}" required autocomplete="${signup ? "email" : "username"}"></div><div class="field"><label for="customer-password">Password</label><input id="customer-password" name="password" type="password" minlength="8" required autocomplete="${signup ? "new-password" : "current-password"}"></div><p class="small-label">Use at least 8 characters for your password.</p><p class="error customer-error" role="alert"></p><button class="button" type="submit">${signup ? "CREATE ACCOUNT" : "LOG IN"} <span aria-hidden="true">→</span></button></form><p class="auth-switch">${signup ? "Already a member?" : "New to CROWNNETIC?"} ${link(signup ? "/login" : "/signup", signup ? "Log in" : "Create an account", "text-link")}</p>${connected && !signup ? link("/verify", "Confirm your email", "text-link verification-link") : ""}</section>`;
}
const timestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};
function pointEvent(event) {
  const type = event.event_type || event.type || event.kind;
  const adjustment = type === "adjustment" || type === "bonus" || event.item_count === 0;
  const title = type === "refund" ? "Refund reversal" : adjustment ? "Points adjustment" : event.demo ? "Sample purchase" : "Purchase points";
  return `<article class="history-item"><div><strong>${event.demo && (adjustment || type === "refund") ? '<span>Sample entry</span> · ' : ""}<span>${title}</span></strong><p>${e(timestamp(event.created_at))}${!adjustment && event.item_count > 0 ? ` · ${event.item_count} <span>items</span>` : ""}</p>${event.reason ? `<p class="history-reason">${e(event.reason)}</p>` : ""}<span>${e(event.event_ref || "")}</span></div><strong class="points-change">${event.points > 0 ? "+" : ""}${event.points.toLocaleString()} <span>points</span></strong></article>`;
}
function purchaseHistory(orders) {
  return `<section class="purchase-history"><h2>YOUR PURCHASE HISTORY.</h2>${!connected ? '<p class="account-note">Sample sales recorded in this browser only.</p>' : ""}${orders.length ? orders.map((order) => `<article class="customer-order"><div class="section-top"><div><strong>${e(order.reference)}</strong><p>${e(timestamp(order.created_at))} · ${e(order.channel)}</p></div><span class="order-status">${order.status === "refunded" ? "Refunded" : "Paid"}</span></div><ul class="order-items">${(order.items || []).map((item) => `<li><div><strong>${e(item.name)}</strong><p><span>Size</span>: ${e(item.size || "—")} · <span>Quantity</span>: ${item.quantity} · ${money(item.unit_price_sen)} <span>each</span></p></div><strong>${money(item.quantity * item.unit_price_sen)}</strong></li>`).join("")}</ul><p class="order-total"><span>Total</span> <strong>${money(order.total_sen)}</strong></p><p><span>Purchase points</span>: ${order.points.toLocaleString()}</p>${order.fulfillment_status ? `<p><span>Fulfillment</span>: <span>${e(order.fulfillment_status)}</span></p>` : ""}${order.tracking_number ? `<p><span>Tracking number</span>: ${e(order.tracking_number)}</p>` : ""}${order.status === "refunded" ? `<p class="order-refund"><span>Refund reason</span>: ${e(order.refund_reason || "—")}</p>` : ""}</article>`).join("") : '<div class="account-empty"><p>No recorded purchases yet.</p></div>'}</section>`;
}
function sampleRewardsCard(orders) {
  const { points, invoiceCount, tier } = summarizeSampleRewards(orders);
  if (!invoiceCount) return "";
  return `<section class="sample-rewards" aria-labelledby="sample-rewards-heading"><article class="sample-rewards-card sample-tier-${tier.name.toLowerCase()}">
    <div class="sample-rewards-top"><span class="small-label">SAMPLE MEMBERSHIP</span><span class="sample-tier-badge">${e(tier.name)}</span></div>
    <div><span class="small-label">SAMPLE POINTS</span><p class="sample-points-number">${points.toLocaleString()}</p><p class="sample-rewards-count">From ${invoiceCount.toLocaleString()} sample ${invoiceCount === 1 ? "invoice" : "invoices"}</p></div>
    <div class="sample-tier-progress" role="progressbar" aria-label="Sample tier progress" aria-valuenow="${Math.round(tier.progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${tier.progress}%"></span></div>
    <p class="sample-tier-caption">${tier.next ? `${(tier.next.threshold - points).toLocaleString()} sample points to ${e(tier.next.name)}` : "Your sample membership has reached Platinum."}</p>
  </article><div class="sample-rewards-description"><span class="small-label">YOUR CHECKOUT REHEARSALS</span><h2 id="sample-rewards-heading">SAMPLE REWARDS.</h2><p>Each completed sample invoice adds sample points here, even if its email is still pending or cannot be delivered.</p><p>100 sample points per item by default. Individual products may award a different amount, saved when your invoice is created.</p><dl class="sample-reward-thresholds"><div><dt>Bronze</dt><dd>1,000</dd></div><div><dt>Gold</dt><dd>5,000</dd></div><div><dt>Platinum</dt><dd>10,000</dd></div></dl><p class="sample-rewards-note">Sample points and tiers have no cash value and do not change your purchase rewards or membership above.</p></div></section>`;
}
export function dashboard(user, activity, orders = [], sampleOrders = []) {
  const total = activity.reduce((sum, event) => sum + event.points, 0),
    tier = loyaltyTier(total);
  return `<section class="page account-page"><div class="section-top"><div><span class="small-label">CROWNNETIC MEMBERS</span><h1 class="page-heading">YOUR INNER CIRCLE.</h1><p class="description"><span>Welcome back,</span> ${e(user.name)}.</p></div>${link("/settings", "Profile settings", "text-link")}</div>${sample()}<div class="account-layout"><article class="membership-card tier-${tier.name.toLowerCase()}"><div class="membership-top"><span>CROWNNETIC</span><span class="tier-badge">${tier.name}</span></div><div><span class="small-label">${connected ? "TOTAL POINTS" : "DEMO POINTS"}</span><p class="points-number">${total.toLocaleString()}</p><p class="member-name">${e(user.name)}</p><span class="small-label">${e(user.email)}</span></div><div class="tier-progress" role="progressbar" aria-label="Tier progress" aria-valuenow="${Math.round(tier.progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${tier.progress}%"></span></div><p class="tier-caption">${tier.next ? `${(tier.next.threshold - total).toLocaleString()} <span>points to</span> ${tier.next.name}` : "You have reached Platinum."}</p></article><div class="tier-overview"><h2>YOUR NEXT LEVEL.</h2><p>Earn points with every item you buy.</p><div class="tier-list">${[
    { name: "Bronze", n: 1000 },
    { name: "Gold", n: 5000 },
    { name: "Platinum", n: 10000 },
  ]
    .map(
      (t) =>
        `<div class="tier-list-item ${total >= t.n ? "unlocked" : ""}"><span class="tier-orb orb-${t.name.toLowerCase()}"></span><strong>${t.name}</strong><span>${t.n.toLocaleString()} <span>points</span></span></div>`,
    )
    .join(
      "",
    )}</div><p class="account-note">100 points per item by default. Individual items may earn different points.</p>${link("/shop", "SHOP THE COLLECTION", "button")}</div></div>${sampleRewardsCard(sampleOrders)}<section class="rewards-history"><div class="section-top"><h2>YOUR POINTS HISTORY.</h2><button class="small-button" data-customer-logout>SIGN OUT</button></div>${activity.length ? `<div class="history-list">${activity.map(pointEvent).join("")}</div>` : '<div class="account-empty"><p>No points activity yet.</p><p>Your points will appear here after your first purchase.</p></div>'}</section>${purchaseHistory(orders)}${sampleInvoiceHistory(sampleOrders)}</section>`;
}
export function settingsPage(user) {
  return `<section class="page customer-auth"><span class="small-label">CROWNNETIC MEMBERS</span><h1 class="page-heading">PROFILE SETTINGS.</h1>${link("/account", "Back to dashboard", "text-link")}<form id="customer-settings" style="margin-top:30px"><div class="field"><label for="profile-name">Full name</label><input id="profile-name" name="name" value="${e(user.name)}" required maxlength="80" autocomplete="name"></div><div class="field"><label for="profile-email">Email address</label><input id="profile-email" value="${e(user.email)}" type="email" readonly></div><div class="field"><label for="profile-phone">Phone number</label><input id="profile-phone" name="phone" type="tel" maxlength="30" autocomplete="tel" value="${e(user.phone)}"></div><div class="field"><label for="profile-address">Delivery address</label><textarea id="profile-address" name="address" maxlength="400" autocomplete="street-address">${e(user.address)}</textarea></div><p class="error customer-error" role="alert"></p><p class="customer-saved" role="status"></p><button class="button" type="submit">SAVE PROFILE <span aria-hidden="true">→</span></button></form></section>`;
}

export function verificationPage(pending) {
  if (!connected) return `<section class="page customer-auth"><span class="small-label">CROWNNETIC MEMBERS</span><h1 class="page-heading">VERIFY YOUR EMAIL.</h1><p class="notice">Email verification is not connected in this sample. No email has been sent.</p>${link("/login", "Back to login", "button")}</section>`;
  const instructions = usesEmailCode
    ? "Enter the code from your CROWNNETIC email."
    : "Open the confirmation link in your email.";
  const help = usesEmailCode
    ? "If you need a new code, enter your email and choose resend. Check your spam folder too."
    : "Choose “Confirm email address” in the email, then return here to log in. Check your spam folder too.";
  return `<section class="page customer-auth"><span class="small-label">CROWNNETIC MEMBERS</span><h1 class="page-heading">VERIFY YOUR EMAIL.</h1>
    <p class="description">${instructions}</p><p class="verification-help">${help}</p>
    <form id="${usesEmailCode ? "customer-verify" : "customer-confirmation"}">
      <div class="field"><label for="verify-email">Email address</label><input id="verify-email" name="email" type="email" autocomplete="email" required value="${e(pending?.email || "")}"></div>
      ${usesEmailCode ? '<div class="field"><label for="verify-code">Verification code</label><input id="verify-code" class="verification-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required aria-describedby="verify-help"></div><p id="verify-help" class="verification-help">Use the latest code. Never share it with anyone.</p>' : ""}
      <p class="error customer-error" role="alert"></p><p class="customer-saved" role="status"></p>
      ${usesEmailCode ? '<button class="button" type="submit">VERIFY EMAIL <span aria-hidden="true">→</span></button>' : link("/login", 'CONTINUE TO LOG IN <span aria-hidden="true">→</span>', "button")}
      <button class="small-button verification-resend" type="button" data-resend-verification>${usesEmailCode ? "RESEND CODE" : "RESEND EMAIL"}</button><span class="verification-cooldown" data-resend-countdown aria-live="off"></span>
    </form><p class="auth-switch">${link("/login", "Back to login", "text-link")}${link("/signup", "Create an account", "text-link")}</p></section>`;
}

export const money = (value) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    value / 100,
  );
export function priceSen(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim()))
    throw Error("Enter a valid price with at most two decimal places.");
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result)) throw Error("Price is too large.");
  return result;
}
export function safeImage(url) {
  if (typeof url !== "string") return false;
  if (/^\.\/public\/assets\/[a-zA-Z0-9_./-]+$/.test(url)) return true;
  if (
    /^\/(?!\/)/.test(url) ||
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url)
  )
    return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
export function validateProduct(p) {
  if (
    p.reward_points !== undefined &&
    (!Number.isSafeInteger(p.reward_points) ||
      p.reward_points < 0 ||
      p.reward_points > 100000)
  )
    throw Error("Reward points must be a whole number from 0 to 100,000.");
  if (
    !p.name?.trim() ||
    !p.description?.trim() ||
    !["Tees", "Bottoms", "Accessories"].includes(p.category)
  )
    throw Error("Name, category and description are required.");
  if (!Number.isSafeInteger(p.price_sen) || p.price_sen < 0)
    throw Error("Enter a valid price.");
  for (const field of ["view_left", "view_right", "view_sprite"]) {
    if (p[field] && !safeImage(p[field]))
      throw Error("Use a valid image URL for each viewing angle.");
  }
  if (!safeImage(p.image_url))
    throw Error("Use an HTTPS image URL or upload a JPEG, PNG or WebP.");
  if (
    !Array.isArray(p.variants) ||
    !p.variants.length ||
    p.variants.some(
      (v) => !v.size?.trim() || !Number.isSafeInteger(v.stock) || v.stock < 0,
    ) ||
    new Set(p.variants.map((v) => v.size)).size !== p.variants.length
  )
    throw Error("Add unique sizes with whole, nonnegative stock counts.");
  return p;
}
export function addToBag(lines, p, size, quantity) {
  const variant = p.variants.find((v) => v.size === size);
  const current = lines.find((l) => l.productId === p.id && l.size === size);
  const total = (current?.quantity || 0) + quantity;
  if (
    !p.published ||
    !variant ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    total > variant.stock
  )
    throw Error("Choose an available size and quantity within stock.");
  return current
    ? lines.map((l) => (l === current ? { ...l, quantity: total } : l))
    : [...lines, { productId: p.id, size, quantity }];
}
export function subtotal(lines, products) {
  return lines.reduce(
    (sum, l) =>
      sum +
      (products.find((p) => p.id === l.productId)?.price_sen || 0) * l.quantity,
    0,
  );
}
export function bagErrors(lines, products) {
  if (!lines.length) return ["Your bag is empty."];
  return lines.flatMap((l) => {
    const p = products.find((p) => p.id === l.productId);
    const v = p?.variants.find((v) => v.size === l.size);
    const total = lines
      .filter(
        (other) => other.productId === l.productId && other.size === l.size,
      )
      .reduce((sum, other) => sum + other.quantity, 0);
    return !p?.published ||
      !v ||
      !Number.isSafeInteger(l.quantity) ||
      l.quantity < 1 ||
      !Number.isSafeInteger(total) ||
      v.stock < total
      ? [
          `${p?.name || "An item"} is no longer available in the requested quantity.`,
        ]
      : [];
  });
}
export function restore(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v?.version === 1 && Array.isArray(v.data) ? v.data : fallback;
  } catch {
    return fallback;
  }
}
export const visibleProducts = (products) =>
  products.filter((p) => p.published);
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

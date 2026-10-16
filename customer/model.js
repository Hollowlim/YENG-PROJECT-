export function loyaltyTier(points) {
  const tiers = [
    { name: "Member", threshold: 0 },
    { name: "Bronze", threshold: 1000 },
    { name: "Gold", threshold: 5000 },
    { name: "Platinum", threshold: 10000 },
  ];
  const index = Math.max(0, tiers.findLastIndex((t) => points >= t.threshold));
  const current = tiers[index],
    next = tiers[index + 1];
  return {
    ...current,
    next,
    progress: next
      ? Math.max(
          0,
          Math.min(
            100,
            ((points - current.threshold) /
              (next.threshold - current.threshold)) *
              100,
          ),
        )
      : 100,
  };
}
export function itemPoints(lines, products) {
  return lines.reduce((sum, line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product || !Number.isSafeInteger(line.quantity) || line.quantity < 1)
      throw Error("Invalid reward item.");
    const points = product.reward_points ?? 100;
    if (!Number.isSafeInteger(points) || points < 0)
      throw Error("Invalid item points.");
    return sum + line.quantity * points;
  }, 0);
}
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: new Uint8Array(salt.match(/../g).map((x) => parseInt(x, 16))),
        iterations: 120000,
      },
      key,
      256,
    ),
  );
}
export async function hashPassword(password) {
  if (password.length < 8)
    throw Error("Use at least 8 characters for your password.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(password, salt) };
}
export async function verifyPassword(password, record) {
  return (await derive(password, record.salt)) === record.hash;
}

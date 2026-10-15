import { validateProduct, restore, visibleProducts } from "./model.js";
export const seed = [
  {
    id: "core-heavyweight-tee",
    view_sprite: "/assets/tee-views.png",
    name: "Core Heavyweight Tee",
    category: "Tees",
    description:
      "A generous silhouette. A washed charcoal finish. Your everyday uniform, reimagined. Sample product shown with illustrative campaign imagery.",
    price_sen: 18900,
    image_url: "/assets/tee.png",
    published: true,
    variants: [
      { size: "S", stock: 8 },
      { size: "M", stock: 12 },
      { size: "L", stock: 10 },
      { size: "XL", stock: 6 },
    ],
    tag: "THE EVERYDAY ESSENTIAL",
  },
  {
    id: "archive-cargo",
    view_sprite: "/assets/cargo-views.png",
    name: "Archive Cargo",
    category: "Bottoms",
    description:
      "Room to move. A relaxed wide-leg profile with utility pockets and a washed finish. An effortless counterpart to the oversized tee. Illustrative sample product.",
    price_sen: 28900,
    image_url: "/assets/cargo.png",
    published: true,
    variants: [
      { size: "S", stock: 5 },
      { size: "M", stock: 8 },
      { size: "L", stock: 6 },
      { size: "XL", stock: 3 },
    ],
    tag: "FORM MEETS FUNCTION",
  },
  {
    id: "signature-cap",
    view_sprite: "/assets/cap-views.png",
    name: "Signature Cap",
    category: "Accessories",
    description:
      "The finishing touch. A washed black cap with a curved brim and an understated signature. Sample product; image is illustrative.",
    price_sen: 8900,
    image_url: "/assets/cap.png",
    published: true,
    variants: [{ size: "ONE SIZE", stock: 15 }],
    tag: "LESS, BUT BETTER",
  },
];
const key = "crownetic.catalog.v1";
const url = import.meta.env.VITE_SUPABASE_URL,
  token = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const connected = Boolean(url && token);
let client;
export async function supabase() {
  if (!connected) throw Error("Supabase is not configured.");
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(url, token);
  }
  return client;
}
function local() {
  const products = restore(localStorage.getItem(key), structuredClone(seed));
  return products.every((p) => {
    try {
      validateProduct(p);
      return typeof p.id === "string";
    } catch {
      return false;
    }
  })
    ? products.map((p) => {
        const original = seed.find((item) => item.id === p.id);
        return original &&
          !Object.hasOwn(p, "view_sprite") &&
          p.image_url.split("/").pop() === original.image_url.split("/").pop()
          ? { ...p, view_sprite: original.view_sprite }
          : p;
      })
    : structuredClone(seed);
}
export const catalog = {
  async list(admin = false) {
    if (Boolean(url) !== Boolean(token))
      throw Error(
        "Supabase configuration is incomplete. Set both project URL and publishable key.",
      );
    if (!connected) {
      const items = local();
      return admin ? items : visibleProducts(items);
    }
    const db = await supabase();
    let query = db
      .from("products")
      .select("*, variants:product_variants(size,stock)")
      .order("created_at");
    if (!admin) query = query.eq("published", true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  async save(product, id) {
    validateProduct(product);
    if (connected) {
      const db = await supabase();
      const { data, error } = await db.rpc("save_product", {
        product_data: { ...product, id: id || crypto.randomUUID() },
      });
      if (error) throw error;
      return data;
    }
    const items = local();
    const next = { ...product, id: id || crypto.randomUUID() };
    const index = items.findIndex((p) => p.id === next.id);
    if (index < 0) items.push(next);
    else items[index] = next;
    localStorage.setItem(key, JSON.stringify({ version: 1, data: items }));
    return next;
  },
  async reset() {
    if (connected) throw Error("Reset is available in demo mode only.");
    localStorage.removeItem(key);
  },
  async upload(file) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    )
      throw Error("Choose a JPEG, PNG or WebP image smaller than 2 MB.");
    if (!connected)
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(Error("Could not read image."));
        r.readAsDataURL(file);
      });
    const db = await supabase();
    const name = `${crypto.randomUUID()}.${file.type.split("/")[1]}`;
    const { error } = await db.storage
      .from("product-images")
      .upload(name, file);
    if (error) throw error;
    return db.storage.from("product-images").getPublicUrl(name).data.publicUrl;
  },
};

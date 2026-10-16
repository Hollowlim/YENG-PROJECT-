import { connected, supabase } from "../catalog.js";
import { createEmailAuth } from "./email-auth.js";
import { emailVerificationMode } from "../site-config.js";
import { hashPassword, verifyPassword, itemPoints } from "./model.js";
import { loadCustomers as load, saveCustomers as save } from "./storage.js";
import { readCustomerOrders } from "./orders.js";
export const emailAuth = createEmailAuth({ getClient: supabase, storage: sessionStorage });
export const usesEmailCode = (import.meta.env.VITE_EMAIL_VERIFICATION_MODE ?? emailVerificationMode) === "code";
const session = "crownetic.customer.session";
const publicUser = ({ password, ...user }) => user;
export const customers = {
  async current() {
    if (connected) {
      const db = await supabase();
      const {
        data: { user },
        error,
      } = await db.auth.getUser();
      if (error && error.name !== "AuthSessionMissingError") throw error;
      if (!user) return null;
      if (!user.email_confirmed_at) {
        await db.auth.signOut();
        return null;
      }
      const { data, error: profileError } = await db
        .from("customer_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      return {
        id: user.id,
        email: user.email,
        name: data?.display_name || user.user_metadata?.name || "",
        phone: data?.phone || "",
        address: data?.address || "",
        created_at: user.created_at,
      };
    }
    const user = load().users.find(
      (u) => u.id === sessionStorage.getItem(session),
    );
    return user ? publicUser(user) : null;
  },
  async signup({ name, email, password }) {
    name = name.trim();
    email = email.trim().toLowerCase();
    if (!name || name.length > 80 || !/^\S+@\S+\.\S+$/.test(email))
      throw Error("Enter your name and a valid email.");
    if (password.length < 8)
      throw Error("Use at least 8 characters for your password.");
    if (connected) return emailAuth.signup({ name, email, password });
    // Hash first, then read shared storage so concurrent admin changes are retained.
    const passwordRecord = await hashPassword(password);
    const data = load();
    if (data.users.some((u) => u.email === email))
      throw Error("An account with this email already exists.");
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      password: passwordRecord,
      phone: "",
      address: "",
      created_at: new Date().toISOString(),
    };
    data.users.push(user);
    save(data);
    sessionStorage.setItem(session, user.id);
    return { confirmation: false };
  },
  async login(email, password) {
    email = email.trim().toLowerCase();
    if (connected) return emailAuth.login(email, password);
    const user = load().users.find((u) => u.email === email);
    if (!user || !(await verifyPassword(password, user.password)))
      throw Error("Email or password is incorrect.");
    sessionStorage.setItem(session, user.id);
  },
  async logout() {
    if (connected) {
      const db = await supabase();
      const { error } = await db.auth.signOut();
      if (error) throw error;
    } else sessionStorage.removeItem(session);
  },
  async update({ name, phone, address }) {
    const user = await this.current();
    if (!user) throw Error("Please sign in first.");
    name = name.trim();
    if (!name || name.length > 80 || phone.length > 30 || address.length > 400)
      throw Error("Check your profile details.");
    if (connected) {
      const db = await supabase();
      const { error } = await db
        .from("customer_profiles")
        .upsert({ user_id: user.id, display_name: name, phone, address });
      if (error) throw error;
    } else {
      const data = load();
      Object.assign(
        data.users.find((u) => u.id === user.id),
        { name, phone, address },
      );
      save(data);
    }
  },
  async activity() {
    const user = await this.current();
    if (!user) return [];
    if (connected) {
      const db = await supabase();
      const { data, error } = await db
        .from("loyalty_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
    return load()
      .events.filter((e) => e.user_id === user.id)
      .reverse();
  },
  async orders() {
    const user = await this.current();
    if (!user) return [];
    if (connected) {
      const db = await supabase();
      return readCustomerOrders(db, user.id);
    }
    return load().orders
      .filter((order) => order.user_id === user.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(({ request_id, request_payload, ...order }) => order);
  },
  async awardDemo(lines, products, reference, expectedUserId) {
    if (connected) return 0;
    const user = await this.current();
    if (!user || (expectedUserId && user.id !== expectedUserId)) return 0;
    const data = load();
    if (data.events.some((e) => e.event_ref === reference)) return 0;
    const points = itemPoints(lines, products);
    data.events.push({
      id: crypto.randomUUID(),
      event_ref: reference,
      user_id: user.id,
      points,
      item_count: lines.reduce((n, l) => n + l.quantity, 0),
      created_at: new Date().toISOString(),
      items: lines.map((l) => ({
        name: products.find((p) => p.id === l.productId)?.name,
        quantity: l.quantity,
      })),
      demo: true,
    });
    save(data);
    return points;
  },
};

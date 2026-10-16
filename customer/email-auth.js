const pendingKey = "crownetic.email-verification.v1";
const cooldown = 60_000;
function normalizeEmail(value) {
  const email = String(value).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw Error("Enter a valid email address.");
  return email;
}

// Supabase owns the codes, expiry, rate limits and sessions. This stores only
// the pending address and a UX cooldown; it never stores a password or OTP.
export function createEmailAuth({ getClient, storage, now = Date.now }) {
  const service = {
    pending() {
      try {
        const value = JSON.parse(storage.getItem(pendingKey) || "null");
        if (!value || !Number.isFinite(value.resendAt)) return null;
        return { email: normalizeEmail(value.email), resendAt: value.resendAt };
      } catch { return null; }
    },
    remember(value, sent = false) {
      const email = normalizeEmail(value);
      const previous = service.pending();
      const resendAt = sent ? now() + cooldown : previous?.email === email ? previous.resendAt : 0;
      storage.setItem(pendingKey, JSON.stringify({ email, resendAt }));
    },
    remaining() {
      return Math.max(0, Math.ceil(((service.pending()?.resendAt || 0) - now()) / 1000));
    },
    async signup({ name, email: address, password }) {
      const email = normalizeEmail(address);
      const db = await getClient();
      const { data, error } = await db.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw error;
      if (data.session) {
        await db.auth.signOut();
        throw Error("Email verification is not enabled. Please contact the store.");
      }
      service.remember(email, true);
      return { confirmation: true, email };
    },
    async login(address, password) {
      const email = normalizeEmail(address);
      const db = await getClient();
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error?.code === "email_not_confirmed") {
        service.remember(email);
        return { confirmation: true, email };
      }
      if (error) throw error;
      if (!data.session || !data.user?.email_confirmed_at) {
        await db.auth.signOut();
        service.remember(email);
        return { confirmation: true, email };
      }
      storage.removeItem(pendingKey);
      return { confirmation: false };
    },
    async verify(address, value) {
      const email = normalizeEmail(address);
      const token = String(value).trim();
      if (!/^[0-9]{6,10}$/.test(token)) throw Error("Enter the verification code from your email.");
      const db = await getClient();
      const { data, error } = await db.auth.verifyOtp({ email, token, type: "email" });
      if (error) throw error;
      if (!data.session || !data.user?.email_confirmed_at) {
        await db.auth.signOut();
        throw Error("Verification did not complete. Please request a new code.");
      }
      storage.removeItem(pendingKey);
    },
    async resend(address) {
      const email = normalizeEmail(address);
      if (service.pending()?.email === email && service.remaining() > 0)
        throw Error("Please wait before requesting another code.");
      const db = await getClient();
      const { error } = await db.auth.resend({ type: "signup", email });
      if (error) throw error;
      service.remember(email, true);
    },
  };
  return service;
}

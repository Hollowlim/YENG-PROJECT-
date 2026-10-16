import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CheckoutError } from "../../../checkout/invoice.js";
import { createSampleCheckoutHandler } from "./handler.js";
import { createInvoiceEmailSender } from "./email-provider.js";

// All secrets stay in the Edge Function runtime. No VITE_ secret is read here.
const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const resendKey = Deno.env.get("RESEND_API_KEY") || "";
const sendgridKey = Deno.env.get("SENDGRID_API_KEY") || "";
const emailProvider = (Deno.env.get("INVOICE_EMAIL_PROVIDER") || "resend").trim().toLowerCase();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
// The project does not generate database TypeScript types yet. Retaining the
// client's generic defaults avoids inferring an empty schema from ReturnType.
let privilegedClient: SupabaseClient | undefined;

function database() {
  if (!projectUrl || !serverKey) throw new CheckoutError("The sample invoice backend has not been configured.", 503, "backend_not_configured");
  privilegedClient ||= createClient(projectUrl, serverKey, clientOptions);
  return privilegedClient;
}

function storageError(error: { code?: string; message?: string }) {
  if (["42703", "PGRST204"].includes(error.code || "")) throw new CheckoutError("Sample invoice rewards and email setup is not ready. Apply supabase/006_sample_rewards.sql in Supabase.", 503, "setup_required");
  if (["42P01", "42883", "PGRST200", "PGRST202", "PGRST205"].includes(error.code || "")) throw new CheckoutError("Sample invoice storage is not ready. Apply supabase/006_sample_rewards.sql in Supabase.", 503, "setup_required");
  if (/^Daily sample invoice limit reached\./.test(error.message || "")) throw new CheckoutError("Daily sample invoice limit reached. Please try again tomorrow.", 429, "sample_limit_reached");
  // Provider/database messages may contain request details. Never return or log
  // their bodies, access tokens, API keys or privileged connection information.
  throw new Error("The sample invoice storage operation could not be completed.");
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await database().rpc(name, args);
  if (error) storageError(error);
  if (!data) throw new Error("The sample invoice storage operation returned no record.");
  return data;
}

const repository = {
  async getByRequest(userId: string, requestId: string) {
    const { data, error } = await database().from("sample_orders").select("*,points").eq("user_id", userId).eq("request_id", requestId).maybeSingle();
    if (error) storageError(error);
    return data;
  },
  async getById(userId: string, id: string) {
    const { data, error } = await database().from("sample_orders").select("*,points").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) storageError(error);
    return data;
  },
  create(order: Record<string, unknown>) {
    return rpc("create_sample_order", { order_data: order });
  },
  async setEmailUnavailable(id: string, status: string, errorMessage: string) {
    const db = database();
    const { data, error } = await db.from("sample_orders")
      .update({ email_status: status, email_error: errorMessage })
      .eq("id", id).in("email_status", ["pending", "not_configured", "restricted", "failed"])
      .eq("email_retry_blocked", false).select("*,points").maybeSingle();
    if (error) storageError(error);
    if (data) return data;
    // An accepted send or an active worker's claim wins over an unavailable
    // configuration update from another request.
    const latest = await db.from("sample_orders").select("*,points").eq("id", id).single();
    if (latest.error) storageError(latest.error);
    return latest.data;
  },
  claimEmail(id: string) {
    return rpc("claim_sample_invoice_email", { p_order_id: id });
  },
  claimEmailOnce(id: string) {
    return rpc("claim_sample_invoice_email_once", { p_order_id: id });
  },
  markEmailUnknown(id: string, claimId: string, errorMessage: string) {
    return rpc("mark_sample_invoice_email_unknown", { p_order_id: id, p_claim_id: claimId, p_error: errorMessage });
  },
  finishEmail(id: string, claimId: string, providerId: string | null, errorMessage: string) {
    return rpc("finish_sample_invoice_email", { p_order_id: id, p_claim_id: claimId, p_provider_id: providerId, p_error: errorMessage });
  },
};

const handler = createSampleCheckoutHandler({
  async authenticate(token: string) {
    if (!projectUrl || !publicKey) throw new Error("Authentication is not configured.");
    const client = createClient(projectUrl, publicKey, clientOptions);
    // Explicit user validation also supports projects using asymmetric signing
    // keys when gateway legacy JWT verification is disabled for this function.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error("Customer authentication failed.");
    return data.user;
  },
  async getProducts(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return [];
    const { data, error } = await database().from("products")
      .select("id,name,price_sen,reward_points,published,variants:product_variants(size,stock)")
      .in("id", uniqueIds).eq("published", true);
    if (error) storageError(error);
    return data || [];
  },
  repository,
  sendEmail: createInvoiceEmailSender({ provider: emailProvider, sendgridKey, resendKey }),
  config: {
    provider: emailProvider,
    sendgridConfigured: Boolean(sendgridKey.trim()),
    fromEmail: Deno.env.get("INVOICE_FROM_EMAIL") || "",
    allowedOrigins: (Deno.env.get("INVOICE_ALLOWED_ORIGINS") || "").split(",").map((origin) => origin.trim()).filter(Boolean),
    resendConfigured: Boolean(resendKey.trim()),
    testRecipient: Deno.env.get("INVOICE_TEST_RECIPIENT") || "",
  },
});

Deno.serve(handler);

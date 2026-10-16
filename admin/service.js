import { loadCustomers, saveCustomers } from "../customer/storage.js";
import { adminSnapshot, applyRecordSale, applyAdjustPoints, applyRefundOrder, applyUpdateFulfillment } from "./model.js";

const migrationMessage = "Run supabase/004_admin_portal.sql in Supabase SQL Editor to enable customer and order tools.";

export function createAdminStore({ connected, getClient, getProducts, storage, sessionStorage, now, uuid }) {
  function requireLocalAdmin() {
    if (sessionStorage.getItem("crownetic.demo.admin") !== "yes") throw Error("Administrator sign in is required.");
  }
  async function rpc(name, args) {
    const db = await getClient();
    const { data, error } = await db.rpc(name, args);
    if (error) {
      if (["PGRST202", "42883"].includes(error.code) || /could not find the function|function .* does not exist/i.test(error.message || "")) throw Error(migrationMessage);
      throw Error(error.message || "The admin action could not be completed.");
    }
    return data;
  }
  const ctx = { now, uuid, actor: "admin@123" };
  function mutate(action, input, products) {
    requireLocalAdmin();
    const previous = loadCustomers(storage);
    const result = action === applyRecordSale ? action(previous, input, products, ctx) : action(previous, input, ctx);
    // The model validates everything on a clone before this one atomic storage write.
    saveCustomers(result.data, storage);
    return result.id;
  }
  return {
    async snapshot() {
      if (connected) return rpc("admin_portal_snapshot");
      requireLocalAdmin();
      return adminSnapshot(loadCustomers(storage));
    },
    async recordSale(data) {
      if (connected) return rpc("admin_record_sale", { sale_data: data });
      requireLocalAdmin();
      const products = await getProducts();
      // Recheck after the asynchronous catalog read in case the admin signed out.
      return mutate(applyRecordSale, data, products);
    },
    async adjustPoints(data) {
      if (connected) return rpc("admin_adjust_points", { adjustment_data: data });
      return mutate(applyAdjustPoints, data);
    },
    async refundOrder(data) {
      if (connected) return rpc("admin_refund_order", { p_order_id: data.order_id, p_reason: data.reason });
      return mutate(applyRefundOrder, data);
    },
    async updateFulfillment(data) {
      if (connected) return rpc("admin_update_fulfillment", { p_order_id: data.order_id, p_status: data.status, p_tracking_number: data.tracking_number ?? "" });
      return mutate(applyUpdateFulfillment, data);
    },
  };
}

let runtime;
async function runtimeStore() {
  if (!runtime) runtime = import("../catalog.js").then(({ connected, supabase, catalog }) => createAdminStore({ connected, getClient: supabase, getProducts: () => catalog.list(true), storage: localStorage, sessionStorage }));
  return runtime;
}
export const adminStore = Object.fromEntries(["snapshot", "recordSale", "adjustPoints", "refundOrder", "updateFulfillment"].map((method) => [method, async (...args) => (await runtimeStore())[method](...args)]));

export async function readCustomerOrders(db, userId) {
  if (!userId) throw Error("Please sign in first.");
  const { data, error } = await db
    .from("orders")
    .select("*,items:order_items(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    // Existing accounts must remain usable while the owner installs migration 004.
    // Authentication, permission, and network errors must still reach the caller.
    if (["42P01", "PGRST200", "PGRST205"].includes(error.code)) return [];
    throw error;
  }
  return data;
}

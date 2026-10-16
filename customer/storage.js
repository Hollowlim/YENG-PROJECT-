const key = "crownetic.customers.v1";
const empty = () => ({ version: 1, users: [], events: [], orders: [], activity: [] });

export function loadCustomers(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(key) || "{}");
    if (value.version !== 1 || !Array.isArray(value.users) || !Array.isArray(value.events)) return empty();
    return {
      ...value,
      orders: Array.isArray(value.orders) ? value.orders : [],
      activity: Array.isArray(value.activity) ? value.activity : [],
    };
  } catch {
    return empty();
  }
}

export function saveCustomers(data, storage = localStorage) {
  storage.setItem(key, JSON.stringify(data));
}

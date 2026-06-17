const API_BASE = "";

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
};

export type Dish = {
  id: string;
  name: string;
  categoryId: string;
  category: Category;
  imageUrl?: string;
  description?: string;
  tags: string[];
  prepItems: PrepItem[];
  servingHint?: string;
  enabled: boolean;
  stockLimit?: number;
  sortOrder: number;
  orderCount: number;
};

export type PrepItem = {
  name: string;
  quantity: number;
  unit: string;
};

export type EventInfo = {
  id: string;
  title: string;
  description?: string;
  dateTime?: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  accessCode: string;
  allowModify: boolean;
  showSummary: boolean;
};

export type MenuPayload = {
  event: EventInfo;
  categories: Category[];
  dishes: Dish[];
};

export type SummaryItem = {
  dish: Dish;
  quantity: number;
  notes: string[];
  guests: string[];
};

export type IngredientSummaryItem = {
  name: string;
  quantity: number;
  unit: string;
  sources: string[];
};

export type Order = {
  id: string;
  guestName: string;
  guestToken: string;
  note?: string;
  createdAt: string;
  items: Array<{ id: string; quantity: number; note?: string; dish: Dish }>;
};

export function token() {
  return localStorage.getItem("adminToken") || "";
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token()) headers.set("Authorization", `Bearer ${token()}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "请求失败" }));
    throw new Error(error.message || "请求失败");
  }
  return response.json();
}

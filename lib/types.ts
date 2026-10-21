export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  base_price: number;
  cost: number;
  stock: number;
  emoji: string;
  hue: number;
  tags: string[];
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
};

export type PricedProduct = Product & {
  effective_price: number;
  price_experiment?: { experiment_id: string; arm_id: string } | null;
};

export type Arm = { id: string; label: string; config: Record<string, unknown> };

export type Experiment = {
  id: string;
  name: string;
  surface: string;
  hypothesis: string | null;
  status: "running" | "ended";
  arms: Arm[];
  conversion_event: "purchase" | "add_to_cart";
  created_by: string;
  created_at: string;
  ended_at: string | null;
  winner_arm: string | null;
  outcome: string | null;
};

export type ArmStat = {
  experiment_id: string;
  arm_id: string;
  impressions: number;
  conversions: number;
  revenue: number;
};

export type Settings = {
  store_name: string;
  hero_headline: string;
  hero_subheadline: string;
  cta_label: string;
  product_sort: "learned" | "default" | "price_asc" | "popular";
  free_shipping_threshold: number;
};

export type CartLine = {
  product: Product;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type Cart = {
  session_id: string;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  total: number;
  free_shipping_threshold: number;
  amount_to_free_shipping: number;
};

export type Order = {
  id: string;
  session_id: string;
  items: { product_id: string; slug: string; name: string; qty: number; unit_price: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  created_at: string;
  meta: Record<string, unknown> | null;
};

export type Insight = {
  id: number;
  ts: string;
  agent: string;
  topic: string;
  text: string;
  evidence: unknown;
  confidence: number | null;
};

export type AgentAction = {
  id: number;
  ts: string;
  agent: string;
  tool: string;
  input: unknown;
  output: unknown;
  ok: number;
  run_id: string | null;
};

export type AgentRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  mode: string;
  summary: string | null;
  tool_calls: number;
  ok: number | null;
};

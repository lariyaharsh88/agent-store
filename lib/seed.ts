export const SEED_PRODUCTS = [
  { slug: "aurora-anc-headphones", name: "Aurora ANC Headphones", category: "Audio", price: 199, cost: 92, stock: 200, emoji: "🎧", hue: 262, tags: ["wireless", "noise-cancelling", "travel"], description: "Over-ear headphones with adaptive noise cancelling, 38-hour battery and multipoint Bluetooth. Folds flat for travel." },
  { slug: "pebble-true-wireless", name: "Pebble True Wireless Earbuds", category: "Audio", price: 89, cost: 31, stock: 600, emoji: "🫧", hue: 200, tags: ["wireless", "earbuds", "gym"], description: "Compact earbuds with a 6-hour charge, IPX5 sweat resistance and a wireless charging case." },
  { slug: "slab-bluetooth-speaker", name: "Slab Portable Speaker", category: "Audio", price: 129, cost: 54, stock: 175, emoji: "🔊", hue: 180, tags: ["speaker", "outdoor", "waterproof"], description: "Palm-sized speaker with surprising low end, IP67 rating and a 20-hour battery. Pair two for stereo." },
  { slug: "ember-desk-lamp", name: "Ember Desk Lamp", category: "Desk", price: 74, cost: 22, stock: 300, emoji: "💡", hue: 35, tags: ["lighting", "usb-c", "dimmable"], description: "Flicker-free LED lamp with five colour temperatures and a USB-C port for charging your phone." },
  { slug: "monolith-laptop-stand", name: "Monolith Laptop Stand", category: "Desk", price: 59, cost: 18, stock: 400, emoji: "💻", hue: 215, tags: ["ergonomic", "aluminium"], description: "Single-piece aluminium stand that lifts a laptop screen to eye level. Fits 11 to 17 inch laptops." },
  { slug: "keystone-mechanical-keyboard", name: "Keystone Mechanical Keyboard", category: "Desk", price: 149, cost: 70, stock: 125, emoji: "⌨️", hue: 330, tags: ["mechanical", "hot-swap", "wireless"], description: "75% layout, hot-swappable switches, gasket mount and tri-mode connectivity. Ships with tactile switches." },
  { slug: "glide-wireless-mouse", name: "Glide Wireless Mouse", category: "Desk", price: 49, cost: 15, stock: 500, emoji: "🖱️", hue: 160, tags: ["ergonomic", "wireless"], description: "Low-profile mouse with a silent click, 4000 DPI sensor and a three-month battery." },
  { slug: "tempo-smart-bottle", name: "Tempo Smart Bottle", category: "Fitness", price: 45, cost: 14, stock: 450, emoji: "🥤", hue: 190, tags: ["hydration", "insulated"], description: "Insulated steel bottle that glows to remind you to drink. Tracks intake through the companion app." },
  { slug: "stride-resistance-bands", name: "Stride Resistance Band Set", category: "Fitness", price: 29, cost: 7, stock: 1000, emoji: "🏋️", hue: 10, tags: ["home-gym", "travel"], description: "Five fabric bands from light to extra heavy, with a carry pouch and a printed workout card." },
  { slug: "halo-massage-gun", name: "Halo Massage Gun", category: "Fitness", price: 159, cost: 58, stock: 150, emoji: "🔫", hue: 290, tags: ["recovery", "quiet"], description: "Quiet percussion massager with four heads, five speeds and a two-week battery." },
  { slug: "nimbus-air-purifier", name: "Nimbus Air Purifier", category: "Home", price: 189, cost: 81, stock: 100, emoji: "🌬️", hue: 205, tags: ["hepa", "quiet", "bedroom"], description: "HEPA H13 purifier for rooms up to 40 square metres. Night mode runs under 24 decibels." },
  { slug: "brew-pour-over-kettle", name: "Brew Gooseneck Kettle", category: "Home", price: 79, cost: 28, stock: 225, emoji: "🫖", hue: 25, tags: ["coffee", "temperature-control"], description: "Variable temperature gooseneck kettle with a one-hour hold. Pours slowly enough for a proper bloom." },
  { slug: "loom-weighted-blanket", name: "Loom Weighted Blanket", category: "Home", price: 119, cost: 46, stock: 125, emoji: "🛌", hue: 250, tags: ["sleep", "cotton"], description: "Seven-kilogram glass-bead blanket in a breathable cotton cover. Machine washable." },
  { slug: "orbit-smart-plug-4pk", name: "Orbit Smart Plug (4 pack)", category: "Home", price: 39, cost: 12, stock: 750, emoji: "🔌", hue: 140, tags: ["smart-home", "energy"], description: "Wi-Fi plugs with energy monitoring and schedules. Works with the major voice assistants." },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  store_name: "Agent Store",
  hero_headline: "Gear that earns its place on your desk",
  hero_subheadline: "Audio, desk, fitness and home essentials, chosen for people who notice the details.",
  cta_label: "Add to cart",
  product_sort: "learned",
  free_shipping_threshold: "75",
};

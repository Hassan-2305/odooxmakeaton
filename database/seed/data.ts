// Seed data v1. Plain data only; apps/api/src/db/seed.ts inserts it.
// Passwords are documented in README.md ("Seed accounts"). Dev and demo use only.

export const SEED_PASSWORDS = {
  admin: "Admin@12345",
  staff: "Staff@12345",
  customer: "Customer@123",
} as const;

export const admin = { name: "Asha Admin", email: "admin@brightloop.in" };

export const staff = [
  { name: "Priya Sharma", email: "priya@brightloop.in" },
  { name: "Arjun Mehta", email: "arjun@brightloop.in" },
];

/** [company, city, state, GST state code]. Login emails are customer01..20@example.in. */
const COMPANIES: [string, string, string, string][] = [
  ["Acme Traders", "Bengaluru", "Karnataka", "29"],
  ["Bharat Foods", "Pune", "Maharashtra", "27"],
  ["Chai Point Cafe", "Bengaluru", "Karnataka", "29"],
  ["Deccan Textiles", "Hyderabad", "Telangana", "36"],
  ["Eastern Tea Co", "Kolkata", "West Bengal", "19"],
  ["Fresh Farm Organics", "Chennai", "Tamil Nadu", "33"],
  ["Ganga Logistics", "New Delhi", "Delhi", "07"],
  ["Himalaya Crafts", "Dehradun", "Uttarakhand", "05"],
  ["Indus Pharma", "Ahmedabad", "Gujarat", "24"],
  ["Jaipur Gems", "Jaipur", "Rajasthan", "08"],
  ["Kaveri Electricals", "Mysuru", "Karnataka", "29"],
  ["Lotus Interiors", "Mumbai", "Maharashtra", "27"],
  ["Malabar Spices", "Kochi", "Kerala", "32"],
  ["Narmada Steel", "Indore", "Madhya Pradesh", "23"],
  ["Orchid Hospitality", "Goa", "Goa", "30"],
  ["Pioneer Auto Parts", "Chennai", "Tamil Nadu", "33"],
  ["Quantum Edutech", "Noida", "Uttar Pradesh", "09"],
  ["Riverside Bakers", "Lucknow", "Uttar Pradesh", "09"],
  ["Saffron Studios", "Mumbai", "Maharashtra", "27"],
  ["Tanjore Silks", "Thanjavur", "Tamil Nadu", "33"],
];

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A GSTIN in the valid format: state code + PAN (5 letters, 4 digits, letter) + 1 + Z + check. */
function gstin(stateCode: string, i: number) {
  const pan = `AAB${LETTERS[i % LETTERS.length]}${LETTERS[(i * 7) % LETTERS.length]}${String(1000 + i * 37).slice(-4)}F`;
  return `${stateCode}${pan}1Z${(i % 9) + 1}`;
}

export const customers = COMPANIES.map(([name, city, state, code], i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    name,
    email: `customer${n}@example.in`,
    phone: `+91 98${String(45000000 + i * 1111).padStart(8, "0")}`,
    // Every fourth customer is unregistered for GST.
    gstin: i % 4 === 3 ? null : gstin(code, i),
    addressLine1: `${10 + i}, ${["MG Road", "Station Road", "Market Street", "Ring Road"][i % 4]}`,
    city,
    state,
    postalCode: String(400001 + i * 1013).slice(0, 6),
    country: "IN",
  };
});

export const taxes = [
  { name: "GST 18%", rateBps: 1800, inclusive: false, effectiveFrom: "2017-07-01" },
  { name: "GST 12% (inclusive)", rateBps: 1200, inclusive: true, effectiveFrom: "2017-07-01" },
];

/** Attribute values and their price extras in paise. */
export const attributes = [
  {
    name: "Brand",
    values: [
      { value: "Odoo", priceExtraPaise: 56_000 },
      { value: "Generic", priceExtraPaise: 0 },
    ],
  },
  {
    name: "Region",
    values: [
      { value: "Mumbai", priceExtraPaise: 0 },
      { value: "Singapore", priceExtraPaise: 25_000 },
    ],
  },
  {
    name: "Support Tier",
    values: [
      { value: "Standard", priceExtraPaise: 0 },
      { value: "Priority", priceExtraPaise: 30_000 },
    ],
  },
];

/** Variant price = basePricePaise + the price extras of its attribute values. */
export const products = [
  {
    name: "Brightloop ERP",
    description: "ERP licence, billed per seat.",
    sku: "ERP",
    basePricePaise: 249_900,
    variants: [
      { name: "Brightloop ERP – Odoo", sku: "ERP-ODOO", values: [["Brand", "Odoo"]] },
      { name: "Brightloop ERP – Generic", sku: "ERP-GEN", values: [["Brand", "Generic"]] },
    ],
  },
  {
    name: "Cloud Hosting",
    description: "Managed hosting for one instance.",
    sku: "HOST",
    basePricePaise: 149_900,
    variants: [
      { name: "Cloud Hosting – Mumbai", sku: "HOST-BOM", values: [["Region", "Mumbai"]] },
      { name: "Cloud Hosting – Singapore", sku: "HOST-SIN", values: [["Region", "Singapore"]] },
    ],
  },
  {
    name: "Support Plan",
    description: "Email and phone support.",
    sku: "SUP",
    basePricePaise: 49_900,
    variants: [
      { name: "Support Plan – Standard", sku: "SUP-STD", values: [["Support Tier", "Standard"]] },
      { name: "Support Plan – Priority", sku: "SUP-PRI", values: [["Support Tier", "Priority"]] },
    ],
  },
] as const;

export const plans = [
  {
    name: "Monthly",
    interval: "month",
    intervalCount: 1,
    minQuantity: 1,
    autoCloseOnEnd: false,
    closableEarly: true,
    pausable: true,
    renewable: true,
  },
  {
    name: "Quarterly",
    interval: "month",
    intervalCount: 3,
    minQuantity: 1,
    autoCloseOnEnd: false,
    closableEarly: true,
    pausable: false,
    renewable: true,
  },
  {
    name: "Annual",
    interval: "year",
    intervalCount: 1,
    minQuantity: 5,
    autoCloseOnEnd: false,
    closableEarly: false,
    pausable: false,
    renewable: true,
  },
  {
    name: "Weekly Trial",
    interval: "week",
    intervalCount: 1,
    minQuantity: 1,
    availableFrom: "2026-01-01",
    availableTo: "2026-12-31",
    autoCloseOnEnd: true,
    closableEarly: true,
    pausable: false,
    renewable: false,
  },
] as const;

export const quotationTemplates = [
  {
    name: "Starter ERP",
    validityDays: 15,
    plan: "Monthly",
    notes: "Five Generic ERP seats with standard support.",
    lines: [
      { variantSku: "ERP-GEN", quantity: 5 },
      { variantSku: "SUP-STD", quantity: 1 },
    ],
  },
  {
    name: "Enterprise Odoo Bundle",
    validityDays: 30,
    plan: "Annual",
    notes: "Odoo ERP for ten seats, Mumbai hosting and priority support.",
    lines: [
      { variantSku: "ERP-ODOO", quantity: 10 },
      { variantSku: "HOST-BOM", quantity: 1 },
      { variantSku: "SUP-PRI", quantity: 1 },
    ],
  },
] as const;

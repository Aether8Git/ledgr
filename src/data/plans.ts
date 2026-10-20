import type { LibraryPlan } from "../engine/quick";

/**
 * Starter plan library (used in demo mode; the same rows are seeded in Supabase).
 * Example plans carry made-up amounts and are flagged `example` — replace them.
 */
const all = (cents: number) => ({ office: cents, specialist: cents, urgent_care: cents, emergency: cents, outpatient: cents, imaging: cents, lab: cents, inpatient: cents });

export const SEED_PLANS: LibraryPlan[] = [
  { id: "seed-medicare-ab", payer: "Medicare", name: "Original Medicare (Part A & B)", kind: "medicare", medicare_parts: "AB", copays: {}, ed_waived_if_admitted: false, notes: "No copay at the desk. Deductible and 20% coinsurance are billed after Medicare processes the claim." },
  { id: "seed-medicare-a", payer: "Medicare", name: "Medicare Part A only", kind: "medicare", medicare_parts: "A", copays: {}, ed_waived_if_admitted: false, notes: "Hospital (inpatient) coverage only." },
  { id: "seed-medicare-b", payer: "Medicare", name: "Medicare Part B only", kind: "medicare", medicare_parts: "B", copays: {}, ed_waived_if_admitted: false, notes: "Outpatient/medical coverage only." },
  { id: "seed-medigap-g", payer: "Medicare Supplement", name: "Medigap Plan G", kind: "medigap", copays: all(0), ed_waived_if_admitted: false, notes: "Covers Medicare cost-sharing except the Part B deductible, which is billed after the claim — nothing at the desk." },
  { id: "seed-medigap-n", payer: "Medicare Supplement", name: "Medigap Plan N", kind: "medigap", copays: { ...all(0), office: 2000, specialist: 2000, emergency: 5000 }, ed_waived_if_admitted: true, notes: "Up to $20 for some office visits and up to $50 for ER visits that don't result in admission." },
  { id: "seed-ncmcd", payer: "NC Medicaid", name: "NC Medicaid Direct", kind: "medicaid", copays: {}, ed_waived_if_admitted: false, notes: "Copay amounts not loaded yet — fill in from current NC Medicaid guidance." },
  { id: "seed-ncmcd-php", payer: "NC Medicaid", name: "NC Medicaid Managed Care (PHP)", kind: "medicaid_mco", copays: {}, ed_waived_if_admitted: false, notes: "Copay amounts not loaded yet — fill in per plan." },
  { id: "seed-tricare", payer: "TRICARE", name: "TRICARE (fill in plan)", kind: "tricare", copays: {}, ed_waived_if_admitted: false, notes: "Copays vary by TRICARE plan and beneficiary category." },
  { id: "seed-tfl", payer: "TRICARE", name: "TRICARE For Life", kind: "tricare_for_life", copays: {}, ed_waived_if_admitted: false, notes: "Pays after Medicare and covers Medicare's cost-sharing for covered services." },
  { id: "seed-ihs", payer: "Indian Health Service", name: "IHS / tribal health program", kind: "ihs", copays: {}, ed_waived_if_admitted: false, notes: "Pays last, after Medicaid. Patients aren't charged." },
  { id: "seed-blacklung", payer: "U.S. Dept. of Labor", name: "Federal Black Lung Program", kind: "black_lung", copays: {}, ed_waived_if_admitted: false, notes: "Pays first only for the covered lung condition." },
  { id: "seed-va", payer: "VA", name: "VA Community Care (authorized)", kind: "va", copays: {}, ed_waived_if_admitted: false, notes: "Bill VA only with an authorization/referral number. Don't collect a copay." },
  { id: "seed-wc", payer: "Workers' compensation", name: "Workers' compensation (any carrier)", kind: "workers_comp", copays: {}, ed_waived_if_admitted: false, notes: "No copay. Get carrier, claim number, adjuster and date of injury." },
  { id: "seed-auto", payer: "Auto / liability", name: "Auto or liability insurance (any carrier)", kind: "auto", copays: {}, ed_waived_if_admitted: false, notes: "No copay. Get carrier, claim number and adjuster." },
  { id: "seed-ex-ppo", payer: "Example Health", name: "Example PPO — replace with a real plan", kind: "commercial", copays: { office: 3000, specialist: 6000, urgent_care: 7500, emergency: 30000, lab: 0 }, ed_waived_if_admitted: true, notes: "EXAMPLE amounts — edit or delete.", example: true },
  { id: "seed-ex-hmo", payer: "Example Health", name: "Example HMO — replace with a real plan", kind: "commercial", copays: { office: 2500, specialist: 5000, urgent_care: 5000, emergency: 25000, lab: 0 }, ed_waived_if_admitted: true, notes: "EXAMPLE amounts — edit or delete.", example: true },
  { id: "seed-ex-ma", payer: "Example Advantage", name: "Example Medicare Advantage HMO — replace", kind: "medicare_advantage", copays: { office: 0, specialist: 4000, urgent_care: 4500, emergency: 10000, lab: 0 }, ed_waived_if_admitted: true, notes: "EXAMPLE amounts — edit or delete.", example: true },
  { id: "seed-ex-silver", payer: "Example Marketplace", name: "Example Silver plan — replace", kind: "marketplace", copays: { office: 4000, specialist: 8000, urgent_care: 7500 }, ed_waived_if_admitted: false, notes: "EXAMPLE amounts — edit or delete.", example: true },
];

/** Carriers offered when adding a plan at the desk. Free text is always allowed too. */
export const CARRIERS = [
  "Aetna", "Ambetter", "Anthem", "Blue Cross Blue Shield", "Blue Cross NC", "Cigna", "Humana", "Medcost", "Oscar",
  "UnitedHealthcare", "UMR", "Wellcare", "Aetna Medicare", "Humana Medicare", "UnitedHealthcare Medicare",
  "AmeriHealth Caritas NC", "Carolina Complete Health", "Healthy Blue", "UnitedHealthcare Community Plan", "WellCare of NC",
  "TRICARE", "VA Community Care",
];

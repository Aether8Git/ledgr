import type { BasisPoints, CalcStep, Cents } from "./types";

/**
 * Patient-responsibility arithmetic.
 *
 * - All inputs/outputs are integer cents.
 * - Coinsurance is carried in exact "cent·basis-point" units and rounded ONCE,
 *   at the final step (half-up), so intermediate rounding never compounds.
 * - Every function returns the steps it took so the decision card can show them.
 */

export function formatCents(c: Cents | null | undefined): string {
  if (c === null || c === undefined) return "—";
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatBp(bp: BasisPoints | null | undefined): string {
  if (bp === null || bp === undefined) return "—";
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
}

function assertCents(name: string, v: number) {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer number of cents (got ${v})`);
}

export interface EstimateInput {
  allowedCents: Cents;
  deductibleRemainingCents: Cents;
  coinsuranceBp: BasisPoints;
  oopRemainingCents?: Cents | null;
  source: string;
}

/**
 * Deductible-then-coinsurance estimate against an ALLOWED amount (never billed charges).
 */
export function estimateDeductibleCoinsurance(i: EstimateInput): { totalCents: Cents; steps: CalcStep[] } {
  assertCents("allowedCents", i.allowedCents);
  assertCents("deductibleRemainingCents", i.deductibleRemainingCents);
  if (!Number.isInteger(i.coinsuranceBp) || i.coinsuranceBp < 0 || i.coinsuranceBp > 10000) {
    throw new Error("coinsuranceBp must be an integer 0–10000");
  }
  const steps: CalcStep[] = [];
  steps.push({ label: "Allowed amount (facility estimate — not billed charges)", amountCents: i.allowedCents, source: i.source });

  const deductiblePortion = Math.min(i.allowedCents, i.deductibleRemainingCents);
  steps.push({ label: "Applied to remaining deductible", amountCents: deductiblePortion, note: `min(allowed, deductible remaining ${formatCents(i.deductibleRemainingCents)})` });

  const remainder = i.allowedCents - deductiblePortion;
  const coinsExact = remainder * i.coinsuranceBp; // cents × bp, exact integer
  steps.push({ label: `Coinsurance ${formatBp(i.coinsuranceBp)} of remaining ${formatCents(remainder)}`, amountCents: null, note: "held unrounded until the final step" });

  let total = Math.floor((deductiblePortion * 10000 + coinsExact + 5000) / 10000); // single half-up rounding
  steps.push({ label: "Subtotal (rounded once, half-up)", amountCents: total });

  if (i.oopRemainingCents !== null && i.oopRemainingCents !== undefined) {
    assertCents("oopRemainingCents", i.oopRemainingCents);
    if (total > i.oopRemainingCents) {
      total = i.oopRemainingCents;
      steps.push({ label: "Capped at remaining out-of-pocket maximum", amountCents: total });
    }
  }
  return { totalCents: total, steps };
}

/** Copay capped at remaining OOP, when OOP remaining is verified. */
export function applyCopay(copayCents: Cents, oopRemainingCents?: Cents | null): { totalCents: Cents; steps: CalcStep[] } {
  assertCents("copayCents", copayCents);
  const steps: CalcStep[] = [{ label: "Verified copay for this service", amountCents: copayCents }];
  let total = copayCents;
  if (oopRemainingCents !== null && oopRemainingCents !== undefined) {
    assertCents("oopRemainingCents", oopRemainingCents);
    if (total > oopRemainingCents) {
      total = oopRemainingCents;
      steps.push({ label: "Capped at remaining out-of-pocket maximum", amountCents: total });
    }
  }
  return { totalCents: total, steps };
}

/** Subtract amounts already collected for this encounter. Never returns negative. */
export function creditPreviouslyCollected(amountCents: Cents, previouslyCollectedCents: Cents): { dueCents: Cents; creditCents: Cents; steps: CalcStep[] } {
  assertCents("amountCents", amountCents);
  assertCents("previouslyCollectedCents", previouslyCollectedCents);
  const steps: CalcStep[] = [];
  if (previouslyCollectedCents > 0) steps.push({ label: "Less: already collected for this encounter", amountCents: -previouslyCollectedCents });
  const diff = amountCents - previouslyCollectedCents;
  const due = Math.max(0, diff);
  steps.push({ label: "Amount to request now", amountCents: due });
  return { dueCents: due, creditCents: Math.max(0, -diff), steps };
}

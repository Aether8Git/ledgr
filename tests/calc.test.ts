import { describe, expect, it } from "vitest";
import { applyCopay, creditPreviouslyCollected, estimateDeductibleCoinsurance, formatCents } from "../src/engine/calc";

describe("calculation module", () => {
  it("formats cents", () => {
    expect(formatCents(4500)).toBe("$45.00");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(null)).toBe("—");
  });

  it("applies deductible before coinsurance, on the allowed amount", () => {
    const r = estimateDeductibleCoinsurance({ allowedCents: 80000, deductibleRemainingCents: 50000, coinsuranceBp: 2000, source: "t" });
    expect(r.totalCents).toBe(56000);
  });

  it("deductible larger than allowed amount → patient owes allowed only", () => {
    const r = estimateDeductibleCoinsurance({ allowedCents: 30000, deductibleRemainingCents: 150000, coinsuranceBp: 2000, source: "t" });
    expect(r.totalCents).toBe(30000);
  });

  it("rounds once, at the end (half-up)", () => {
    // 20% of $0.03 = 0.6 cents → rounds to 1 cent only at the final step
    const r = estimateDeductibleCoinsurance({ allowedCents: 3, deductibleRemainingCents: 0, coinsuranceBp: 2000, source: "t" });
    expect(r.totalCents).toBe(1);
    // 12.5% of $1.00 = 12.5 cents → 13
    expect(estimateDeductibleCoinsurance({ allowedCents: 100, deductibleRemainingCents: 0, coinsuranceBp: 1250, source: "t" }).totalCents).toBe(13);
  });

  it("caps at remaining OOP", () => {
    expect(estimateDeductibleCoinsurance({ allowedCents: 500000, deductibleRemainingCents: 100000, coinsuranceBp: 3000, oopRemainingCents: 150000, source: "t" }).totalCents).toBe(150000);
    expect(applyCopay(4500, 2000).totalCents).toBe(2000);
  });

  it("rejects non-integer / negative money", () => {
    expect(() => applyCopay(45.5)).toThrow();
    expect(() => applyCopay(-1)).toThrow();
    expect(() => estimateDeductibleCoinsurance({ allowedCents: 100, deductibleRemainingCents: 0, coinsuranceBp: 12000, source: "t" })).toThrow();
  });

  it("credits previously collected amounts and never goes negative", () => {
    expect(creditPreviouslyCollected(4500, 2000).dueCents).toBe(2500);
    const over = creditPreviouslyCollected(4500, 6000);
    expect(over.dueCents).toBe(0);
    expect(over.creditCents).toBe(1500);
  });
});

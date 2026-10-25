import { describe, expect, it } from "vitest";
import { cents, decimal, money } from "./money.js";
import { hash } from "./hash.js";
describe("Money", () => {
  it("works with exact integer cents", () => {
    expect(decimal(cents("0.10") + cents("0.20"))).toBe("0.30");
  });
  it("rejects floats and invalid formats", () => {
    for (const invalid of ["1.001", "-1.00", "1e3", "NaN", "Infinity", "1"])
      expect(() => cents(invalid)).toThrow();
  });
  it("rejects invalid currency", () => {
    expect(() => money({ amount: "10.00", currency: "brl" })).toThrow();
  });
  it("canonicalizes object key order", () => {
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
  });
});

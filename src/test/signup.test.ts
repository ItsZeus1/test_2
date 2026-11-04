import { describe, expect, it } from "vitest";

import { SY_MOBILE, ageFromBirthDate, formatSyMobile } from "@/lib/validation";

describe("Syrian mobile number", () => {
  it("formats typing as 09XX-XXX-XXX", () => {
    expect(formatSyMobile("0912345678")).toBe("0912-345-678");
    expect(formatSyMobile("0912 34")).toBe("0912-34");
  });

  it("accepts only 09 + 8 digits", () => {
    expect(SY_MOBILE.test("0912-345-678")).toBe(true);
    expect(SY_MOBILE.test("0912345678")).toBe(true);
    expect(SY_MOBILE.test("0812-345-678")).toBe(false);
    expect(SY_MOBILE.test("0912-345-67")).toBe(false);
  });
});

describe("18+ age gate", () => {
  const today = new Date(2026, 10, 2); // 2 Nov 2026

  it("counts whole years", () => {
    expect(ageFromBirthDate("2008-11-02", today)).toBe(18);
    expect(ageFromBirthDate("2008-11-03", today)).toBe(17);
  });

  it("rejects invalid or future dates", () => {
    expect(ageFromBirthDate("2030-01-01", today)).toBeNull();
    expect(ageFromBirthDate("not-a-date", today)).toBeNull();
  });
});

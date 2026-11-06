import { describe, expect, it } from "vitest";

import { normalizeState } from "@/lib/store/data";
import { adminRoleSchema } from "@/lib/validation";

describe("Admin role is locked to majd@elmadani.com", () => {
  it("does not allow assigning ADMIN from the role switcher", () => {
    expect(adminRoleSchema.safeParse({ userId: "u1", role: "ADMIN" }).success).toBe(false);
    expect(adminRoleSchema.safeParse({ userId: "u1", role: "VIP" }).success).toBe(true);
  });

  it("demotes any other saved ADMIN and keeps the owner as ADMIN", () => {
    const state = normalizeState({
      users: [
        { id: "a", email: "someone@else.com", role: "ADMIN" },
        { id: "b", email: "majd@elmadani.com", role: "NORMAL" },
      ],
      services: [],
    });
    expect(state?.users[0]?.role).toBe("NORMAL");
    expect(state?.users[1]?.role).toBe("ADMIN");
  });
});

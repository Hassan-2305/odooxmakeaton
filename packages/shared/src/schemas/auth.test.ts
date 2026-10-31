import { describe, expect, it } from "vitest";
import { passwordSchema, registerSchema, resetPasswordSchema } from "./auth.js";

function errors(value: string) {
  const result = passwordSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("passwordSchema", () => {
  it("accepts a password that meets every rule", () => {
    expect(passwordSchema.safeParse("Str0ng!pass").success).toBe(true);
  });

  it("accepts exactly 9 characters (more than 8)", () => {
    expect(passwordSchema.safeParse("Abcdefg!h").success).toBe(true);
  });

  it("rejects exactly 8 characters", () => {
    expect(errors("Abcdef!h")).toEqual(["Password must be more than 8 characters"]);
  });

  it("requires an uppercase letter", () => {
    expect(errors("lowercase!only")).toEqual(["Password must contain an uppercase letter"]);
  });

  it("requires a lowercase letter", () => {
    expect(errors("UPPERCASE!ONLY")).toEqual(["Password must contain a lowercase letter"]);
  });

  it("requires a special character", () => {
    expect(errors("NoSpecials123")).toEqual(["Password must contain a special character"]);
  });

  it("counts spaces and unicode symbols as special characters", () => {
    expect(passwordSchema.safeParse("Has space1A").success).toBe(true);
    expect(passwordSchema.safeParse("Rupee₹sign").success).toBe(true);
  });

  it("does not count digits as special characters", () => {
    expect(errors("Abcdefgh123")).toEqual(["Password must contain a special character"]);
  });

  it("reports every broken rule at once", () => {
    expect(errors("abc")).toEqual([
      "Password must be more than 8 characters",
      "Password must contain an uppercase letter",
      "Password must contain a special character",
    ]);
  });

  it("rejects passwords over 128 characters", () => {
    expect(errors(`Aa!${"x".repeat(126)}`)).toEqual(["Password must be at most 128 characters"]);
  });
});

describe("registerSchema / resetPasswordSchema", () => {
  const register = {
    name: "Asha",
    email: "  Asha@Example.IN ",
    password: "Str0ng!pass",
    confirmPassword: "Str0ng!pass",
  };

  it("normalises the email", () => {
    expect(registerSchema.parse(register).email).toBe("asha@example.in");
  });

  it("rejects a mismatched confirmation on confirmPassword", () => {
    const result = registerSchema.safeParse({ ...register, confirmPassword: "Other!pass1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("applies the password rule on reset", () => {
    const result = resetPasswordSchema.safeParse({
      token: "t",
      password: "weak",
      confirmPassword: "weak",
    });
    expect(result.success).toBe(false);
  });
});

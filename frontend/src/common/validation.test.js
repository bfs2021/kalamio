import { describe, it, expect } from "vitest";
import { emailRegex, passwordRegex, isValidPassword } from "./validation";

describe("emailRegex", () => {
  it.each([
    "jo+news@gmail.com",
    "jo@site.info",
    "jo@kalamio.studio",
    "o'brien@example.ie",
  ])("accepts valid address %s", (email) => {
    expect(emailRegex.test(email)).toBe(true);
  });

  it.each(["jo@gmail", "jo gmail.com", "jo@@gmail.com", "@gmail.com", ""])(
    "rejects obvious typo %s",
    (email) => {
      expect(emailRegex.test(email)).toBe(false);
    }
  );
});

describe("isValidPassword", () => {
  it("accepts a 40-character password from a password manager", () => {
    expect(isValidPassword(`Aa1${"x".repeat(37)}`)).toBe(true);
  });

  it("accepts a password exactly at the bcrypt 72-byte limit", () => {
    const password = `Aa1${"é".repeat(34)}b`; // 3 + 68 + 1 = 72 bytes
    expect(isValidPassword(password)).toBe(true);
  });

  it("rejects a password above the bcrypt 72-byte limit", () => {
    expect(isValidPassword(`Aa1${"é".repeat(34)}bb`)).toBe(false);
  });

  it("counts an emoji as one character, not two UTF-16 units", () => {
    const password = `Aa1${"x".repeat(60)}😀`; // 64 code points, 67 bytes
    expect([...password].length).toBe(64);
    expect(isValidPassword(password)).toBe(true);
  });

  it("rejects 65 code points even when an emoji is present", () => {
    expect(passwordRegex.test(`Aa1${"x".repeat(61)}😀`)).toBe(false);
  });

  it("keeps the character rules", () => {
    expect(passwordRegex.test("Aabcdef")).toBe(false);
    expect(isValidPassword("Aabcdef")).toBe(false);
    expect(isValidPassword("a1bcdef")).toBe(false);
    expect(isValidPassword("Aa1")).toBe(false);
  });
});

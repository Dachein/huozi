import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";

// Iteration count is high (600k) so each hash takes ~80-150 ms on a
// laptop. Keep this suite tight — a few targeted assertions are enough
// to lock the algorithm.

describe("password hashing", () => {
  it("produces a PHC-style string with the expected algo and iteration count", async () => {
    const phc = await hashPassword("hunter2");
    expect(phc).toMatch(/^\$pbkdf2-sha256\$i=600000\$[\w-]+\$[\w-]+$/);
  });

  it("uses a fresh salt — same password hashes differently each call", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("verifies a freshly hashed password", async () => {
    const phc = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", phc)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const phc = await hashPassword("correct");
    expect(await verifyPassword("wrong", phc)).toBe(false);
  });

  it("rejects an empty password attempt against any hash", async () => {
    const phc = await hashPassword("real");
    expect(await verifyPassword("", phc)).toBe(false);
  });

  it("rejects malformed PHC strings without throwing", async () => {
    expect(await verifyPassword("p", "")).toBe(false);
    expect(await verifyPassword("p", "not-a-phc")).toBe(false);
    expect(await verifyPassword("p", "$bcrypt$i=10$abc$def")).toBe(false);
    expect(await verifyPassword("p", "$pbkdf2-sha256$i=abc$abc$def")).toBe(false);
    expect(await verifyPassword("p", "$pbkdf2-sha256$i=10$!!!$!!!")).toBe(false);
  });

  it("hashPassword rejects empty input", async () => {
    await expect(hashPassword("")).rejects.toThrow(/non-empty/);
  });

  it("verifies unicode passwords correctly", async () => {
    const phc = await hashPassword("活字 · 你好世界");
    expect(await verifyPassword("活字 · 你好世界", phc)).toBe(true);
    expect(await verifyPassword("活字 · 你好", phc)).toBe(false);
  });
});

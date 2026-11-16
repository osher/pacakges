import { describe, it, expect } from "bun:test";

describe("math", () => {
  describe("add", () => {
    it("adds positives", () => expect(1 + 1).toBe(2));
    it("adds negatives", () => expect(-1 + -1).toBe(-3));
    it("is slow", () => Bun.sleep(100));
  });
  describe("mul", () => {
    it("multiplies", () => {
      console.log("a log line from mul");
      expect(2 * 3).toBe(6);
    });
    it.skip("is skipped", () => {});
    it.todo("is todo");
  });
});

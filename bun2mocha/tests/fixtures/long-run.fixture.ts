import { describe, it } from "bun:test";

// enough tests for bun to recap the skipped, todo and failed ones before its summary
describe("long run", () => {
  describe("when a test fails", () => {
    it("fails", () => {
      throw new Error("boom");
    });
    it("times out", () => Bun.sleep(50), 10);
    it.skip("is skipped", () => {});
    it.todo("is todo");
  });
  for (let i = 1; i <= 30; i++) it(`passes ${i}`, () => {});
});

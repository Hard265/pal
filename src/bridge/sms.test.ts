import { normalizeNumber } from "./sms";

describe("sms bridge", () => {
  describe("normalizeNumber", () => {
    it("should strip spaces, dashes, parentheses and dots", () => {
      expect(normalizeNumber("+1 (234) 567-89.01")).toBe("+12345678901");
    });

    it("should handle empty string", () => {
      expect(normalizeNumber("")).toBe("");
    });

    it("should keep leading plus sign", () => {
      expect(normalizeNumber("+123")).toBe("+123");
    });
  });
});

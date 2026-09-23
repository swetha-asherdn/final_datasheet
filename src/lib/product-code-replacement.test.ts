import { describe, expect, it } from "vitest";
import { replaceProductCodeTokens } from "@/lib/product-code-replacement";

describe("product code replacement safety", () => {
  it("replaces full product-code tokens without altering formulas or resistor values", () => {
    const result = replaceProductCodeTokens({
      text: "CW29150R-XX is used in the design, while VIN=12V and R12=1k and VOUT=5V.",
      find: "CW29150R",
      replaceWith: "VS-CW29150R",
      mode: "starts-with",
    });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("VS-CW29150R-XX is used in the design, while VIN=12V and R12=1k and VOUT=5V.");
    expect(result.warnings).toEqual([]);
  });

  it("skips unsafe partial matches and records a warning", () => {
    const result = replaceProductCodeTokens({
      text: "VIN=12V and 3.3V and VOUT=5V.",
      find: "V",
      replaceWith: "VP",
      mode: "starts-with",
    });

    expect(result.replacedCount).toBe(0);
    expect(result.text).toBe("VIN=12V and 3.3V and VOUT=5V.");
    expect(result.warnings.some((warning) => warning.includes("unsafe") || warning.includes("partial"))).toBe(true);
  });

  it("never reprocesses a Vellore replacement into VS-VS-VS recursion", () => {
    const result = replaceProductCodeTokens({
      text: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
      find: "CW29150R",
      replaceWith: "VS-CW29150R",
      mode: "starts-with",
    });

    expect(result.text).toBe("VS-CW29150R-XX / VS-CW29150R-ADJ / CW29151R-XX");
    expect(result.text).not.toContain("VS-VS-");
  });
});

import { describe, expect, it } from "vitest";
import { findProductCodeOccurrences, replaceProductCodeTokens } from "@/lib/product-code-replacement";

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

  it("skips 1-character search patterns as too short", () => {
    const result = replaceProductCodeTokens({
      text: "VIN=12V and 3.3V and VOUT=5V.",
      find: "V",
      replaceWith: "VP",
      mode: "starts-with",
    });

    expect(result.replacedCount).toBe(0);
    expect(result.text).toBe("VIN=12V and 3.3V and VOUT=5V.");
    expect(result.warnings.some((warning) => warning.includes("at least 2 characters"))).toBe(true);
  });

  it("successfully replaces manufacturer prefix CW across product codes in starts-with mode", () => {
    const result = replaceProductCodeTokens({
      text: "CW29150R-XX and CW29151R-XX are linear regulators.",
      find: "CW",
      replaceWith: "VS-CW",
      mode: "starts-with",
    });

    expect(result.replacedCount).toBe(2);
    expect(result.text).toBe("VS-CW29150R-XX and VS-CW29151R-XX are linear regulators.");
    expect(result.warnings).toEqual([]);
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

  it("correctly replaces exact match CW29150R-XX", () => {
    const result = replaceProductCodeTokens({
      text: "Part number CW29150R-XX is specified for high current.",
      find: "CW29150R-XX",
      replaceWith: "VS-CW29150R-XX",
      mode: "exact",
    });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("Part number VS-CW29150R-XX is specified for high current.");
  });

  it("starts-with replaces prefix cleanly without double hyphens", () => {
    const result = replaceProductCodeTokens({
      text: "CW29150R-XX, CW29150R-ADJ",
      find: "CW29150R",
      replaceWith: "VS-CW29150R",
      mode: "starts-with",
    });

    expect(result.replacedCount).toBe(2);
    expect(result.text).toBe("VS-CW29150R-XX, VS-CW29150R-ADJ");
    expect(result.text).not.toContain("--");
  });

  it("supports Cyrillic product codes like 2Д2142А-5", () => {
    const result = replaceProductCodeTokens({
      text: "Диод 2Д2142А-5 кремниевый диффузионный.",
      find: "2Д2142А-5",
      replaceWith: "VS-2142A-5",
      mode: "exact",
    });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("Диод VS-2142A-5 кремниевый диффузионный.");
  });

  it("findProductCodeOccurrences accurately identifies unreplaced vs already applied occurrences", () => {
    const textUnreplaced = "The CW29150R-XX is high current. Available in CW29150R-XX package.";
    const occUnreplaced = findProductCodeOccurrences({
      text: textUnreplaced,
      find: "CW29150R-XX",
      mode: "exact",
    });
    expect(occUnreplaced.unreplacedCount).toBe(2);
    expect(occUnreplaced.alreadyReplacedCount).toBe(0);

    const textApplied = "The VS-CW29150R-XX is high current. Available in VS-CW29150R-XX package.";
    const occApplied = findProductCodeOccurrences({
      text: textApplied,
      find: "CW29150R-XX",
      mode: "exact",
    });
    expect(occApplied.unreplacedCount).toBe(0);
    expect(occApplied.alreadyReplacedCount).toBe(2);
    expect(occApplied.alreadyReplacedTokens).toContain("VS-CW29150R-XX");

    const occCW = findProductCodeOccurrences({
      text: textApplied,
      find: "CW",
      mode: "starts-with",
    });
    expect(occCW.isUnsafe).toBe(false);
    expect(occCW.alreadyReplacedCount).toBe(2);

    const occTooShort = findProductCodeOccurrences({
      text: textApplied,
      find: "C",
      mode: "starts-with",
    });
    expect(occTooShort.isUnsafe).toBe(true);
  });
});

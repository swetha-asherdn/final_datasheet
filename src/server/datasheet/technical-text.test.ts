import { describe, expect, it } from "vitest";
import { normalizeTechnicalText } from "@/server/datasheet/technical-text";

describe("normalizeTechnicalText", () => {
  it("preserves normal English words while only converting micrometer units in unit contexts", () => {
    expect(normalizeTechnicalText("minimum")).toBe("minimum");
    expect(normalizeTechnicalText("maximum")).toBe("maximum");
    expect(normalizeTechnicalText("aluminum")).toBe("aluminum");
    expect(normalizeTechnicalText("200 um")).toBe("200 µm");
    expect(normalizeTechnicalText("200x200 um")).toBe("200×200 µm");
    expect(normalizeTechnicalText("(um)")).toBe("(µm)");
    expect(normalizeTechnicalText("um")).toBe("µm");
  });

  it("normalizes micro-unit spacing and corrupted micro glyphs conservatively", () => {
    expect(normalizeTechnicalText("10 Âµ F")).toBe("10µF");
    expect(normalizeTechnicalText("20 Âµ A")).toBe("20µA");
    expect(normalizeTechnicalText("0.1 Âµ F")).toBe("0.1µF");
    expect(normalizeTechnicalText("ï­A")).toBe("µA");
    expect(normalizeTechnicalText("ï­F")).toBe("µF");
    expect(normalizeTechnicalText("Î¼A")).toBe("µA");
    expect(normalizeTechnicalText("Î¼F")).toBe("µF");
  });

  it("normalizes delta, theta, and malformed micrometer patterns", () => {
    expect(normalizeTechnicalText("ï„VOUT")).toBe("ΔVOUT");
    expect(normalizeTechnicalText("ï„V OUT")).toBe("ΔVOUT");
    expect(normalizeTechnicalText("ï„T")).toBe("ΔT");
    expect(normalizeTechnicalText("ï„I")).toBe("ΔI");
    expect(normalizeTechnicalText("âˆ†V DROP")).toBe("ΔVDROP");
    expect(normalizeTechnicalText("ï± SA")).toBe("θSA");
    expect(normalizeTechnicalText("ï± JC")).toBe("θJC");
    expect(normalizeTechnicalText("ï± CS")).toBe("θCS");
    expect(normalizeTechnicalText("u20m0*xu2m00")).toBe("200×200 µm");
    expect(normalizeTechnicalText("u 20m0*xu2m00")).toBe("200×200 µm");
  });

  it("normalizes inequalities and variable spacing without damaging product codes", () => {
    expect(normalizeTechnicalText("VIN <= 20V")).toBe("VIN ≤ 20V");
    expect(normalizeTechnicalText("V OUT >= 2.5V")).toBe("VOUT ≥ 2.5V");
    expect(normalizeTechnicalText("TJ MAX <= 125°C")).toBe("TJ MAX ≤ 125°C");
    expect(normalizeTechnicalText("T J <= 125°C and θ JC >= 2°C/W")).toBe("TJ ≤ 125°C and θJC ≥ 2°C/W");
    expect(normalizeTechnicalText("CW29150R-XX / CW29150R-ADJ / CW29151R-XX")).toBe("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
  });

  it("keeps uncertain table text conservative while improving obvious unit formatting", () => {
    expect(normalizeTechnicalText("10mAI 1.5A")).toBe("10mA I 1.5A");
    expect(normalizeTechnicalText("V REF >= 1.25V")).toBe("VREF ≥ 1.25V");
    expect(normalizeTechnicalText("I ADJ <= 120uA")).toBe("IADJ ≤ 120µA");
  });
});

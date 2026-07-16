import { describe, expect, it } from "vitest";
import { normalizeTechnicalText } from "@/server/datasheet/technical-text";

describe("normalizeTechnicalText", () => {
  it("normalizes technical units and corrupted symbols conservatively", () => {
    expect(normalizeTechnicalText("ï­A")).toBe("µA");
    expect(normalizeTechnicalText("10uA")).toBe("10µA");
    expect(normalizeTechnicalText("47uF")).toBe("47µF");
    expect(normalizeTechnicalText("ï„V OUT")).toBe("ΔVOUT");
    expect(normalizeTechnicalText("ï± SA")).toBe("θSA");
    expect(normalizeTechnicalText("2Â°Ð¡")).toBe("2°C");
    expect(normalizeTechnicalText("200x200 um")).toBe("200×200 µm");
    expect(normalizeTechnicalText("u20m0*xu2m00")).toBe("200×200 µm");
  });

  it("normalizes inequalities and variable spacing without damaging product codes", () => {
    expect(normalizeTechnicalText("V IN <= 5V and I OUT >= 1A")).toBe("VIN ≤ 5V and IOUT ≥ 1A");
    expect(normalizeTechnicalText("T J <= 125°C and θ JC >= 2°C/W")).toBe("TJ ≤ 125°C and θJC ≥ 2°C/W");
    expect(normalizeTechnicalText("CW29150R-XX / CW29150R-ADJ / CW29151R-XX")).toBe("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
  });

  it("keeps uncertain table text conservative while improving obvious unit formatting", () => {
    expect(normalizeTechnicalText("10mAI 1.5A")).toBe("10mA I 1.5A");
    expect(normalizeTechnicalText("V REF >= 1.25V")).toBe("VREF ≥ 1.25V");
    expect(normalizeTechnicalText("I ADJ <= 120uA")).toBe("IADJ ≤ 120µA");
  });
});


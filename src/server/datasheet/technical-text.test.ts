import { describe, expect, it } from "vitest";
import { collectTextQualityWarnings, normalizeTechnicalText } from "@/server/datasheet/technical-text";

const MICRO = "\u00b5";
const DELTA = "\u0394";
const THETA = "\u03b8";
const LE = "\u2264";
const GE = "\u2265";
const DEG_C = "\u00b0C";
const TIMES = "\u00d7";

describe("normalizeTechnicalText", () => {
  it("preserves normal English words while only converting micrometer units in unit contexts", () => {
    expect(normalizeTechnicalText("minimum")).toBe("minimum");
    expect(normalizeTechnicalText("maximum")).toBe("maximum");
    expect(normalizeTechnicalText("aluminum")).toBe("aluminum");
    expect(normalizeTechnicalText("200 um")).toBe(`200 ${MICRO}m`);
    expect(normalizeTechnicalText("200x200 um")).toBe(`200${TIMES}200 ${MICRO}m`);
    expect(normalizeTechnicalText("(um)")).toBe(`(${MICRO}m)`);
    expect(normalizeTechnicalText("um")).toBe(`${MICRO}m`);
  });

  it("normalizes corrupted symbols and micro-unit spacing", () => {
    expect(normalizeTechnicalText("10 µ F")).toBe(`10${MICRO}F`);
    expect(normalizeTechnicalText("20 µ A")).toBe(`20${MICRO}A`);
    expect(normalizeTechnicalText("0.1 µ F")).toBe(`0.1${MICRO}F`);
    expect(normalizeTechnicalText("A")).toBe(`${MICRO}A`);
    expect(normalizeTechnicalText("F")).toBe(`${MICRO}F`);
    expect(normalizeTechnicalText("μA")).toBe(`${MICRO}A`);
    expect(normalizeTechnicalText("μF")).toBe(`${MICRO}F`);
    expect(normalizeTechnicalText("V OUT")).toBe(`${DELTA}VOUT`);
    expect(normalizeTechnicalText("∆V DROP")).toBe(`${DELTA}VDROP`);
    expect(normalizeTechnicalText(" SA")).toBe(`${THETA}SA`);
    expect(normalizeTechnicalText(" 125�C")).toBe(`${LE} 125${DEG_C}`);
  });

  it("joins split technical variables and preserves product codes", () => {
    expect(normalizeTechnicalText("V IN <= 20V")).toBe(`VIN ${LE} 20V`);
    expect(normalizeTechnicalText("V OUT >= 2.5V")).toBe(`VOUT ${GE} 2.5V`);
    expect(normalizeTechnicalText(`T J <= 125${DEG_C} and ${THETA} JC >= 2${DEG_C}/W`)).toBe(`TJ ${LE} 125${DEG_C} and ${THETA}JC ${GE} 2${DEG_C}/W`);
    expect(normalizeTechnicalText("I Q ( DROP )")).toBe("IQ(DROP)");
    expect(normalizeTechnicalText("V FL_H")).toBe("VFL_H");
    expect(normalizeTechnicalText("CW29150R-XX / CW29150R-ADJ / CW29151R-XX")).toBe("CW29150R-XX/CW29150R-ADJ/CW29151R-XX");
  });

  it("reconstructs obvious corrupted table conditions conservatively", () => {
    expect(normalizeTechnicalText("10mAI 1.5A")).toBe(`10mA ${LE} IOUT ${LE} 1.5A`);
    expect(normalizeTechnicalText("V =0V OUT")).toBe("VOUT = 0V");
    expect(normalizeTechnicalText("I ADJ <= 120uA")).toBe(`IADJ ${LE} 120${MICRO}A`);
    expect(normalizeTechnicalText("V REF >= 1.25V")).toBe(`VREF ${GE} 1.25V`);
    expect(normalizeTechnicalText("10mA<=I <= 1.5A")).toBe(`10mA ${LE} IOUT ${LE} 1.5A`);
    expect(normalizeTechnicalText("I =10mA")).toBe("IOUT = 10mA");
    expect(normalizeTechnicalText("V =V +5V IN OUT OUT")).toBe("VIN = VOUT + 5V");
    expect(normalizeTechnicalText("V =26V EN")).toBe("VEN = 26V");
    expect(normalizeTechnicalText("V =0.5V less than specified V I =10mA IN OUT, OUT")).toBe("VIN = 0.5V less than specified VOUT, IOUT = 10mA");
    expect(normalizeTechnicalText("ΔV /ΔT REF")).toBe(`${DELTA}VREF/${DELTA}T`);
    expect(normalizeTechnicalText("ΔI /ΔT ADJ")).toBe(`${DELTA}IADJ/${DELTA}T`);
  });
});

describe("collectTextQualityWarnings", () => {
  it("reports missing required headings, split variables, and note gaps", () => {
    const warnings = collectTextQualityWarnings({
      texts: ["V IN <= 20V", "Note 1", "Note 3"],
      headings: ["GENERAL DESCRIPTION", "ELECTRICAL CHARACTERISTICS"],
    });

    expect(warnings).toContain("Possible split variable: V IN");
    expect(warnings).toContain("Missing heading: ABSOLUTE MAXIMUM RATINGS");
    expect(warnings).toContain("Missing heading: RECOMMENDED OPERATING CONDITIONS");
    expect(warnings).toContain("Missing note: Note 2");
  });
});


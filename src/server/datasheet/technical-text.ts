export type DatasheetLayoutMode = "two-column" | "single-column";
export type DatasheetLayoutDensity = "comfortable" | "technical-dense";

const UNIT_SUFFIXES = ["A", "F", "V", "W", "H", "m", "s", "S"] as const;
const VARIABLE_JOIN_RULES = [
  { pattern: /\bV\s+IN\b/g, replacement: "VIN" },
  { pattern: /\bV\s+OUT\b/g, replacement: "VOUT" },
  { pattern: /\bI\s+OUT\b/g, replacement: "IOUT" },
  { pattern: /\bT\s+A\b/g, replacement: "TA" },
  { pattern: /\bT\s+J\b/g, replacement: "TJ" },
  { pattern: /\bP\s+D\b/g, replacement: "PD" },
  { pattern: /\bI\s+Q\b/g, replacement: "IQ" },
  { pattern: /\bV\s+REF\b/g, replacement: "VREF" },
  { pattern: /\bI\s+ADJ\b/g, replacement: "IADJ" },
  { pattern: /θ\s+SA/g, replacement: "θSA" },
  { pattern: /θ\s+JC/g, replacement: "θJC" },
  { pattern: /θ\s+CS/g, replacement: "θCS" },
  { pattern: /Δ\s+V\s+OUT/g, replacement: "ΔVOUT" },
] as const;
const TECHNICAL_VARIABLES = ["VIN", "VOUT", "IOUT", "TA", "TJ", "PD", "IQ", "VREF", "IADJ", "θSA", "θJC", "θCS", "ΔVOUT"] as const;
const SYMBOL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Ã‚Âµ|Âµ|Î¼|μ|ï­/g, "µ"],
  [/Ã‚Â°|Â°/g, "°"],
  [/ÃŽÂ©|â„¦/g, "Ω"],
  [/ÃŽÂ¸|Î¸|ï±/g, "θ"],
  [/âˆ†|∆|ï„/g, "Δ"],
  [/ï‚£/g, "<="],
  [/ï‚³/g, ">="],
  [/Â°Ð¡|°С|°Ð¡/g, "°C"],
  [/Ãƒâ€”|Ã—/g, "×"],
];

export function normalizeTechnicalText(input: string) {
  if (!input) return "";

  let text = input.replace(/\u00A0/g, " ");

  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\bohm\b/gi, "Ω")
    .replace(/u(\d{1,3})m(0*)\*xu?(\d{1,3})m(0*)/gi, (_match, left, leftZeros, right, rightZeros) => `${left}${leftZeros}×${right}${rightZeros} µm`)
    .replace(/(\d)\s*[xX*]\s*(\d)/g, "$1×$2")
    .replace(/(\d+×\d+)\s*(?:um|u\s*m|µ\s*m)\b/gi, "$1 µm")
    .replace(/(?<!×)(\d(?:[.,]\d+)?)\s*(?:um|u\s*m|µ\s*m)\b/gi, "$1 µm")
    .replace(/(\d(?:[.,]\d+)?)\s*°\s*C\b/g, "$1°C")
    .replace(/(\d(?:[.,]\d+)?)\s+(?=µm\b)/g, "$1 ");

  for (const suffix of UNIT_SUFFIXES) {
    const pattern = new RegExp(`(\\d(?:[.,]\\d+)?)\\s*u(?=${suffix}\\b)`, "g");
    text = text.replace(pattern, "$1µ");
  }

  text = text
    .replace(/(^|[^A-Z0-9-])u(?=(?:A|F|V|W|H|m|s|S)\b)/g, "$1µ")
    .replace(/(<=|>=)\s*(?=(?:[-+]?\d|[A-ZΔθ]))/g, (match) => (match.startsWith("<=") ? "≤ " : "≥ "));

  for (const rule of VARIABLE_JOIN_RULES) {
    text = text.replace(rule.pattern, rule.replacement);
  }

  const variablePattern = TECHNICAL_VARIABLES.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  text = text
    .replace(new RegExp(`\\b(${variablePattern})\\s*(<=|≤)\\s*(?=\\d)`, "g"), "$1 ≤ ")
    .replace(new RegExp(`\\b(${variablePattern})\\s*(>=|≥)\\s*(?=\\d)`, "g"), "$1 ≥ ")
    .replace(/(\d(?:[.,]\d+)?)\s*(<=|≤)\s*(\d(?:[.,]\d+)?)/g, "$1 ≤ $3")
    .replace(/(\d(?:[.,]\d+)?)\s*(>=|≥)\s*(\d(?:[.,]\d+)?)/g, "$1 ≥ $3")
    .replace(/Δ\s+VOUT/g, "ΔVOUT")
    .replace(/ΔV\s+OUT/g, "ΔVOUT")
    .replace(/(\d(?:[\d.,]*)(?:µ|m|n|p)?A)([A-Z]\b)/g, "$1 $2")
    .replace(/\b(µ|m|n|p)?A\s+([A-Z])\b/g, "$1A $2")
    .replace(/µmm\b/g, "µm");

  return text.replace(/\s{2,}/g, " ").trim();
}

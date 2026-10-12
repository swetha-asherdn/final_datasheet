export type DatasheetLayoutMode = "two-column" | "single-column";
export type DatasheetLayoutDensity = "comfortable" | "technical-dense";

const REQUIRED_TABLE_HEADINGS = [
  "ABSOLUTE MAXIMUM RATINGS",
  "RECOMMENDED OPERATING CONDITIONS",
  "ELECTRICAL CHARACTERISTICS",
] as const;

const CANONICAL_SECTION_ORDER = [
  "GENERAL DESCRIPTION",
  "PIN CONFIGURATION",
  "PINOUT",
  "FEATURES",
  "TYPICAL APPLICATION",
  "APPLICATIONS",
  "ABSOLUTE MAXIMUM RATINGS",
  "RECOMMENDED OPERATING CONDITIONS",
  "ELECTRICAL CHARACTERISTICS",
  "APPLICATION INFORMATION",
  "THERMAL DESIGN",
  "CAPACITOR REQUIREMENTS",
  "MINIMUM LOAD CURRENT",
  "ADJUSTABLE REGULATOR DESIGN",
  "ERROR FLAG",
  "ENABLE INPUT",
  "BLOCK DIAGRAM",
  "PAD LOCATION AND COORDINATES",
  "BONDING DIAGRAM",
  "ASSEMBLY CHARACTERISTICS",
  "ADDITIONAL INFORMATION",
] as const;

const SYMBOL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/µ|μ|�|Âµ|Î¼|/g, "\u00b5"],
  [/∆||âˆ� |\uF044/g, "\u0394"],
  [/|θ|Θ|Î¸|Î˜|\uF071/g, "\u03b8"],
  [/≤||â‰¤/g, "\u2264"],
  [/≥||â‰¥/g, "\u2265"],
  [/°C|℃|Â°C|\u00b0\u0421/g, "\u00b0C"],
  [/� /g, " "],
];

const VARIABLE_JOIN_RULES: Array<[RegExp, string]> = [
  [/\bV\s+IN\b/g, "VIN"],
  [/\bV\s+OUT\b/g, "VOUT"],
  [/\bI\s+OUT\b/g, "IOUT"],
  [/\bV\s+REF\b/g, "VREF"],
  [/\bI\s+ADJ\b/g, "IADJ"],
  [/\bI\s+Q\b/g, "IQ"],
  [/\bT\s+J\b/g, "TJ"],
  [/\bT\s+A\b/g, "TA"],
  [/\bP\s+D\b/g, "PD"],
  [/\bV\s+EN\b/g, "VEN"],
  [/\bI\s+EN\b/g, "IEN"],
  [/\bV\s+FL\s*_?\s*H\b/g, "VFL_H"],
  [/\bV\s+FL\s*_?\s*L\b/g, "VFL_L"],
  [/\bI\s+OUT\s*_?\s*MAX\b/g, "IOUT_MAX"],
  [/\bI\s+Q\s*\(\s*DROP\s*\)/g, "IQ(DROP)"],
  [/\bV\s+EN\s*-\s*TH\s*-\s*([HL])\b/g, "VEN-TH-$1"],
  [/\bV\s+OUT\s*-\s*TH\s*-\s*([HL])\b/g, "VOUT-TH-$1"],
  [/\u0394\s+V\s+REF\s*\/\s*\u0394\s*T\b/g, "\u0394VREF/\u0394T"],
  [/\u0394\s+I\s+ADJ\s*\/\s*\u0394\s*T\b/g, "\u0394IADJ/\u0394T"],
  [/\u0394\s+V\s+OUT\b/g, "\u0394VOUT"],
  [/\u0394V\s+OUT\b/g, "\u0394VOUT"],
  [/\u0394\s+V\s+DROP\b/g, "\u0394VDROP"],
  [/\u0394V\s+DROP\b/g, "\u0394VDROP"],
  [/\u0394\s+I\b/g, "\u0394I"],
  [/\u0394\s+T\b/g, "\u0394T"],
  [/\u03b8\s+SA\b/g, "\u03b8SA"],
  [/\u03b8\s+JC\b/g, "\u03b8JC"],
  [/\u03b8\s+CS\b/g, "\u03b8CS"],
];

const SPLIT_VARIABLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bV\s+IN\b/g, "Possible split variable: V IN"],
  [/\bV\s+OUT\b/g, "Possible split variable: V OUT"],
  [/\bI\s+OUT\b/g, "Possible split variable: I OUT"],
  [/\bV\s+REF\b/g, "Possible split variable: V REF"],
  [/\bI\s+ADJ\b/g, "Possible split variable: I ADJ"],
  [/\bI\s+EN\b/g, "Possible split variable: I EN"],
  [/\bV\s+EN\b/g, "Possible split variable: V EN"],
  [/\bT\s+J\b/g, "Possible split variable: T J"],
  [/\bT\s+A\b/g, "Possible split variable: T A"],
];

const UNRESOLVED_SYMBOL_PATTERNS: Array<[RegExp, string]> = [
  [/[�����][^\s]{0,4}/g, "Possible unresolved mojibake symbol"],
  [/\?\?\?+/g, "Possible unresolved symbol sequence"],
];

const CONDITION_CORRUPTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d+(?:\.\d+)?(?:m|\u00b5)?A\s*I\s*\d+(?:\.\d+)?A\b/g, "Possible table condition corruption"],
  [/\bV\s*=\s*0(?:\.\d+)?V\s*(?:OUT|IN|EN|REF)\b/g, "Possible table condition corruption"],
];

const UNIT_SUFFIXES = ["A", "F", "V", "W", "H", "m", "s", "S"] as const;

export function normalizeTechnicalText(input: string) {
  if (!input) return "";

  let text = input.replace(/\u00a0/g, " ")
    .replaceAll("\uF044", "\u0394")
    .replaceAll("\uF071", "\u03b8")
    .replaceAll("", "\u0394")
    .replaceAll("", "\u03b8")
    .replaceAll("", "\u00b5")
    .replaceAll("", "\u2264")
    .replaceAll("", "\u2265")
    .replaceAll("°С", "\u00b0C")
    .replaceAll("\u00b0\u0421", "\u00b0C")
    .replaceAll("°C", "\u00b0C");
  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\bohm\b/gi, "\u03a9")
    .replace(/\bu?\s*(\d{1,3})\s*m\s*(0*)\s*[*xX\u00d7]+\s*u?\s*(\d{1,3})\s*m\s*(0*)\b/gi, (_match, left, leftZeros, right, rightZeros) => `${left}${leftZeros}\u00d7${right}${rightZeros} \u00b5m`)
    .replace(/(\d)\s*[*xX\u00d7]+\s*(\d)/g, "$1\u00d7$2")
    .replace(/(^|[\s[(,;:])u\s*m(?=$|[\s\])',;:.])/gi, "$1\u00b5m")
    .replace(/\(\s*u\s*m\s*\)/gi, "(\u00b5m)")
    .replace(/(\d(?:[.,]\d+)?)\s*u\s*m\b/gi, "$1 \u00b5m")
    .replace(/(\d(?:[.,]\d+)?)\s*\u00b5\s*m\b/g, "$1 \u00b5m")
    .replace(/(\d(?:[.,]\d+)?)\s*\u00b5\s*([AFVWHSs])\b/g, "$1\u00b5$2")
    .replace(/(\d(?:[.,]\d+)?)\s*u\s*([AFVWHSs])\b/g, "$1\u00b5$2")
    .replace(/(^|[\s[(,;:])u(?=(?:A|F|V|W|H|m|s|S)\b)/g, "$1\u00b5")
    .replace(/(\d(?:[.,]\d+)?)\s*\u00b0\s*C\b/g, "$1\u00b0C")
    .replace(/\u00b5C\b/g, "\u00b0C")
    .replace(/(\d(?:[.,]\d+)?)\s+\u03a9\b/g, "$1\u03a9")
    .replace(/(\d(?:[.,]\d+)?)\s+([AFVWHSs])\b/g, "$1$2");

  for (const suffix of UNIT_SUFFIXES) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])u(?=${suffix}\\b)`, "g");
    text = text.replace(pattern, `$1\u00b5`);
  }

  for (const [pattern, replacement] of VARIABLE_JOIN_RULES) {
    text = text.replace(pattern, replacement);
  }

  text = reconstructConditionText(text);

  text = text
    .replace(/(<=|=<)/g, "\u2264")
    .replace(/(>=|=>)/g, "\u2265")
    .replace(/\b([A-Z\u0394\u03b8][A-Z0-9_()/-]*)\s*([\u2264\u2265])\s*(?=[-+]?\d)/g, "$1 $2 ")
    .replace(/(\d(?:[.,]\d+)?)\s*([\u2264\u2265])\s*(\d(?:[.,]\d+)?)/g, "$1 $2 $3")
    .replace(/IQ\s+\(\s*DROP\s*\)/g, "IQ(DROP)")
    .replace(/\s+\/\s+/g, "/")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text;
}

export function collectTextQualityWarnings(params: { texts: string[]; headings?: string[] }) {
  const warnings = new Set<string>();
  const joined = params.texts.join("\n");

  for (const [pattern, warning] of UNRESOLVED_SYMBOL_PATTERNS) {
    if (pattern.test(joined)) warnings.add(warning);
  }
  for (const [pattern, warning] of SPLIT_VARIABLE_PATTERNS) {
    if (pattern.test(joined)) warnings.add(warning);
  }
  for (const [pattern, warning] of CONDITION_CORRUPTION_PATTERNS) {
    if (pattern.test(joined)) warnings.add(warning);
  }

  const headings = params.headings ?? [];
  for (const heading of REQUIRED_TABLE_HEADINGS) {
    if (!headings.includes(heading)) warnings.add(`Missing heading: ${heading}`);
  }

  const orderedHeadings = headings.filter((heading) =>
    CANONICAL_SECTION_ORDER.includes(heading as (typeof CANONICAL_SECTION_ORDER)[number]),
  );
  for (let index = 0; index < orderedHeadings.length - 1; index += 1) {
    const current = orderedHeadings[index];
    const next = orderedHeadings[index + 1];
    if (canonicalSectionIndex(current) > canonicalSectionIndex(next)) {
      warnings.add(`Section order anomaly: ${current} before ${next}`);
    }
  }

  const noteMatches = Array.from(joined.matchAll(/\bNote\s*([1-9])\b/gi)).map((match) => Number(match[1]));
  if (noteMatches.length > 0) {
    const maxNote = Math.max(...noteMatches);
    for (let value = 1; value <= maxNote; value += 1) {
      if (!noteMatches.includes(value)) warnings.add(`Missing note: Note ${value}`);
    }
  }

  return Array.from(warnings);
}

function reconstructConditionText(text: string) {
  return text
    .replace(/\b(\d+(?:\.\d+)?(?:m|\u00b5)?A)\s*(?:[\u2264<]=?)?\s*I\s*(?:[\u2264<]=?)?\s*(\d+(?:\.\d+)?A)\b/g, `$1 \u2264 IOUT \u2264 $2`)
    .replace(/\bV\s*=\s*(0(?:\.\d+)?V)\s+less than specified\s+V\s*I\s*=\s*(\d+(?:\.\d+)?(?:m|\u00b5)?A)\s*IN\s*OUT,?\s*OUT\b/gi, (_match, delta, current) => `VIN = ${delta} less than specified VOUT, IOUT = ${current}`)
    .replace(/\bI\s*=\s*(\d+(?:\.\d+)?(?:m|\u00b5)?A)\s*OUT\b/g, "IOUT = $1")
    .replace(/\bI\s*=\s*(\d+(?:\.\d+)?(?:m|\u00b5)?A)\b/g, "IOUT = $1")
    .replace(/\bV\s*=\s*(0(?:\.\d+)?V)\s*(OUT|IN|EN|REF)\b/g, (_match, value, suffix) => `V${suffix} = ${value}`)
    .replace(/\bV\s*=\s*(26(?:\.0)?V)\s*EN\b/g, "VEN = $1")
    .replace(/\bI\s*=\s*(\d+(?:\.\d+)?(?:m|\u00b5)?A),\s*V\s*=\s*V\s*\+\s*(\d+(?:\.\d+)?V)\s*OUT\s*IN\s*OUT\b/g, (_match, current, offset) => `IOUT = ${current}, VIN = VOUT + ${offset}`)
    .replace(/\(\s*V\s*\+(\d+(?:\.\d+)?V)\s*\)\s*[\u2264<]=?\s*V\s*[\u2264<]=?\s*(\d+(?:\.\d+)?V)\s*OUT\s*OUT\s*IN\b/g, (_match, offset, high) => `(VOUT + ${offset}) \u2264 VIN \u2264 ${high}`)
    .replace(/\bV\s*=\s*V\s*OUT\s*\+\s*(\d+(?:\.\d+)?V),\s*(\d+(?:\.\d+)?(?:m|\u00b5)?A)\s*I\s*(\d+(?:\.\d+)?A)\b/g, (_match, offset, low, high) => `VIN = VOUT + ${offset}, ${low} \u2264 IOUT \u2264 ${high}`)
    .replace(/\bV\s*=\s*V\s*\+\s*(\d+(?:\.\d+)?V)\s*IN\s*OUT\s*OUT\b/g, (_match, offset) => `VIN = VOUT + ${offset}`)
    .replace(/\b(\u0394VREF|\u0394IADJ)\s*\/\s*(\u0394T)\b/g, "$1/$2")
    .replace(/\u0394V\s*\/\s*\u0394T\s*REF\b/g, "\u0394VREF/\u0394T")
    .replace(/\u0394I\s*\/\s*\u0394T\s*ADJ\b/g, "\u0394IADJ/\u0394T");
}

function canonicalSectionIndex(heading: string) {
  const index = CANONICAL_SECTION_ORDER.indexOf(heading as (typeof CANONICAL_SECTION_ORDER)[number]);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}


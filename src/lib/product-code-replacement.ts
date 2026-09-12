export type ProductCodeReplacementMode = "starts-with" | "ends-with" | "exact" | "contains";

export type ProductCodeReplacementResult = {
  text: string;
  replacedCount: number;
  warnings: string[];
};

export function replaceProductCodeTokens({
  text,
  find,
  replaceWith,
  mode,
}: {
  text: string;
  find: string;
  replaceWith: string;
  mode: ProductCodeReplacementMode;
}): ProductCodeReplacementResult {
  const pattern = find.trim();
  if (!pattern) {
    return { text, replacedCount: 0, warnings: [] };
  }

  const isUnsafePattern = pattern.length < 3 || !/^[A-Za-z0-9-]+$/.test(pattern) || !isLikelyProductCodeFragment(pattern);
  if (isUnsafePattern) {
    return {
      text,
      replacedCount: 0,
      warnings: [`unsafe replacement skipped for "${pattern}": partial or invalid product-code strings are not replaced automatically.`],
    };
  }

  let replacedCount = 0;
  const warnings: string[] = [];

  const result = text.replace(/([A-Za-z0-9][A-Za-z0-9-]*)/g, (token) => {
    if (!isLikelyProductCodeToken(token)) {
      return token;
    }

    let replacement: string | null = null;
    switch (mode) {
      case "starts-with":
        if (token.startsWith(pattern)) {
          const remainder = token.slice(pattern.length);
          if (remainder && !/^[A-Za-z0-9-]+$/.test(remainder)) {
            return token;
          }
          replacement = replaceWith + remainder;
        }
        break;
      case "ends-with":
        if (token.endsWith(pattern)) {
          const prefix = token.slice(0, token.length - pattern.length);
          if (prefix && !/^[A-Za-z0-9-]+$/.test(prefix)) {
            return token;
          }
          replacement = prefix + replaceWith;
        }
        break;
      case "exact":
        if (token === pattern) {
          replacement = replaceWith;
        }
        break;
      case "contains":
        if (token.includes(pattern)) {
          replacement = token.split(pattern).join(replaceWith);
        }
        break;
    }

    if (!replacement) {
      return token;
    }

    replacedCount += 1;
    return replacement;
  });

  if (replacedCount === 0 && !isLikelyProductCodeFragment(pattern)) {
    warnings.push(`unsafe replacement skipped for "${pattern}": no safe product-code matches were found.`);
  }

  return { text: result, replacedCount, warnings };
}

function isLikelyProductCodeFragment(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length < 3) return false;
  return /[A-Za-z]/.test(normalized) && /\d/.test(normalized);
}

function isLikelyProductCodeToken(value: string) {
  if (!value || value.length < 4) return false;
  return /^[A-Z0-9-]+$/i.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value) && !/^\d+$/.test(value);
}

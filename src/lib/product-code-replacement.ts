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
  const replacement = replaceWith.trim();
  if (!pattern || !replacement) {
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

  const alreadyReplaced = (token: string) => {
    if (!token) return false;
    const tokenUpper = token.toUpperCase();
    const replacementUpper = replacement.toUpperCase();
    return token === replacement || token.startsWith(replacement) || token.startsWith(replacementUpper) || token.includes(replacement) || token.includes(replacementUpper) || tokenUpper.startsWith(replacementUpper);
  };

  let replacedCount = 0;
  const warnings: string[] = [];

  const result = text.replace(/([A-Za-z0-9][A-Za-z0-9-]*)/g, (token) => {
    if (!isLikelyProductCodeToken(token) || alreadyReplaced(token)) {
      return token;
    }

    let replacementText: string | null = null;
    switch (mode) {
      case "starts-with":
        if (token.startsWith(pattern)) {
          const remainder = token.slice(pattern.length);
          if (remainder && !/^[A-Za-z0-9-]+$/.test(remainder)) {
            return token;
          }
          replacementText = replacement + remainder;
        }
        break;
      case "ends-with":
        if (token.endsWith(pattern)) {
          const prefix = token.slice(0, token.length - pattern.length);
          if (prefix && !/^[A-Za-z0-9-]+$/.test(prefix)) {
            return token;
          }
          replacementText = prefix + replacement;
        }
        break;
      case "exact":
        if (token === pattern) {
          replacementText = replacement;
        }
        break;
      case "contains":
        if (token.includes(pattern) && token !== pattern) {
          const next = token.split(pattern).join(replacement);
          if (next !== token && !next.includes(replacement + replacement)) {
            replacementText = next;
          }
        }
        break;
    }

    if (!replacementText) {
      return token;
    }

    replacedCount += 1;
    return replacementText;
  });

  if (replacedCount === 0 && !isLikelyProductCodeFragment(pattern)) {
    warnings.push(`unsafe replacement skipped for "${pattern}": no safe product-code matches were found.`);
  }

  return { text: result, replacedCount, warnings };
}

export function isLikelyProductCodeFragment(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length < 3) return false;
  return /[A-Za-z]/.test(normalized) && /\d/.test(normalized);
}

export function isLikelyProductCodeToken(value: string) {
  if (!value || value.length < 4) return false;
  return /^[A-Z0-9-]+$/i.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value) && !/^\d+$/.test(value);
}

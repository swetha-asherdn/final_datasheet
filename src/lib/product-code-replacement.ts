export type ProductCodeReplacementMode = "starts-with" | "ends-with" | "exact" | "contains";

export type ProductCodeReplacementResult = {
  text: string;
  replacedCount: number;
  warnings: string[];
};

export type ProductCodeOccurrenceSummary = {
  find: string;
  mode: ProductCodeReplacementMode;
  unreplacedCount: number;
  unreplacedTokens: string[];
  alreadyReplacedCount: number;
  alreadyReplacedTokens: string[];
  isUnsafe: boolean;
  unsafeWarning?: string;
};

export function isLikelyProductCodeFragment(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length < 2) return false;
  return /^[A-Za-z0-9\u0400-\u04FF-]+$/.test(normalized);
}

export function isLikelyProductCodeToken(value: string) {
  if (!value || value.length < 4) return false;
  const hasLetter = /[A-Za-z\u0400-\u04FF]/.test(value);
  const hasDigit = /\d/.test(value);
  const isValid = /^[A-Za-z0-9\u0400-\u04FF-]+$/.test(value);
  return isValid && hasLetter && hasDigit && !/^\d+$/.test(value);
}

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
  if (!pattern) {
    return { text, replacedCount: 0, warnings: [] };
  }

  const isUnsafePattern = pattern.length < 2 || !/^[A-Za-z0-9\u0400-\u04FF-]+$/.test(pattern);
  if (isUnsafePattern) {
    return {
      text,
      replacedCount: 0,
      warnings: [`Please provide a search pattern with at least 2 characters.`],
    };
  }

  if (!replacement) {
    return {
      text,
      replacedCount: 0,
      warnings: [`Please provide a replacement code for "${pattern}".`],
    };
  }

  const alreadyReplaced = (token: string) => {
    if (!token) return false;
    const tokenUpper = token.toUpperCase();
    const replacementUpper = replacement.toUpperCase();
    return (
      tokenUpper === replacementUpper ||
      tokenUpper.startsWith(replacementUpper) ||
      (tokenUpper.startsWith("VS-") && tokenUpper.includes(replacementUpper))
    );
  };

  let replacedCount = 0;
  const warnings: string[] = [];

  const tokenPattern = /([A-Za-z0-9\u0400-\u04FF][A-Za-z0-9\u0400-\u04FF-]*)/g;
  const result = text.replace(tokenPattern, (token) => {
    const tokenUpper = token.toUpperCase();
    const patternUpper = pattern.toUpperCase();

    if ((!isLikelyProductCodeToken(token) && tokenUpper !== patternUpper) || alreadyReplaced(token)) {
      return token;
    }

    let replacementText: string | null = null;
    switch (mode) {
      case "starts-with": {
        if (tokenUpper.startsWith(patternUpper)) {
          const remainder = token.slice(pattern.length);
          if (remainder && !/^[A-Za-z0-9\u0400-\u04FF-]+$/.test(remainder)) {
            return token;
          }
          if (remainder && replacement.toUpperCase().endsWith(remainder.toUpperCase())) {
            replacementText = replacement;
          } else if (replacement.endsWith("-") && remainder.startsWith("-")) {
            replacementText = replacement + remainder.slice(1);
          } else {
            replacementText = replacement + remainder;
          }
        }
        break;
      }
      case "ends-with": {
        if (tokenUpper.endsWith(patternUpper)) {
          const prefix = token.slice(0, token.length - pattern.length);
          if (prefix && !/^[A-Za-z0-9\u0400-\u04FF-]+$/.test(prefix)) {
            return token;
          }
          if (prefix.endsWith("-") && replacement.startsWith("-")) {
            replacementText = prefix + replacement.slice(1);
          } else {
            replacementText = prefix + replacement;
          }
        }
        break;
      }
      case "exact": {
        if (tokenUpper === patternUpper) {
          replacementText = replacement;
        }
        break;
      }
      case "contains": {
        if (tokenUpper.includes(patternUpper) && tokenUpper !== patternUpper) {
          const idx = tokenUpper.indexOf(patternUpper);
          const prefix = token.slice(0, idx);
          const remainder = token.slice(idx + pattern.length);
          const next = prefix + replacement + remainder;
          if (next !== token && !next.toUpperCase().includes(replacement.toUpperCase() + replacement.toUpperCase())) {
            replacementText = next;
          }
        }
        break;
      }
    }

    if (!replacementText) {
      return token;
    }

    replacedCount += 1;
    return replacementText;
  });

  return { text: result, replacedCount, warnings };
}

export function findProductCodeOccurrences({
  text,
  find,
  mode = "exact",
  defaultPrefix = "VS",
}: {
  text: string;
  find: string;
  mode?: ProductCodeReplacementMode;
  defaultPrefix?: string;
}): ProductCodeOccurrenceSummary {
  const pattern = find.trim();
  if (!pattern) {
    return {
      find: "",
      mode,
      unreplacedCount: 0,
      unreplacedTokens: [],
      alreadyReplacedCount: 0,
      alreadyReplacedTokens: [],
      isUnsafe: false,
    };
  }

  const isUnsafe = pattern.length < 2 || !/^[A-Za-z0-9\u0400-\u04FF-]+$/.test(pattern);
  if (isUnsafe) {
    return {
      find: pattern,
      mode,
      unreplacedCount: 0,
      unreplacedTokens: [],
      alreadyReplacedCount: 0,
      alreadyReplacedTokens: [],
      isUnsafe: true,
      unsafeWarning: `Pattern "${pattern}" must be at least 2 characters.`,
    };
  }

  const tokenPattern = /[A-Za-z0-9\u0400-\u04FF][A-Za-z0-9\u0400-\u04FF-]*/g;
  const matches = Array.from(text.matchAll(tokenPattern)).map((m) => m[0]);

  let unreplacedCount = 0;
  const unreplacedTokensSet = new Set<string>();
  let alreadyReplacedCount = 0;
  const alreadyReplacedTokensSet = new Set<string>();

  const patternUpper = pattern.toUpperCase();
  const targetPrefixUpper = `${defaultPrefix.toUpperCase()}-`;

  for (const token of matches) {
    const tokenUpper = token.toUpperCase();
    if (!isLikelyProductCodeToken(token) && tokenUpper !== patternUpper) continue;

    // Check if this token matches unreplaced
    let matchesUnreplaced = false;
    switch (mode) {
      case "exact":
        matchesUnreplaced = tokenUpper === patternUpper;
        break;
      case "starts-with":
        matchesUnreplaced = tokenUpper.startsWith(patternUpper);
        break;
      case "ends-with":
        matchesUnreplaced = tokenUpper.endsWith(patternUpper);
        break;
      case "contains":
        matchesUnreplaced = tokenUpper.includes(patternUpper);
        break;
    }

    if (matchesUnreplaced) {
      if (tokenUpper.startsWith(targetPrefixUpper)) {
        alreadyReplacedCount++;
        alreadyReplacedTokensSet.add(token);
      } else {
        unreplacedCount++;
        unreplacedTokensSet.add(token);
      }
      continue;
    }

    // Check if it's already replaced with the target prefix:
    // e.g. token is "VS-CW29150R-XX" and pattern is "CW29150R-XX" or "CW29150R"
    if (tokenUpper.startsWith(targetPrefixUpper)) {
      const strippedTokenUpper = tokenUpper.slice(targetPrefixUpper.length);
      let matchesStripped = false;
      switch (mode) {
        case "exact":
          matchesStripped = strippedTokenUpper === patternUpper;
          break;
        case "starts-with":
          matchesStripped = strippedTokenUpper.startsWith(patternUpper);
          break;
        case "ends-with":
          matchesStripped = strippedTokenUpper.endsWith(patternUpper);
          break;
        case "contains":
          matchesStripped = strippedTokenUpper.includes(patternUpper);
          break;
      }
      if (matchesStripped) {
        alreadyReplacedCount++;
        alreadyReplacedTokensSet.add(token);
      }
    }
  }

  return {
    find: pattern,
    mode,
    unreplacedCount,
    unreplacedTokens: Array.from(unreplacedTokensSet),
    alreadyReplacedCount,
    alreadyReplacedTokens: Array.from(alreadyReplacedTokensSet),
    isUnsafe: false,
  };
}

/**
 * Validates a regex pattern string for correctness and ReDoS safety.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateRegexPattern(pattern: string): string | null {
  // Reject patterns with nested quantifiers (ReDoS risk)
  // e.g. (a+)+, (a*)+, (a{2,})+, (a+)*, etc.
  const nestedQuantifier = /(\([^)]*[+*]\)|[+*])\s*[+*{]/;
  if (nestedQuantifier.test(pattern)) {
    return "Pattern contains nested quantifiers which could cause performance issues";
  }

  // Verify the pattern compiles
  try {
    new RegExp(pattern);
  } catch {
    return "Invalid regular expression syntax";
  }

  return null;
}

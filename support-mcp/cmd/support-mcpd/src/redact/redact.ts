const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export class Redactor {
  private patterns: Array<[RegExp, string]> = [
    [PRIVATE_KEY_PATTERN, "<private_key_masked>"],
    [/(password|passwd|pwd)[=: ]+[^\s&]+/gi, "$1=***"],
    [/(token|access_token|refresh_token|authorization|api[_-]?key)[=: ]+[^\s]+/gi, "$1=***"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "<aws_access_key_masked>"],
    [/\b1[3-9]\d{9}\b/g, "<mobile_masked>"],
    [/\b\d{17}[0-9Xx]\b/g, "<id_card_masked>"]
  ];

  private sensitiveKeys = [
    "password",
    "passwd",
    "pwd",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "api_token",
    "api_key",
    "apikey",
    "secret",
    "private_key"
  ];

  apply(text: string): string {
    return this.patterns.reduce((acc, [regex, repl]) => acc.replace(regex, repl), text);
  }

  applyToValue(value: unknown): unknown {
    if (typeof value === "string") {
      return this.apply(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.applyToValue(item));
    }
    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        if (this.sensitiveKeys.includes(key.toLowerCase())) {
          output[key] = "***";
        } else {
          output[key] = this.applyToValue(nestedValue);
        }
      }
      return output;
    }
    return value;
  }
}

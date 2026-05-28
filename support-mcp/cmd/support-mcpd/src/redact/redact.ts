export class Redactor {
  private patterns: Array<[RegExp, string]> = [
    [/(password|passwd|pwd)[=: ]+[^\s&]+/gi, "$1=***"],
    [/(token|access_token|refresh_token|authorization)[=: ]+[^\s]+/gi, "$1=***"],
    [/\b1[3-9]\d{9}\b/g, "<mobile_masked>"],
    [/\b\d{17}[0-9Xx]\b/g, "<id_card_masked>"]
  ];

  apply(text: string): string {
    return this.patterns.reduce((acc, [regex, repl]) => acc.replace(regex, repl), text);
  }
}

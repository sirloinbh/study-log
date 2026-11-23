import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Test helper: jsdom does not apply style.css, so layout rules that cannot be seen in a DOM test
// (wrapping, hit areas, font sizes) are checked on the rule text itself. Real sizes are measured in
// the browser check at 390x844 and 1440x900 (docs/changes).
const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** The body of the first rule whose selector list contains `selector`, or undefined. */
export function ruleBody(selector: string): string | undefined {
  const pattern = /(^|\n)([^{}@/][^{}]*)\{([^{}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    const selectors = (match[2] ?? '').split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[3];
  }
  return undefined;
}

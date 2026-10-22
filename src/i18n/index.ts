/**
 * Minimal i18n layer. Arabic is the default and only shipped locale; add
 * `en.ts` with the same keys and switch `current` to support English later.
 */
import { ar } from './ar';

export type Dict = typeof ar;
const dictionaries: Record<string, Dict> = { ar };
let current: keyof typeof dictionaries = 'ar';

export function t(): Dict {
  return dictionaries[current];
}
export function setLocale(l: keyof typeof dictionaries) {
  current = l;
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}

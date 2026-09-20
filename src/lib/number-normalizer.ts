/**
 * Central Number & Numeral System Normalizer
 * Enforces English/Latin digits (0-9) across both INPUT (typing/pasting) and DISPLAY (formatting).
 */

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;
const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "۰": "0",
  "١": "1", "۱": "1",
  "٢": "2", "۲": "2",
  "٣": "3", "۳": "3",
  "٤": "4", "۴": "4",
  "٥": "5", "۵": "5",
  "٦": "6", "۶": "6",
  "٧": "7", "۷": "7",
  "٨": "8", "۸": "8",
  "٩": "9", "۹": "9",
};

/**
 * Converts any Eastern Arabic (٠-٩) or Persian (۰-۹) digits in a string
 * to standard English/Latin digits (0-9).
 */
export function toEnglishDigits(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str).replace(ARABIC_INDIC_DIGITS, (char) => DIGIT_MAP[char] ?? char);
}

/**
 * Ensures an Arabic locale uses the Latin numbering system (-u-nu-latn)
 * so that dates, numbers, and currencies render with English digits 0-9.
 */
export function ensureLatnLocale(locales?: string | string[]): string | string[] | undefined {
  if (!locales) return "ar-SA-u-nu-latn";
  if (typeof locales === "string") {
    if (locales.startsWith("ar") && !locales.includes("-u-nu-")) {
      return locales.includes("-u-")
        ? locales.replace("-u-", "-u-nu-latn-")
        : `${locales}-u-nu-latn`;
    }
    return locales;
  }
  if (Array.isArray(locales)) {
    return locales.map((l) =>
      l.startsWith("ar") && !l.includes("-u-nu-")
        ? l.includes("-u-") ? l.replace("-u-", "-u-nu-latn-") : `${l}-u-nu-latn`
        : l,
    );
  }
  return locales;
}

let isInitialized = false;

/**
 * Installs global interceptors for both input fields and display formatting:
 * 1. Automatically converts any Arabic/Eastern digits typed or pasted into any <input> or <textarea> to English digits (0-9).
 * 2. Ensures all Intl.DateTimeFormat, Intl.NumberFormat, and toLocaleString calls use Latin numerals.
 */
export function setupGlobalNumberNormalizer(): () => void {
  if (typeof window === "undefined" || isInitialized) return () => {};
  isInitialized = true;

  // 1. INPUT INTERCEPTION: Catch user typing on Arabic keyboards or pasting
  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target || !("value" in target) || typeof target.value !== "string") return;

    if (ARABIC_INDIC_DIGITS.test(target.value)) {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      target.value = toEnglishDigits(target.value);
      if (start !== null && end !== null) {
        target.setSelectionRange(start, end);
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const handleBeforeInput = (e: InputEvent) => {
    if (e.data && ARABIC_INDIC_DIGITS.test(e.data)) {
      e.preventDefault();
      const converted = toEnglishDigits(e.data);
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (target && "value" in target) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const before = target.value.slice(0, start);
        const after = target.value.slice(end);
        target.value = before + converted + after;
        const newCursor = start + converted.length;
        target.setSelectionRange(newCursor, newCursor);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text");
    if (text && ARABIC_INDIC_DIGITS.test(text)) {
      e.preventDefault();
      const converted = toEnglishDigits(text);
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (target && "value" in target) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const before = target.value.slice(0, start);
        const after = target.value.slice(end);
        target.value = before + converted + after;
        const newCursor = start + converted.length;
        target.setSelectionRange(newCursor, newCursor);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  };

  window.addEventListener("beforeinput", handleBeforeInput as EventListener, true);
  window.addEventListener("input", handleInput, true);
  window.addEventListener("paste", handlePaste as EventListener, true);

  // 2. DISPLAY INTERCEPTION: Ensure Intl formatters default to Latin numerals
  if (typeof Intl !== "undefined") {
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    // @ts-expect-error - Override DateTimeFormat to guarantee Latin numerals
    Intl.DateTimeFormat = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return new OriginalDateTimeFormat(ensureLatnLocale(locales), options);
    };
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;

    const OriginalNumberFormat = Intl.NumberFormat;
    // @ts-expect-error - Override NumberFormat to guarantee Latin numerals
    Intl.NumberFormat = function (locales?: string | string[], options?: Intl.NumberFormatOptions) {
      return new OriginalNumberFormat(ensureLatnLocale(locales), options);
    };
    Intl.NumberFormat.supportedLocalesOf = OriginalNumberFormat.supportedLocalesOf;
  }

  // 3. NUMBER PROTOTYPE: Ensure num.toLocaleString() uses Latin numerals
  const originalNumberToLocaleString = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locales?: string | string[], options?: Intl.NumberFormatOptions) {
    return originalNumberToLocaleString.call(this, ensureLatnLocale(locales), options);
  };

  return () => {
    window.removeEventListener("beforeinput", handleBeforeInput as EventListener, true);
    window.removeEventListener("input", handleInput, true);
    window.removeEventListener("paste", handlePaste as EventListener, true);
    isInitialized = false;
  };
}

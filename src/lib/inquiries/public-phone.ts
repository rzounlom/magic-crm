export function usPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

export function formatUsNationalNumber(digits: string): string {
  const national = digits.slice(0, 10);
  if (national.length === 0) {
    return "";
  }
  if (national.length < 4) {
    return `(${national}`;
  }
  if (national.length < 7) {
    return `(${national.slice(0, 3)}) ${national.slice(3)}`;
  }
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function formatUsPhoneInput(value: string): string {
  return formatUsNationalNumber(usPhoneDigits(value).slice(0, 10));
}

export function normalizeUsPhoneForStorage(value: string | undefined): string | undefined {
  const digits = usPhoneDigits(value ?? "");
  if (digits.length === 0) {
    return undefined;
  }
  return digits;
}

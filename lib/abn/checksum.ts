const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function normaliseAbn(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const digits = input.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(digits)) return null;
  return digits;
}

export function isValidAbn(input: string | null | undefined): boolean {
  const abn = normaliseAbn(input);
  if (!abn) return false;
  const first = parseInt(abn[0], 10) - 1;
  const rest = abn
    .slice(1)
    .split("")
    .map((d) => parseInt(d, 10));
  const digits = [first, ...rest];
  const sum = digits.reduce((acc, d, i) => acc + d * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

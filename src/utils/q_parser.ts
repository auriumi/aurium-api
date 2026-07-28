//parse values into int otherwise return fallback (optional)
export function parsePosInt(value: unknown, fallback: number): number {
    if (value === undefined) return fallback;

    const n = Number(value);
    if (Number.isNaN(n) || n < 1 || !Number.isInteger(n)) {
        return fallback;
    }
    return n;
}

//parse values into proper string otherwise return fallback
export function parseString(value: unknown, fallback: string): string {
    return value === undefined ? fallback : String(value);
};

export function parseImageYear(raw: unknown): number | null {
  const y = Number(raw);
  if (!Number.isInteger(y) || y < 2024 || y > 2030) return null;
  return y;
}
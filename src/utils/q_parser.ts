//parse values into int otherwise return fallback
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
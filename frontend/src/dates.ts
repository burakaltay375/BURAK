// Auto-formats user input into YYYY-MM-DD as they type and validates.
export function autoFormatDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export function formatTrDate(iso?: string | null): string {
  if (!iso) return "—";
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function nightsBetween(ci?: string | null, co?: string | null): number | null {
  if (!ci || !co || !isValidISODate(ci) || !isValidISODate(co)) return null;
  const a = new Date(ci + "T00:00:00Z").getTime();
  const b = new Date(co + "T00:00:00Z").getTime();
  return Math.round((b - a) / (24 * 3600 * 1000));
}

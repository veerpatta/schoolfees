/**
 * Build a timestamped export filename so repeated downloads of the same
 * report don't collide in the user's Downloads folder. Returns names like
 *   defaulters_2026-05-25_1334.xlsx
 *   day-book_2026-05-25_1015.csv
 *
 * Timestamp uses the browser/server local clock (we don't force IST because
 * the receipt prefix elsewhere also follows local time); the file is stable
 * to the minute, which is the granularity humans care about when triaging
 * "which copy did I just download?".
 */
export function formatExportName(basename: string, extension: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hm = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const cleanExtension = extension.startsWith(".") ? extension.slice(1) : extension;
  const safeBasename = basename.replace(/\.[^./\\]+$/, "");
  return `${safeBasename}_${ymd}_${hm}.${cleanExtension}`;
}

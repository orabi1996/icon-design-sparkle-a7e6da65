/** Half-open intervals in epoch milliseconds. Rounding happens at presentation only. */
export const MINUTE = 60_000;
export const DAY = 86_400_000;
export class RuleError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'RuleError'; this.code = code; this.details = details; }
}
export function requireRule(condition, code, message, details) {
  if (!condition) throw new RuleError(code, message, details);
}
export function date(value) {
  requireRule(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  'DATE', 'التاريخ غير صحيح؛ استخدم YYYY-MM-DD');
  return value;
}
export function addDays(value, days) { return new Date(Date.parse(date(value)) + days * DAY).toISOString().slice(0, 10); }
export function dates(from, to) {
  date(from); date(to); const count = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  requireRule(count > 0 && count <= 370, 'RANGE', 'فترة الجدول يجب أن تكون من يوم إلى 370 يومًا');
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}
export function clock(value) {
  requireRule(typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value), 'TIME', 'الوقت غير صحيح؛ استخدم HH:mm');
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
const formatters = new Map();
export function localParts(ms, zone) {
  if (!formatters.has(zone)) {
    try { formatters.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })); }
    catch { throw new RuleError('TIMEZONE', 'المنطقة الزمنية غير صحيحة'); }
  }
  const p = Object.fromEntries(formatters.get(zone).formatToParts(ms).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: p.second };
}
/** Enumerate offsets around the civil date; reject nonexistent or unresolved repeated local time. */
export function zonedInstant(day, time, zone, disambiguation = 'reject') {
  const wall = Date.parse(`${date(day)}T00:00:00Z`) + clock(time) * MINUTE;
  const offsets = new Set();
  for (let h = -48; h <= 48; h += 6) {
    const probe = wall + h * 60 * MINUTE, p = localParts(probe, zone);
    offsets.add(Date.parse(`${p.date}T${p.time}:${p.second}Z`) - probe);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(ms => {
    const p = localParts(ms, zone); return p.date === day && p.time === time;
  }).sort((a, b) => a - b);
  requireRule(candidates.length, 'DST_GAP', 'هذا الوقت المحلي غير موجود بسبب تغيير الساعة؛ اختر وقتًا صالحًا', { day, time, zone });
  requireRule(candidates.length === 1 || ['earlier', 'later'].includes(disambiguation), 'DST_AMBIGUOUS', 'الوقت المحلي مكرر؛ اختر الظهور الأول أو الأخير', { day, time, zone });
  const ms = disambiguation === 'later' ? candidates.at(-1) : candidates[0];
  return { at: new Date(ms).toISOString(), offsetMinutes: (wall - ms) / MINUTE };
}
export function instant(value) {
  requireRule(typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'INSTANT', 'يلزم تاريخ ووقت كاملان مع الإزاحة الزمنية');
  return Date.parse(value);
}
export function interval(start, end) { const a = instant(start), b = instant(end); requireRule(b > a, 'INTERVAL', 'النهاية الفعلية يجب أن تكون بعد البداية'); return [a, b]; }
export function overlap(a, b) { return a[0] < b[1] && b[0] < a[1]; }
export function union(parts) {
  const result = [];
  for (const p of parts.filter(p => p[1] > p[0]).map(p => [...p]).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && p[0] <= last[1]) last[1] = Math.max(last[1], p[1]); else result.push(p);
  }
  return result;
}
export function intersect(left, right) {
  return union(left.flatMap(a => right.map(b => [Math.max(a[0], b[0]), Math.min(a[1], b[1])])));
}
export function subtract(left, right) {
  let result = union(left);
  for (const [s, e] of union(right)) result = result.flatMap(([a, b]) => e <= a || s >= b ? [[a, b]] : [[a, Math.min(s, b)], [Math.max(e, a), b]].filter(p => p[1] > p[0]));
  return result;
}
export function minutes(parts) { return union(parts).reduce((sum, [s, e]) => sum + (e - s) / MINUTE, 0); }
export function splitLocalDays(parts, zone, holidays = []) {
  return union(parts).flatMap(([start, end]) => {
    const output = []; let cursor = start;
    while (cursor < end) {
      const day = localParts(cursor, zone).date;
      // Civil days may be 23/25 hours; find the actual boundary without assuming 24h.
      let upper = Math.min(end, cursor + 26 * 60 * MINUTE);
      if (localParts(upper - 1, zone).date !== day) {
        let lower = cursor;
        while (upper - lower > 1) { const mid = Math.floor((lower + upper) / 2); if (localParts(mid, zone).date === day) lower = mid; else upper = mid; }
      }
      output.push({ date: day, month: day.slice(0, 7), holiday: holidays.includes(day), minutes: (upper - cursor) / MINUTE, start: new Date(cursor).toISOString(), end: new Date(upper).toISOString() });
      cursor = upper;
    }
    return output;
  });
}

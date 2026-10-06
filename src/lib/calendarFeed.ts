// Turns a Google Calendar iCal feed into site shows.
//
// Pure logic only: no network, no storage, no runtime imports. `calendarSync.ts` does the I/O.
// A calendar event is a show when its title reads "MACH 5 at <venue>"; everything else on the
// calendar (rehearsals, holds, "unavailable" notes) is ignored.
//
// The band's calendar keeps shows as all-day entries with the time typed into the title
// ("MACH 5 at Round Rock Tavern 8pm", "MACH 5 at Krause's Cafe - 6:30-9"), so the title is also
// read for a start time and that part is kept out of the venue and show names.

import type { UpcomingShow } from './shows';
import type { NotableVenue } from './venues';

/** Every show created by the sync has an id starting with this. It is the only durable marker,
 *  because the admin's Save All rewrites shows with just the standard fields. */
export const SYNC_ID_PREFIX = 'gcal-';
export const PLACEHOLDER_ADDRESS = 'Address TBA';

const FALLBACK_LOGO = '/images/logos/m5logo2.webp';
const DAY_MS = 86_400_000;
const SHOW_TITLE = /^\s*mach[\s-]*5\s*(?:\bat\s+|@\s*)(.+?)\s*$/i;
const NEAR_MISS = /^\s*mach[\s-]*5\b/i;
const PRIVATE_WORD = /\bprivate\b/i;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// "<venue> 8pm", "<venue> - 8:30pm", "<venue> - 9-12", "<venue> 6:30-9pm", "<venue> 21:00"
const TITLE_TIME =
    /^(.*?)(?:\s*[-\u2013\u2014,]\s*|\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?:\s*(?:-|\u2013|\u2014|to)\s*(\d{1,2})(?::\d{2})?\s*(am|pm|a|p)?)?$/i;
const MAX_PERIODS = 4000;

type IcsTime = { y: number; mo: number; d: number; h: number; mi: number; dateOnly: boolean; utc: boolean; tzid: string };

type RawEvent = {
    uid: string;
    summary: string;
    location: string;
    status: string;
    klass: string;
    start: IcsTime | null;
    rrule: string;
    exdates: IcsTime[];
    rdates: IcsTime[];
    recurrenceId: IcsTime | null;
};

type Occurrence = { key: string; summary: string; location: string; klass: string; startMs: number; allDay: boolean };

export type SyncReport = {
    eventsInFeed: number;
    showsFound: number;
    added: string[];
    updated: string[];
    removed: string[];
    unchanged: number;
    skippedDuplicates: string[];
    venuesAdded: string[];
    ignored: number;
    nearMisses: string[];
    warnings: string[];
};

export type SyncInput = {
    ics: string;
    now: number;
    timeZone: string;
    existingShows: UpcomingShow[];
    venues: NotableVenue[];
    /** Start hour (0-23) used for all-day calendar entries, which carry no time. */
    defaultStartHour?: number;
    /** How far ahead to publish, in days. */
    horizonDays?: number;
};

export type SyncResult = {
    shows: UpcomingShow[];
    venues: NotableVenue[];
    showsChanged: boolean;
    venuesChanged: boolean;
    report: SyncReport;
};

// ---------------------------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat | null>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat | null => {
    if (!formatters.has(timeZone)) {
        try {
            formatters.set(
                timeZone,
                new Intl.DateTimeFormat('en-US', {
                    timeZone,
                    hourCycle: 'h23',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
            );
        } catch {
            formatters.set(timeZone, null);
        }
    }
    return formatters.get(timeZone) ?? null;
};

export const isValidTimeZone = (timeZone: string): boolean => Boolean(timeZone) && formatterFor(timeZone) !== null;

const wallClock = (ms: number, timeZone: string) => {
    const parts = formatterFor(timeZone)!.formatToParts(new Date(ms));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return { y: read('year'), mo: read('month'), d: read('day'), h: read('hour') % 24, mi: read('minute'), s: read('second') };
};

const offsetMinutes = (ms: number, timeZone: string): number => {
    const wall = wallClock(ms, timeZone);
    const asUtc = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
};

const wallToUtc = (y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number => {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const firstPass = guess - offsetMinutes(guess, timeZone) * 60000;
    return guess - offsetMinutes(firstPass, timeZone) * 60000;
};

const pad2 = (value: number) => String(Math.abs(value)).padStart(2, '0');

/** `2026-10-16T20:00:00-05:00` — the same shape the admin writes. */
export const formatLocalIso = (ms: number, timeZone: string): string => {
    const wall = wallClock(ms, timeZone);
    const offset = offsetMinutes(ms, timeZone);
    const sign = offset >= 0 ? '+' : '-';
    return `${wall.y}-${pad2(wall.mo)}-${pad2(wall.d)}T${pad2(wall.h)}:${pad2(wall.mi)}:00${sign}${pad2(Math.trunc(Math.abs(offset) / 60))}:${pad2(Math.abs(offset) % 60)}`;
};

const localDateKey = (ms: number, timeZone: string): string => {
    const wall = wallClock(ms, timeZone);
    return `${wall.y}-${pad2(wall.mo)}-${pad2(wall.d)}`;
};

const dateLabel = (ms: number, timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(new Date(ms));

// ---------------------------------------------------------------------------------------------
// iCal parsing
// ---------------------------------------------------------------------------------------------

const unescapeText = (value: string): string =>
    value.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char));

const splitOutsideQuotes = (value: string, separator: string): string[] => {
    const pieces: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of value) {
        if (char === '"') quoted = !quoted;
        if (char === separator && !quoted) {
            pieces.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    pieces.push(current);
    return pieces;
};

const parseLine = (line: string): { name: string; params: Record<string, string>; value: string } | null => {
    let colon = -1;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') quoted = !quoted;
        else if (char === ':' && !quoted) {
            colon = index;
            break;
        }
    }
    if (colon < 0) return null;
    const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';');
    const params: Record<string, string> = {};
    rawParams.forEach((param) => {
        const equals = param.indexOf('=');
        if (equals < 0) return;
        params[param.slice(0, equals).trim().toUpperCase()] = param
            .slice(equals + 1)
            .trim()
            .replace(/^"|"$/g, '');
    });
    return { name: rawName.trim().toUpperCase(), params, value: line.slice(colon + 1) };
};

const parseIcsTime = (value: string, params: Record<string, string>): IcsTime | null => {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?$/.exec(value.trim());
    if (!match) return null;
    const dateOnly = match[4] === undefined;
    return {
        y: Number(match[1]),
        mo: Number(match[2]),
        d: Number(match[3]),
        h: dateOnly ? 0 : Number(match[4]),
        mi: dateOnly ? 0 : Number(match[5]),
        dateOnly,
        utc: match[6] === 'Z',
        tzid: params.TZID ?? ''
    };
};

const parseTimeList = (value: string, params: Record<string, string>): IcsTime[] =>
    value
        .split(',')
        .map((piece) => parseIcsTime(piece, params))
        .filter((time): time is IcsTime => time !== null);

export const parseIcs = (text: string): RawEvent[] => {
    const lines = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n[ \t]/g, '')
        .split('\n');

    const events: RawEvent[] = [];
    let current: RawEvent | null = null;
    let nested = 0;

    for (const line of lines) {
        if (!line) continue;
        const upper = line.toUpperCase();
        if (upper === 'BEGIN:VEVENT') {
            current = { uid: '', summary: '', location: '', status: '', klass: '', start: null, rrule: '', exdates: [], rdates: [], recurrenceId: null };
            nested = 0;
            continue;
        }
        if (!current) continue;
        if (upper === 'END:VEVENT') {
            events.push(current);
            current = null;
            continue;
        }
        if (upper.startsWith('BEGIN:')) {
            nested += 1;
            continue;
        }
        if (upper.startsWith('END:')) {
            nested = Math.max(0, nested - 1);
            continue;
        }
        if (nested > 0) continue;

        const parsed = parseLine(line);
        if (!parsed) continue;
        switch (parsed.name) {
            case 'UID':
                current.uid = parsed.value.trim();
                break;
            case 'SUMMARY':
                current.summary = unescapeText(parsed.value).trim();
                break;
            case 'LOCATION':
                current.location = unescapeText(parsed.value).trim();
                break;
            case 'STATUS':
                current.status = parsed.value.trim().toUpperCase();
                break;
            case 'CLASS':
                current.klass = parsed.value.trim().toUpperCase();
                break;
            case 'DTSTART':
                current.start = parseIcsTime(parsed.value, parsed.params);
                break;
            case 'RRULE':
                current.rrule = parsed.value.trim();
                break;
            case 'EXDATE':
                current.exdates.push(...parseTimeList(parsed.value, parsed.params));
                break;
            case 'RDATE':
                current.rdates.push(...parseTimeList(parsed.value, parsed.params));
                break;
            case 'RECURRENCE-ID':
                current.recurrenceId = parseIcsTime(parsed.value, parsed.params);
                break;
            default:
                break;
        }
    }
    return events;
};

// ---------------------------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------------------------

const dayNumber = (y: number, mo: number, d: number) => Math.round(Date.UTC(y, mo - 1, d) / DAY_MS);
const fromDayNumber = (day: number) => {
    const date = new Date(day * DAY_MS);
    return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), weekday: date.getUTCDay() };
};
const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const compactDate = (day: number) => {
    const { y, mo, d } = fromDayNumber(day);
    return `${y}${pad2(mo)}${pad2(d)}`;
};

type TimeContext = { timeZone: string; defaultStartHour: number; windowEnd: number; warnings: string[] };

const zoneOf = (time: IcsTime, ctx: TimeContext): string => (!time.utc && time.tzid && isValidTimeZone(time.tzid) ? time.tzid : ctx.timeZone);

const toMs = (time: IcsTime, ctx: TimeContext): number => {
    if (time.dateOnly) return wallToUtc(time.y, time.mo, time.d, ctx.defaultStartHour, 0, ctx.timeZone);
    if (time.utc) return Date.UTC(time.y, time.mo - 1, time.d, time.h, time.mi);
    return wallToUtc(time.y, time.mo, time.d, time.h, time.mi, zoneOf(time, ctx));
};

const UNSUPPORTED_RULE_PARTS = ['BYSETPOS', 'BYWEEKNO', 'BYYEARDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND'];

/** Day numbers (in the event's own zone) of every occurrence up to the window end.
 *  Returns null when the rule uses something this expander does not understand. */
const expandRule = (rule: string, start: IcsTime, ctx: TimeContext): { days: number[]; occurrenceMs: (day: number) => number } | null => {
    const zone = zoneOf(start, ctx);
    // A UTC start is converted to the site's wall clock so "every Saturday" stays on Saturday.
    const wall = start.utc && !start.dateOnly ? wallClock(toMs(start, ctx), ctx.timeZone) : start;
    const occurrenceMs = (day: number) => {
        const { y, mo, d } = fromDayNumber(day);
        return start.dateOnly ? wallToUtc(y, mo, d, ctx.defaultStartHour, 0, ctx.timeZone) : wallToUtc(y, mo, d, wall.h, wall.mi, zone);
    };

    const parts: Record<string, string> = {};
    rule.split(';').forEach((piece) => {
        const equals = piece.indexOf('=');
        if (equals > 0) parts[piece.slice(0, equals).trim().toUpperCase()] = piece.slice(equals + 1).trim().toUpperCase();
    });

    const freq = parts.FREQ;
    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
    if (UNSUPPORTED_RULE_PARTS.some((key) => key in parts)) return null;

    const interval = Math.max(1, Number(parts.INTERVAL) || 1);
    const count = parts.COUNT ? Number(parts.COUNT) : null;
    const untilTime = parts.UNTIL ? parseIcsTime(parts.UNTIL, {}) : null;
    const untilMs = untilTime
        ? untilTime.dateOnly
            ? wallToUtc(untilTime.y, untilTime.mo, untilTime.d, 23, 59, ctx.timeZone) + 59_999
            : toMs(untilTime, ctx)
        : null;
    const weekStart = Math.max(0, WEEKDAYS.indexOf(parts.WKST ?? 'MO'));
    const byMonth = parts.BYMONTH ? parts.BYMONTH.split(',').map(Number) : null;
    const byMonthDay = parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(Number) : null;
    const byDay = parts.BYDAY
        ? parts.BYDAY.split(',').map((token) => {
              const match = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim());
              return match ? { ordinal: match[1] ? Number(match[1]) : 0, weekday: WEEKDAYS.indexOf(match[2]) } : null;
          })
        : null;
    if (byDay && byDay.some((entry) => entry === null)) return null;
    if (freq === 'YEARLY' && byDay) return null;
    if ((freq === 'DAILY' || freq === 'WEEKLY') && (byMonthDay || byDay?.some((entry) => entry!.ordinal !== 0))) return null;

    const startDay = dayNumber(wall.y, wall.mo, wall.d);
    const startInfo = fromDayNumber(startDay);
    const monthAllowed = (day: number) => !byMonth || byMonth.includes(fromDayNumber(day).mo);

    const monthDays = (y: number, mo: number): number[] => {
        const total = daysInMonth(y, mo);
        const fromMonthDay = byMonthDay
            ? byMonthDay.map((value) => (value > 0 ? value : total + value + 1)).filter((value) => value >= 1 && value <= total)
            : null;
        if (byDay) {
            const picked = new Set<number>();
            byDay.forEach((entry) => {
                const matches: number[] = [];
                for (let d = 1; d <= total; d += 1) {
                    if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === entry!.weekday) matches.push(d);
                }
                if (entry!.ordinal === 0) matches.forEach((d) => picked.add(d));
                else {
                    const index = entry!.ordinal > 0 ? entry!.ordinal - 1 : matches.length + entry!.ordinal;
                    if (matches[index] !== undefined) picked.add(matches[index]);
                }
            });
            const days = [...picked];
            return fromMonthDay ? days.filter((d) => fromMonthDay.includes(d)) : days;
        }
        if (fromMonthDay) return fromMonthDay;
        return startInfo.d <= total ? [startInfo.d] : [];
    };

    const candidates = (period: number): number[] => {
        if (freq === 'DAILY') {
            const day = startDay + period * interval;
            const weekdayOk = !byDay || byDay.some((entry) => entry!.weekday === fromDayNumber(day).weekday);
            return weekdayOk && monthAllowed(day) ? [day] : [];
        }
        if (freq === 'WEEKLY') {
            const weekBase = startDay - ((startInfo.weekday - weekStart + 7) % 7) + period * 7 * interval;
            const weekdays = byDay ? byDay.map((entry) => entry!.weekday) : [startInfo.weekday];
            return weekdays.map((weekday) => weekBase + ((weekday - weekStart + 7) % 7)).filter(monthAllowed);
        }
        if (freq === 'MONTHLY') {
            const monthIndex = startInfo.y * 12 + (startInfo.mo - 1) + period * interval;
            const y = Math.floor(monthIndex / 12);
            const mo = (monthIndex % 12) + 1;
            if (byMonth && !byMonth.includes(mo)) return [];
            return monthDays(y, mo).map((d) => dayNumber(y, mo, d));
        }
        const y = startInfo.y + period * interval;
        const months = byMonth ?? [startInfo.mo];
        return months.flatMap((mo) => {
            const total = daysInMonth(y, mo);
            const days = byMonthDay ? byMonthDay.map((value) => (value > 0 ? value : total + value + 1)) : [startInfo.d];
            return days.filter((d) => d >= 1 && d <= total).map((d) => dayNumber(y, mo, d));
        });
    };

    const days: number[] = [];
    const seen = new Set<number>();
    let produced = 0;
    const accept = (day: number): boolean => {
        if (day < startDay || seen.has(day)) return true;
        seen.add(day);
        const ms = occurrenceMs(day);
        if (untilMs !== null && ms > untilMs) return false;
        produced += 1;
        if (count !== null && produced > count) return false;
        if (ms > ctx.windowEnd) return false;
        days.push(day);
        return true;
    };

    if (!accept(startDay)) return { days, occurrenceMs };
    for (let period = 0; period < MAX_PERIODS; period += 1) {
        for (const day of candidates(period).sort((a, b) => a - b)) {
            if (!accept(day)) return { days, occurrenceMs };
        }
    }
    return { days, occurrenceMs };
};

const cleanKey = (value: string) =>
    value
        .replace(/@google\.com$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

/** Every dated occurrence in the feed, with recurring events expanded and exceptions applied. */
export const listOccurrences = (events: RawEvent[], ctx: TimeContext): Occurrence[] => {
    const overrides = new Map<string, RawEvent>();
    events.forEach((event) => {
        if (event.recurrenceId && event.uid) overrides.set(`${event.uid}|${toMs(event.recurrenceId, ctx)}`, event);
    });
    const usedOverrides = new Set<string>();
    const occurrences: Occurrence[] = [];

    const fromEvent = (event: RawEvent, key: string, startMs: number, allDay: boolean): Occurrence => ({
        key: `${SYNC_ID_PREFIX}${key}`,
        summary: event.summary,
        location: event.location,
        klass: event.klass,
        startMs,
        allDay
    });

    events.forEach((event, index) => {
        if (!event.start || event.recurrenceId) return;
        const baseKey = cleanKey(event.uid) || `event-${index + 1}`;
        if (!event.rrule && event.rdates.length === 0) {
            if (event.status !== 'CANCELLED') occurrences.push(fromEvent(event, baseKey, toMs(event.start, ctx), event.start.dateOnly));
            return;
        }

        const excluded = new Set(event.exdates.map((time) => toMs(time, ctx)));
        const emit = (originalMs: number, day: number) => {
            if (excluded.has(originalMs)) return;
            const overrideKey = `${event.uid}|${originalMs}`;
            const override = overrides.get(overrideKey);
            const key = `${baseKey}-${compactDate(day)}`;
            if (override) {
                usedOverrides.add(overrideKey);
                if (override.status === 'CANCELLED' || !override.start) return;
                occurrences.push(fromEvent(override, key, toMs(override.start, ctx), override.start.dateOnly));
                return;
            }
            if (event.status !== 'CANCELLED') occurrences.push(fromEvent(event, key, originalMs, event.start!.dateOnly));
        };

        const emitted = new Set<number>();
        const dayOf = (ms: number) => {
            const wall = wallClock(ms, zoneOf(event.start!, ctx));
            return dayNumber(wall.y, wall.mo, wall.d);
        };

        if (event.rrule) {
            const expanded = expandRule(event.rrule, event.start, ctx);
            if (expanded) {
                expanded.days.forEach((day) => {
                    const ms = expanded.occurrenceMs(day);
                    emitted.add(ms);
                    emit(ms, day);
                });
            } else {
                ctx.warnings.push(`"${event.summary}" repeats on a pattern the sync can't expand (${event.rrule}); only its first date was read.`);
                const ms = toMs(event.start, ctx);
                emitted.add(ms);
                emit(ms, dayOf(ms));
            }
        } else {
            const ms = toMs(event.start, ctx);
            emitted.add(ms);
            emit(ms, dayOf(ms));
        }

        event.rdates.forEach((time) => {
            const ms = toMs(time, ctx);
            if (emitted.has(ms) || ms > ctx.windowEnd) return;
            emitted.add(ms);
            emit(ms, dayOf(ms));
        });
    });

    // An edited instance whose series is not in the feed still counts as its own event.
    overrides.forEach((event, overrideKey) => {
        if (usedOverrides.has(overrideKey) || event.status === 'CANCELLED' || !event.start || !event.recurrenceId) return;
        const key = `${cleanKey(event.uid)}-${event.recurrenceId.y}${pad2(event.recurrenceId.mo)}${pad2(event.recurrenceId.d)}`;
        occurrences.push(fromEvent(event, key, toMs(event.start, ctx), event.start.dateOnly));
    });

    return occurrences;
};

// ---------------------------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------------------------

type TitleTime = { h: number; mi: number };

/** Splits "Round Rock Tavern 8pm" into the venue and a start time.
 *  A trailing number only counts as a time when something marks it as one (am/pm, a colon, or a
 *  range), so "Shooters 620" and "Studio 54" stay whole. With no am/pm the time is taken as
 *  evening, since these are gigs: "9-12" starts at 9 PM. */
export const splitVenueAndTime = (text: string): { venueText: string; time: TitleTime | null } => {
    const whole = { venueText: text.trim(), time: null };
    const match = TITLE_TIME.exec(text.trim());
    if (!match || !match[1].trim()) return whole;
    const [, venuePart, hourText, minuteText, startSuffix, endHour, endSuffix] = match;
    const hasMarker = Boolean(startSuffix || minuteText !== undefined || endHour !== undefined || endSuffix);
    if (!hasMarker) return whole;

    let h = Number(hourText);
    const mi = minuteText === undefined ? 0 : Number(minuteText);
    if (mi > 59) return whole;
    const suffix = (startSuffix ?? '').toLowerCase();
    if (suffix) {
        if (h < 1 || h > 12) return whole;
        if (suffix.startsWith('p') && h < 12) h += 12;
        if (suffix.startsWith('a') && h === 12) h = 0;
    } else if (h >= 1 && h <= 11) {
        h += 12;
    } else if (h > 23 || h === 0) {
        return whole;
    }
    return { venueText: venuePart.trim(), time: { h, mi } };
};

const clockLabel = (h: number, mi: number) => `${h % 12 || 12}:${pad2(mi)} ${h >= 12 ? 'PM' : 'AM'}`;

// ---------------------------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------------------------

const slug = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

const normalizeName = (value: string) =>
    value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '')
        .replace(/^the/, '');

/** "1208 n" from "1208 N I-35 Frontage Rd, Round Rock, TX" — enough to tell two addresses apart. */
const addressKey = (address: string): string => {
    const match = /^\s*(\d+)\s+([a-z0-9]+)/i.exec(address);
    return match ? `${match[1]} ${match[2].toLowerCase()}` : '';
};

export const parseLocation = (raw: string): { placeName: string; address: string } => {
    const text = raw
        .replace(/\s*\n\s*/g, ', ')
        .replace(/[ \t]+/g, ' ')
        .replace(/,\s*(USA|United States)\.?\s*$/i, '')
        .trim();
    if (!text) return { placeName: '', address: '' };
    const parts = text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length > 1 && !/^\d/.test(parts[0]) && /^\d/.test(parts[1])) {
        return { placeName: parts[0], address: parts.slice(1).join(', ') };
    }
    return { placeName: '', address: parts.join(', ') };
};

const mapsUrl = (query: string) => `https://maps.google.com/?q=${encodeURIComponent(query)}`;

const findVenue = (venues: NotableVenue[], venueText: string, location: { placeName: string; address: string }): NotableVenue | null => {
    const wanted = [venueText, location.placeName].map(normalizeName).filter(Boolean);
    const eventAddress = addressKey(location.address);
    const conflicts = (venue: NotableVenue) => {
        const venueAddress = addressKey(venue.address);
        return Boolean(eventAddress && venueAddress && eventAddress !== venueAddress);
    };

    const exact = venues.filter((venue) => wanted.includes(normalizeName(venue.name)) || slug(venue.id) === slug(venueText));
    if (exact.length > 0) return exact.find((venue) => !conflicts(venue)) ?? null;

    if (eventAddress) {
        const byAddress = venues.find((venue) => addressKey(venue.address) === eventAddress);
        if (byAddress) return byAddress;
    }

    const partial = venues.filter((venue) => {
        const name = normalizeName(venue.name);
        return name.length >= 5 && wanted.some((text) => text.length >= 5 && (text.includes(name) || name.includes(text)));
    });
    return partial.find((venue) => !conflicts(venue)) ?? null;
};

const uniqueVenueId = (venues: NotableVenue[], base: string): string => {
    const taken = new Set(venues.map((venue) => venue.id));
    const root = base || 'venue';
    if (!taken.has(root)) return root;
    let suffix = 2;
    while (taken.has(`${root}-${suffix}`)) suffix += 1;
    return `${root}-${suffix}`;
};

// ---------------------------------------------------------------------------------------------
// Feed -> shows
// ---------------------------------------------------------------------------------------------

const sameShow = (a: UpcomingShow, b: UpcomingShow): boolean =>
    a.eventName === b.eventName &&
    (a.venueId ?? '') === (b.venueId ?? '') &&
    a.venueName === b.venueName &&
    a.venueAddress === b.venueAddress &&
    a.directionsUrl === b.directionsUrl &&
    (a.venueLogo || FALLBACK_LOGO) === (b.venueLogo || FALLBACK_LOGO) &&
    new Date(a.startDateTime).getTime() === new Date(b.startDateTime).getTime();

export const isSyncedShow = (show: Pick<UpcomingShow, 'id'>): boolean => show.id.startsWith(SYNC_ID_PREFIX);

export const looksLikeCalendar = (text: string): boolean => /BEGIN:VCALENDAR/i.test(text);

export const buildCalendarSync = (input: SyncInput): SyncResult => {
    const timeZone = input.timeZone;
    const warnings: string[] = [];
    const ctx: TimeContext = {
        timeZone,
        defaultStartHour: input.defaultStartHour ?? 20,
        windowEnd: input.now + (input.horizonDays ?? 730) * DAY_MS,
        warnings
    };
    // Slack so a show is not purged from storage the moment it starts. The public pages apply
    // their own start >= now filter, so this does not change what visitors see.
    const windowStart = input.now - 6 * 60 * 60 * 1000;

    const events = parseIcs(input.ics);
    const occurrences = listOccurrences(events, ctx)
        .filter((occurrence) => occurrence.startMs >= windowStart && occurrence.startMs <= ctx.windowEnd)
        .sort((a, b) => a.startMs - b.startMs);

    const venues = input.venues.map((venue) => ({ ...venue }));
    const venuesAdded: string[] = [];
    let venuesChanged = false;

    const manualShows = input.existingShows.filter((show) => !isSyncedShow(show));
    const previousSynced = new Map(input.existingShows.filter(isSyncedShow).map((show) => [show.id, show]));
    const manualKeys = new Set<string>();
    manualShows.forEach((show) => {
        const ms = new Date(show.startDateTime).getTime();
        if (Number.isNaN(ms)) return;
        const day = localDateKey(ms, timeZone);
        if (show.venueId) manualKeys.add(`${day}|id:${show.venueId}`);
        manualKeys.add(`${day}|name:${normalizeName(show.venueName)}`);
    });

    const privateVenue = (): NotableVenue => {
        const existing = venues.find((venue) => PRIVATE_WORD.test(venue.name));
        if (existing) return existing;
        const created: NotableVenue = {
            id: uniqueVenueId(venues, 'private-venue'),
            name: 'Private Venue',
            address: 'Austin, TX',
            directionsUrl: mapsUrl('Austin TX'),
            logoUrl: FALLBACK_LOGO
        };
        venues.push(created);
        venuesAdded.push(created.name);
        venuesChanged = true;
        return created;
    };

    const report: SyncReport = {
        eventsInFeed: events.length,
        showsFound: 0,
        added: [],
        updated: [],
        removed: [],
        unchanged: 0,
        skippedDuplicates: [],
        venuesAdded,
        ignored: 0,
        nearMisses: [],
        warnings
    };

    const synced: UpcomingShow[] = [];
    const usedIds = new Set<string>();
    const labels = new Map<string, string>();

    // Pass 1: decide which entries are shows, and resolve each one's venue and any stated time.
    type Candidate = { occurrence: Occurrence; venue: NotableVenue; eventName: string; time: TitleTime | null; hasTime: boolean };
    const candidates: Candidate[] = [];

    occurrences.forEach((occurrence) => {
        const summary = occurrence.summary.trim();
        const title = SHOW_TITLE.exec(summary);
        if (!title) {
            report.ignored += 1;
            if (NEAR_MISS.test(summary) && report.nearMisses.length < 10) report.nearMisses.push(`${summary} — ${localDateKey(occurrence.startMs, timeZone)}`);
            return;
        }
        report.showsFound += 1;

        const { venueText, time } = splitVenueAndTime(title[1]);
        const isPrivate = occurrence.klass === 'PRIVATE' || occurrence.klass === 'CONFIDENTIAL' || PRIVATE_WORD.test(summary);
        let venue: NotableVenue;
        let eventName: string;

        if (isPrivate) {
            venue = privateVenue();
            eventName = 'Private Event';
        } else {
            const location = parseLocation(occurrence.location);
            const matched = findVenue(venues, venueText, location);
            if (matched) {
                venue = matched;
                if (venue.address === PLACEHOLDER_ADDRESS && location.address) {
                    venue.address = location.address;
                    venue.directionsUrl = mapsUrl(`${venue.name} ${location.address}`);
                    venuesChanged = true;
                }
            } else {
                venue = {
                    id: uniqueVenueId(venues, slug(venueText)),
                    name: venueText,
                    address: location.address || PLACEHOLDER_ADDRESS,
                    directionsUrl: mapsUrl(location.address ? `${venueText} ${location.address}` : venueText),
                    logoUrl: FALLBACK_LOGO
                };
                venues.push(venue);
                venuesAdded.push(venue.name);
                venuesChanged = true;
                if (!location.address) warnings.push(`"${summary}" has no location on the calendar, so ${venue.name} was added without an address.`);
            }
            // The title as typed, minus the time: "MACH 5 at Round Rock Tavern 8pm" -> "MACH 5 at Round Rock Tavern".
            eventName = `${summary.slice(0, summary.length - title[1].length)}${venueText}`;
        }

        // A timed calendar entry is authoritative; the title's time only fills in for all-day entries.
        candidates.push({ occurrence, venue, eventName, time: occurrence.allDay ? time : null, hasTime: !occurrence.allDay || time !== null });
    });

    // The usual start time at each venue, for all-day entries whose title gives no time.
    const venueTimes = new Map<string, Map<string, number>>();
    const noteTime = (venueId: string, h: number, mi: number) => {
        const counts = venueTimes.get(venueId) ?? new Map<string, number>();
        const key = `${h}:${mi}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        venueTimes.set(venueId, counts);
    };
    manualShows.forEach((show) => {
        const ms = new Date(show.startDateTime).getTime();
        if (Number.isNaN(ms) || !show.venueId) return;
        const wall = wallClock(ms, timeZone);
        noteTime(show.venueId, wall.h, wall.mi);
    });
    candidates.forEach(({ occurrence, venue, time }) => {
        if (time) noteTime(venue.id, time.h, time.mi);
        else if (!occurrence.allDay) {
            const wall = wallClock(occurrence.startMs, timeZone);
            noteTime(venue.id, wall.h, wall.mi);
        }
    });
    const usualTime = (venueId: string): TitleTime | null => {
        const counts = venueTimes.get(venueId);
        if (!counts) return null;
        const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const [h, mi] = best[0].split(':').map(Number);
        return { h, mi };
    };

    // Pass 2: settle the start time, drop anything already entered by hand, and build the shows.
    candidates.forEach(({ occurrence, venue, eventName, time, hasTime }) => {
        const day = localDateKey(occurrence.startMs, timeZone);
        const [y, mo, d] = day.split('-').map(Number);
        const usual = hasTime ? null : usualTime(venue.id);
        const chosen = time ?? usual;
        const startMs = occurrence.allDay && chosen ? wallToUtc(y, mo, d, chosen.h, chosen.mi, timeZone) : occurrence.startMs;
        const label = `${eventName} — ${dateLabel(startMs, timeZone)}`;

        if (manualKeys.has(`${day}|id:${venue.id}`) || manualKeys.has(`${day}|name:${normalizeName(venue.name)}`)) {
            report.skippedDuplicates.push(label);
            return;
        }

        if (!hasTime) {
            const wall = wallClock(startMs, timeZone);
            warnings.push(
                `"${occurrence.summary.trim()}" on ${day} has no start time on the calendar, so ${clockLabel(wall.h, wall.mi)} was used` +
                    (usual ? ` (the usual time at ${venue.name}).` : '.') +
                    ' Add the time to the end of the title to set it, e.g. "... 9pm".'
            );
        }

        let id = occurrence.key;
        for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${occurrence.key}-${suffix}`;
        usedIds.add(id);

        synced.push({
            id,
            eventName,
            venueId: venue.id,
            venueName: venue.name,
            venueAddress: venue.address,
            startDateTime: formatLocalIso(startMs, timeZone),
            directionsUrl: venue.directionsUrl,
            venueLogo: venue.logoUrl || FALLBACK_LOGO
        });
        labels.set(id, label);
    });

    // A venue's address may have been filled in above after an earlier show already copied the placeholder.
    synced.forEach((show) => {
        const venue = venues.find((item) => item.id === show.venueId);
        if (venue) {
            show.venueAddress = venue.address;
            show.directionsUrl = venue.directionsUrl;
        }
        const previous = previousSynced.get(show.id);
        const label = labels.get(show.id) ?? show.eventName;
        if (!previous) report.added.push(label);
        else if (!sameShow(previous, show)) report.updated.push(label);
        else report.unchanged += 1;
    });

    // Shows that have simply happened drop off quietly; only a still-upcoming show that left the
    // calendar is reported as removed.
    let expired = 0;
    previousSynced.forEach((show, id) => {
        if (usedIds.has(id)) return;
        const ms = new Date(show.startDateTime).getTime();
        if (!Number.isNaN(ms) && ms < windowStart) {
            expired += 1;
            return;
        }
        report.removed.push(`${show.eventName} — ${Number.isNaN(ms) ? show.startDateTime : dateLabel(ms, timeZone)}`);
    });

    const shows = [...manualShows, ...synced].sort((a, b) => {
        const aMs = new Date(a.startDateTime).getTime();
        const bMs = new Date(b.startDateTime).getTime();
        return (Number.isNaN(aMs) ? Infinity : aMs) - (Number.isNaN(bMs) ? Infinity : bMs);
    });

    return {
        shows,
        venues,
        showsChanged: report.added.length + report.updated.length + report.removed.length + expired > 0,
        venuesChanged,
        report
    };
};

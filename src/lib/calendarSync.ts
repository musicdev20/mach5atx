// Pulls the band's Google Calendar feed and merges its shows into the site.
// The rules for what counts as a show live in `calendarFeed.ts`; this file only does the I/O.

import { getStore } from '@netlify/blobs';
import { buildCalendarSync, isValidTimeZone, looksLikeCalendar } from './calendarFeed';
import type { SyncReport } from './calendarFeed';
import { getStoredShows, setUpcomingShows } from './shows';
import { getStoredVenues, setNotableVenues } from './venues';

const STORE_NAME = 'mach5';
const STATUS_KEY = 'calendar-sync-status';
const DEFAULT_TIME_ZONE = 'America/Chicago';
const FETCH_TIMEOUT_MS = 15_000;

export type CalendarSyncTrigger = 'schedule' | 'manual';

export type CalendarSyncStatus = {
    ranAt: string;
    ok: boolean;
    trigger: CalendarSyncTrigger;
    error?: string;
    report?: SyncReport;
    /** The most recent run that actually changed the site. Most runs change nothing, so without
     *  this the admin could never see what the timer did overnight. */
    lastChange?: CalendarSyncChange;
};

export type CalendarSyncChange = Pick<SyncReport, 'added' | 'updated' | 'removed' | 'venuesAdded'> & { ranAt: string };

// Read from process.env at request time only. Going through import.meta.env would let the build
// copy the secret calendar address into the server bundle.
const readEnv = (key: string): string => String((typeof process !== 'undefined' ? process.env?.[key] : '') || '').trim();

const feedUrlFromEnv = (): string => readEnv('GOOGLE_CALENDAR_ICS_URL');

const timeZoneFromEnv = (): string => {
    const value = readEnv('SHOWS_TIME_ZONE');
    return value && isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
};

const normalizeFeedUrl = (raw: string): string | null => {
    try {
        const url = new URL(raw.replace(/^webcal:/i, 'https:'));
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
};

export const isCalendarSyncConfigured = (): boolean => feedUrlFromEnv().length > 0;

export const getCalendarSyncStatus = async (): Promise<CalendarSyncStatus | null> => {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        const stored = await store.get(STATUS_KEY, { type: 'json' });
        return stored && typeof stored === 'object' ? (stored as CalendarSyncStatus) : null;
    } catch {
        return null;
    }
};

// Errors here never include the feed address: it is a secret that grants read access to the calendar.
const fetchFeed = async (): Promise<string> => {
    const raw = feedUrlFromEnv();
    if (!raw) throw new Error('Calendar sync is not set up yet. Add GOOGLE_CALENDAR_ICS_URL in the Netlify environment variables.');
    const url = normalizeFeedUrl(raw);
    if (!url) throw new Error('GOOGLE_CALENDAR_ICS_URL is not a valid https address.');

    let response: Response;
    try {
        response = await fetch(url, {
            headers: { accept: 'text/calendar, text/plain;q=0.8' },
            cache: 'no-store',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
    } catch {
        throw new Error('Could not reach Google Calendar. It will be tried again on the next run.');
    }
    if (!response.ok) {
        throw new Error(
            response.status === 404
                ? 'Google says that calendar address does not exist. If the secret address was reset, update GOOGLE_CALENDAR_ICS_URL.'
                : `Google Calendar answered with an error (${response.status}).`
        );
    }
    const text = await response.text();
    if (!looksLikeCalendar(text)) {
        throw new Error('That address did not return a calendar feed. Use the calendar\'s "Secret address in iCal format" (it ends in .ics).');
    }
    return text;
};

const attempt = async (trigger: CalendarSyncTrigger): Promise<CalendarSyncStatus> => {
    const ranAt = new Date().toISOString();
    try {
        const ics = await fetchFeed();
        // Both reads throw on a storage failure, so a bad read can never be mistaken for "no shows".
        const [existingShows, venues] = await Promise.all([getStoredShows(), getStoredVenues()]);
        const result = buildCalendarSync({ ics, now: Date.now(), timeZone: timeZoneFromEnv(), existingShows, venues });

        // Venues first: a show must never point at a venue that was not saved.
        if (result.venuesChanged) await setNotableVenues(result.venues);
        if (result.showsChanged) await setUpcomingShows(result.shows);

        return { ranAt, ok: true, trigger, report: result.report };
    } catch (error) {
        return { ranAt, ok: false, trigger, error: error instanceof Error ? error.message : 'Calendar sync failed.' };
    }
};

export const runCalendarSync = async (trigger: CalendarSyncTrigger): Promise<CalendarSyncStatus> => {
    const status = await attempt(trigger);
    const report = status.report;
    if (report && report.added.length + report.updated.length + report.removed.length + report.venuesAdded.length > 0) {
        status.lastChange = { ranAt: status.ranAt, added: report.added, updated: report.updated, removed: report.removed, venuesAdded: report.venuesAdded };
    } else {
        status.lastChange = (await getCalendarSyncStatus())?.lastChange;
    }
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        await store.setJSON(STATUS_KEY, status);
    } catch {
        // The status record is only for display; the sync result itself already stands.
    }
    return status;
};

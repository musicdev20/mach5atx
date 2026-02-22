import { getStore } from '@netlify/blobs';

export type NotableVenue = {
    id: string;
    name: string;
    city: string;
};

const STORE_NAME = 'mach5';
const STORE_KEY = 'notable-venues';

export const defaultNotableVenues: NotableVenue[] = [
    { id: 'shooters-round-rock', name: 'Shooters', city: 'Round Rock, TX' },
    { id: 'round-rock-tavern', name: 'Round Rock Tavern', city: 'Round Rock, TX' },
    { id: 'austin-private-events', name: 'Austin Private Events', city: 'Austin, TX' },
    { id: 'central-texas-festival-circuit', name: 'Central Texas Festival Circuit', city: 'Central Texas' }
];

const isVenue = (value: unknown): value is NotableVenue => {
    if (!value || typeof value !== 'object') return false;
    const venue = value as Record<string, unknown>;
    return typeof venue.id === 'string' && typeof venue.name === 'string' && typeof venue.city === 'string';
};

const normalizeVenues = (raw: unknown): NotableVenue[] => {
    if (!Array.isArray(raw)) return defaultNotableVenues;
    const cleaned = raw
        .filter(isVenue)
        .map((venue) => ({
            id: venue.id.trim(),
            name: venue.name.trim(),
            city: venue.city.trim()
        }))
        .filter((venue) => venue.id.length > 0 && venue.name.length > 0 && venue.city.length > 0);
    return cleaned.length > 0 ? cleaned : defaultNotableVenues;
};

export const getNotableVenues = async (): Promise<NotableVenue[]> => {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        const stored = await store.get(STORE_KEY, { type: 'json' });
        return normalizeVenues(stored);
    } catch {
        return defaultNotableVenues;
    }
};

export const setNotableVenues = async (venues: NotableVenue[]): Promise<void> => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.setJSON(STORE_KEY, normalizeVenues(venues));
};

import { getStore } from '@netlify/blobs';

export type UpcomingShow = {
    id: string;
    eventName: string;
    venueId?: string;
    venueName: string;
    venueAddress: string;
    startDateTime: string;
    directionsUrl: string;
    venueLogo?: string;
};

const STORE_NAME = 'mach5';
const STORE_KEY = 'upcoming-shows';

export const defaultUpcomingShows: UpcomingShow[] = [
    {
        id: 'shooters-round-rock-2026-03-21',
        eventName: 'Mach 5 Live at Shooters',
        venueId: 'shooters-round-rock',
        venueName: 'Shooters',
        venueAddress: '1208 N I-35 Frontage Rd, Round Rock, TX',
        startDateTime: '2026-03-21T20:00:00-05:00',
        directionsUrl: 'https://maps.google.com/?q=Shooters+Round+Rock+TX',
        venueLogo: '/images/logos/m5logo2.webp'
    },
    {
        id: 'round-rock-tavern-2026-04-12',
        eventName: 'Saturday Night Rock Set',
        venueId: 'round-rock-tavern',
        venueName: 'Round Rock Tavern',
        venueAddress: '113 W Main St, Round Rock, TX',
        startDateTime: '2026-04-12T21:00:00-05:00',
        directionsUrl: 'https://maps.google.com/?q=Round+Rock+Tavern+Round+Rock+TX',
        venueLogo: '/images/logos/m5logo2.webp'
    },
    {
        id: 'private-event-austin-2026-05-09',
        eventName: 'Private Event',
        venueId: 'austin-private-venue',
        venueName: 'Private Venue',
        venueAddress: 'Austin, TX',
        startDateTime: '2026-05-09T19:30:00-05:00',
        directionsUrl: 'https://maps.google.com/?q=Austin+TX',
        venueLogo: '/images/logos/m5logo2.webp'
    }
];

const isValidShow = (value: unknown): value is UpcomingShow => {
    if (!value || typeof value !== 'object') return false;
    const show = value as Record<string, unknown>;
    return (
        typeof show.id === 'string' &&
        typeof show.eventName === 'string' &&
        typeof show.venueName === 'string' &&
        typeof show.venueAddress === 'string' &&
        typeof show.startDateTime === 'string' &&
        typeof show.directionsUrl === 'string'
    );
};

const normalizeShows = (raw: unknown): UpcomingShow[] => {
    if (!Array.isArray(raw)) return defaultUpcomingShows;
    const cleaned = raw.filter(isValidShow).map((show) => ({
        ...show,
        venueId: typeof show.venueId === 'string' && show.venueId.trim().length > 0 ? show.venueId.trim() : undefined,
        venueLogo: typeof show.venueLogo === 'string' ? show.venueLogo : '/images/logos/m5logo2.webp'
    }));
    return cleaned.length > 0 ? cleaned : defaultUpcomingShows;
};

const filterFutureShows = (shows: UpcomingShow[]): UpcomingShow[] => {
    const now = Date.now();
    return shows.filter((show) => {
        const start = new Date(show.startDateTime).getTime();
        return !Number.isNaN(start) && start >= now;
    });
};

export const getUpcomingShows = async (): Promise<UpcomingShow[]> => {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        const stored = await store.get(STORE_KEY, { type: 'json' });
        return filterFutureShows(normalizeShows(stored));
    } catch {
        return filterFutureShows(defaultUpcomingShows);
    }
};

export const setUpcomingShows = async (shows: UpcomingShow[]): Promise<void> => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.setJSON(STORE_KEY, normalizeShows(shows));
};

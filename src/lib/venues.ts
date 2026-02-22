import { getStore } from '@netlify/blobs';

export type NotableVenue = {
    id: string;
    name: string;
    address: string;
    directionsUrl: string;
    logoUrl?: string;
};

const STORE_NAME = 'mach5';
const STORE_KEY = 'notable-venues';

export const defaultNotableVenues: NotableVenue[] = [
    {
        id: 'shooters-round-rock',
        name: 'Shooters',
        address: '1208 N I-35 Frontage Rd, Round Rock, TX',
        directionsUrl: 'https://maps.google.com/?q=Shooters+Round+Rock+TX',
        logoUrl: '/images/logos/m5logo2.webp'
    },
    {
        id: 'round-rock-tavern',
        name: 'Round Rock Tavern',
        address: '113 W Main St, Round Rock, TX',
        directionsUrl: 'https://maps.google.com/?q=Round+Rock+Tavern+Round+Rock+TX',
        logoUrl: '/images/logos/m5logo2.webp'
    },
    {
        id: 'austin-private-venue',
        name: 'Private Venue',
        address: 'Austin, TX',
        directionsUrl: 'https://maps.google.com/?q=Austin+TX',
        logoUrl: '/images/logos/m5logo2.webp'
    }
];

const isVenue = (value: unknown): value is NotableVenue => {
    if (!value || typeof value !== 'object') return false;
    const venue = value as Record<string, unknown>;
    return typeof venue.id === 'string' && typeof venue.name === 'string' && (typeof venue.address === 'string' || typeof venue.city === 'string');
};

const normalizeVenues = (raw: unknown): NotableVenue[] => {
    if (!Array.isArray(raw)) return defaultNotableVenues;
    const cleaned = raw
        .filter(isVenue)
        .map((venue) => ({
            id: venue.id.trim(),
            name: venue.name.trim(),
            address: typeof venue.address === 'string' ? venue.address.trim() : String((venue as unknown as { city?: string }).city ?? '').trim(),
            directionsUrl:
                typeof venue.directionsUrl === 'string' && venue.directionsUrl.trim().length > 0
                    ? venue.directionsUrl.trim()
                    : `https://maps.google.com/?q=${encodeURIComponent(
                          (typeof venue.address === 'string' ? venue.address : String((venue as unknown as { city?: string }).city ?? '')).trim()
                      )}`,
            logoUrl: typeof venue.logoUrl === 'string' && venue.logoUrl.trim().length > 0 ? venue.logoUrl.trim() : '/images/logos/m5logo2.webp'
        }))
        .filter((venue) => venue.id.length > 0 && venue.name.length > 0 && venue.address.length > 0);
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

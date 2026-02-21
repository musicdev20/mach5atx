import { getStore } from '@netlify/blobs';

export type CoveredArtist = {
    id: string;
    name: string;
    songs: string[];
    imageUrl?: string;
};

const STORE_NAME = 'mach5';
const STORE_KEY = 'covered-artists';

export const defaultCoveredArtists: CoveredArtist[] = [
    { id: 'bon-jovi', name: 'Bon Jovi', songs: ["Livin' on a Prayer", 'You Give Love a Bad Name', "Wanted Dead or Alive"] },
    { id: 'def-leppard', name: 'Def Leppard', songs: ['Pour Some Sugar on Me', 'Photograph', 'Rock of Ages'] },
    { id: 'journey', name: 'Journey', songs: ["Don't Stop Believin'", 'Separate Ways (Worlds Apart)', 'Any Way You Want It'] },
    { id: 'guns-n-roses', name: "Guns N' Roses", songs: ['Sweet Child O Mine', 'Welcome to the Jungle', "Paradise City"] },
    { id: 'ac-dc', name: 'AC/DC', songs: ['Back in Black', 'You Shook Me All Night Long', 'Highway to Hell'] },
    { id: 'van-halen', name: 'Van Halen', songs: ['Jump', 'Panama', "Ain't Talkin' Bout Love"] },
    { id: 'motley-crue', name: 'Motley Crue', songs: ['Kickstart My Heart', 'Dr. Feelgood', 'Girls, Girls, Girls'] },
    { id: 'poison', name: 'Poison', songs: ['Nothin But a Good Time', 'Every Rose Has Its Thorn', 'Talk Dirty to Me'] },
    { id: 'aerosmith', name: 'Aerosmith', songs: ['Walk This Way', 'Sweet Emotion', 'Dream On'] },
    { id: 'zz-top', name: 'ZZ Top', songs: ['Tush', 'Sharp Dressed Man', 'La Grange'] },
    { id: 'billy-idol', name: 'Billy Idol', songs: ['Rebel Yell', 'White Wedding', 'Dancing with Myself'] },
    { id: 'green-day', name: 'Green Day', songs: ['Basket Case', 'When I Come Around', 'Longview'] }
];

const isCoveredArtist = (value: unknown): value is CoveredArtist => {
    if (!value || typeof value !== 'object') return false;
    const artist = value as Record<string, unknown>;
    return typeof artist.id === 'string' && typeof artist.name === 'string' && Array.isArray(artist.songs);
};

const normalizeArtists = (raw: unknown): CoveredArtist[] => {
    if (!Array.isArray(raw)) return defaultCoveredArtists;
    const cleaned = raw
        .filter(isCoveredArtist)
        .map((artist) => ({
            id: String(artist.id).trim(),
            name: String(artist.name).trim(),
            songs: (artist.songs as unknown[])
                .map((song) => (typeof song === 'string' ? song.trim() : ''))
                .filter((song) => song.length > 0),
            imageUrl: typeof artist.imageUrl === 'string' && artist.imageUrl.trim().length > 0 ? artist.imageUrl.trim() : undefined
        }))
        .filter((artist) => artist.id.length > 0 && artist.name.length > 0 && artist.songs.length > 0);

    return cleaned.length > 0 ? cleaned : defaultCoveredArtists;
};

export const getCoveredArtists = async (): Promise<CoveredArtist[]> => {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        const stored = await store.get(STORE_KEY, { type: 'json' });
        return normalizeArtists(stored);
    } catch {
        return defaultCoveredArtists;
    }
};

export const setCoveredArtists = async (artists: CoveredArtist[]): Promise<void> => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.setJSON(STORE_KEY, normalizeArtists(artists));
};

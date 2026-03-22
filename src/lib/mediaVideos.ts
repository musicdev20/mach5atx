import { getStore } from '@netlify/blobs';

export type LiveVideo = {
    id: string;
    title: string;
    event: string;
    description: string;
    href: string;
    thumbnail?: string;
};

const STORE_NAME = 'mach5';
const STORE_KEY = 'live-videos';

export const defaultLiveVideos: LiveVideo[] = [
    {
        id: 'mach-5-promo',
        title: 'MACH 5 Promo',
        event: 'Main Promo',
        description: 'Official MACH 5 promo video.',
        thumbnail: 'https://i.ytimg.com/vi/uZjI3LWaCeg/hqdefault.jpg',
        href: 'https://youtu.be/uZjI3LWaCeg?si=WvqXpOVbTHzqrmuo'
    },
    {
        id: 'mach-5-promo-short-1',
        title: 'MACH 5 Promo Short 1',
        event: 'Short',
        description: 'Live short performance clip.',
        thumbnail: 'https://i.ytimg.com/vi/JCtQcf04MLo/hqdefault.jpg',
        href: 'https://youtu.be/JCtQcf04MLo?si=2CI0yAup_mzV9yW0'
    },
    {
        id: 'mach-5-promo-short-2',
        title: 'MACH 5 Promo Short 2',
        event: 'Short',
        description: 'Live short performance clip.',
        thumbnail: 'https://i.ytimg.com/vi/_q7RxuSEb7M/hqdefault.jpg',
        href: 'https://youtu.be/_q7RxuSEb7M?si=ygWZooIxjl0OYqLc'
    },
    {
        id: 'mach-5-promo-short-3',
        title: 'MACH 5 Promo Short 3',
        event: 'Short',
        description: 'Live short performance clip.',
        thumbnail: 'https://i.ytimg.com/vi/0ZWf8kcQQV0/hqdefault.jpg',
        href: 'https://youtu.be/0ZWf8kcQQV0?si=oBI3_mhdD2b7EnYc'
    },
    {
        id: 'mach-5-promo-short-4',
        title: 'MACH 5 Promo Short 4',
        event: 'Short',
        description: 'Live short performance clip.',
        thumbnail: 'https://i.ytimg.com/vi/3nBtxP-CYqc/hqdefault.jpg',
        href: 'https://youtu.be/3nBtxP-CYqc?si=M8GqfhdZm-MS4Viw'
    },
    {
        id: 'mach-5-promo-short-5',
        title: 'MACH 5 Promo Short 5',
        event: 'Short',
        description: 'Live short performance clip.',
        thumbnail: 'https://i.ytimg.com/vi/oV7aUxPhEy8/hqdefault.jpg',
        href: 'https://youtu.be/oV7aUxPhEy8?si=2pzZyOsPyYRXTIzf'
    }
];

const isLiveVideo = (value: unknown): value is LiveVideo => {
    if (!value || typeof value !== 'object') return false;
    const video = value as Record<string, unknown>;
    return (
        typeof video.id === 'string' &&
        typeof video.title === 'string' &&
        typeof video.event === 'string' &&
        typeof video.description === 'string' &&
        typeof video.href === 'string'
    );
};

const normalizeVideos = (raw: unknown): LiveVideo[] => {
    if (!Array.isArray(raw)) return defaultLiveVideos;

    const videos = raw
        .filter(isLiveVideo)
        .map((video) => ({
            id: video.id.trim(),
            title: video.title.trim(),
            event: video.event.trim(),
            description: video.description.trim(),
            href: video.href.trim(),
            thumbnail: typeof video.thumbnail === 'string' && video.thumbnail.trim().length > 0 ? video.thumbnail.trim() : undefined
        }))
        .filter((video) => video.id.length > 0 && video.title.length > 0 && video.event.length > 0 && video.description.length > 0 && video.href.length > 0);

    return videos.length > 0 ? videos : defaultLiveVideos;
};

export const getLiveVideos = async (): Promise<LiveVideo[]> => {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        const stored = await store.get(STORE_KEY, { type: 'json' });
        return normalizeVideos(stored);
    } catch {
        return defaultLiveVideos;
    }
};

export const setLiveVideos = async (videos: LiveVideo[]): Promise<LiveVideo[]> => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    const normalized = normalizeVideos(videos);
    await store.setJSON(STORE_KEY, normalized);
    return normalized;
};

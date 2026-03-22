import { getStore } from '@netlify/blobs';
import { importMediaAudioFromUrl, isExternalAudioUrl, isMediaAudioStoredInternally } from './mediaAudioStorage';

export type LiveAudioRecording = {
    id: string;
    title: string;
    src: string;
};

const STORE_NAME = 'mach5';
const STORE_KEY = 'live-audio-recordings';

export const defaultLiveAudioRecordings: LiveAudioRecording[] = [
    { id: 'acdc-highway-to-hell', title: 'AC/DC - You Shook Me All Night Long / Highway to Hell', src: '/audio/01-you-shook-me-all-night-long-highway-to-hell.mp3' },
    { id: 'journey-medley', title: 'Journey - Stone in Love / Any Way You Want It / Separate Ways', src: '/audio/02-journey-stone-in-love-any-way-you-want-it-separate-ways.mp3' },
    { id: 'kryptonite', title: '3 Doors Down - Kryptonite', src: '/audio/03-3-doors-down-kryptonite.mp3' },
    { id: 'just-dance', title: 'Lady Gaga - Just Dance', src: '/audio/04-lady-gaga-just-dance.mp3' },
    { id: 'hella-good', title: 'No Doubt - Hella Good', src: '/audio/05-no-doubt-hella-good.mp3' },
    { id: 'heart-of-glass', title: 'Miley Cyrus - Heart of Glass', src: '/audio/06-heart-of-glass.mp3' },
    { id: 'barracuda', title: 'Heart - Barracuda', src: '/audio/07-barracuda.mp3' },
    { id: 'cars', title: 'Gary Numan / Nine Inch Nails - Cars', src: '/audio/08-gary-numan-nine-inch-nails-cars.mp3' },
    { id: 'tainted-love', title: 'Soft Cell - Tainted Love', src: '/audio/09-tainted-love.mp3' },
    { id: 'enter-sandman', title: 'Metallica - Enter Sandman', src: '/audio/10-enter-sandman.mp3' },
    { id: 'rebel-yell', title: 'Billy Idol - Rebel Yell', src: '/audio/11-rebel-yell.mp3' },
    { id: 'man-in-the-box', title: 'Alice in Chains - Man in the Box', src: '/audio/12-man-in-the-box.mp3' }
];

const isLiveAudioRecording = (value: unknown): value is LiveAudioRecording => {
    if (!value || typeof value !== 'object') return false;
    const recording = value as Record<string, unknown>;
    return typeof recording.id === 'string' && typeof recording.title === 'string' && typeof recording.src === 'string';
};

const normalizeRecordings = (raw: unknown): LiveAudioRecording[] => {
    if (!Array.isArray(raw)) return defaultLiveAudioRecordings;

    return raw
        .filter(isLiveAudioRecording)
        .map((recording) => ({
            id: recording.id.trim(),
            title: recording.title.trim(),
            src: recording.src.trim()
        }))
        .filter((recording) => recording.id.length > 0 && recording.title.length > 0 && recording.src.length > 0);
};

export const getLiveAudioRecordings = async (): Promise<LiveAudioRecording[]> => {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        const stored = await store.get(STORE_KEY, { type: 'json' });
        return normalizeRecordings(stored);
    } catch {
        return defaultLiveAudioRecordings;
    }
};

export const setLiveAudioRecordings = async (recordings: LiveAudioRecording[]): Promise<LiveAudioRecording[]> => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    const normalized = normalizeRecordings(recordings);
    const localized = await Promise.all(
        normalized.map(async (recording) => {
            if (isMediaAudioStoredInternally(recording.src) || recording.src.startsWith('/')) {
                return recording;
            }

            if (!isExternalAudioUrl(recording.src)) {
                throw new Error(`Unsupported audio source for ${recording.title}`);
            }

            const storedAudio = await importMediaAudioFromUrl(recording.id, recording.src);
            return {
                ...recording,
                src: storedAudio.url
            };
        })
    );

    await store.setJSON(STORE_KEY, localized);
    return localized;
};

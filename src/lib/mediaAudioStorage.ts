import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'mach5';
const KEY_PREFIX = 'media-audio/';

const extensionByContentType: Record<string, string> = {
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/m4a': 'm4a',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm'
};

const slug = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'recording';

const inferExtension = (contentType: string | null | undefined, filename?: string | null) => {
    const normalizedContentType = contentType?.split(';')[0]?.trim().toLowerCase();
    if (normalizedContentType && extensionByContentType[normalizedContentType]) {
        return extensionByContentType[normalizedContentType];
    }

    if (filename && filename.includes('.')) {
        const ext = filename.split('.').pop()?.trim().toLowerCase();
        if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
    }

    return 'mp3';
};

const buildKey = (recordingId: string, suffix: string, contentType?: string | null, filename?: string | null) =>
    `${KEY_PREFIX}${slug(recordingId)}-${suffix}.${inferExtension(contentType, filename)}`;

export const buildMediaAudioUrl = (key: string) => `/api/media-audio?key=${encodeURIComponent(key)}`;

export const isMediaAudioStoredInternally = (value: string) => value.startsWith('/api/media-audio?key=');

export const isExternalAudioUrl = (value: string) => /^https?:\/\//i.test(value);

export const storeMediaAudio = async (input: {
    recordingId: string;
    data: ArrayBuffer;
    contentType?: string | null;
    filename?: string | null;
    suffix?: string;
}) => {
    const key = buildKey(input.recordingId, input.suffix ?? randomUUID(), input.contentType, input.filename);
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.set(key, input.data, {
        metadata: {
            contentType: input.contentType || 'application/octet-stream'
        }
    });
    return {
        key,
        url: buildMediaAudioUrl(key)
    };
};

export const importMediaAudioFromUrl = async (recordingId: string, url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch audio recording from ${url}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.toLowerCase().startsWith('audio/')) {
        throw new Error(`Audio URL did not return playable audio for ${url}`);
    }

    const data = await response.arrayBuffer();
    const digest = createHash('sha256').update(url).digest('hex').slice(0, 12);
    return storeMediaAudio({
        recordingId,
        data,
        contentType,
        suffix: digest
    });
};

export const getStoredMediaAudio = async (key: string) => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return null;

    return {
        data: result.data,
        contentType: typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : 'application/octet-stream'
    };
};

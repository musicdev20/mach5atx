import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'mach5';
const KEY_PREFIX = 'venue-logos/';

export const fallbackVenueLogo = '/images/logos/m5logo2.webp';

const extensionByContentType: Record<string, string> = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp'
};

const slug = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'venue';

const inferExtension = (contentType: string | null | undefined, filename?: string | null) => {
    const normalizedContentType = contentType?.split(';')[0]?.trim().toLowerCase();
    if (normalizedContentType && extensionByContentType[normalizedContentType]) {
        return extensionByContentType[normalizedContentType];
    }

    if (filename && filename.includes('.')) {
        const ext = filename.split('.').pop()?.trim().toLowerCase();
        if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
    }

    return 'webp';
};

const buildKey = (venueId: string, suffix: string, contentType?: string | null, filename?: string | null) =>
    `${KEY_PREFIX}${slug(venueId)}-${suffix}.${inferExtension(contentType, filename)}`;

export const buildVenueLogoUrl = (key: string) => `/api/venue-logo?key=${encodeURIComponent(key)}`;

export const isVenueLogoStoredInternally = (value: string) => value.startsWith('/api/venue-logo?key=');

export const isExternalUrl = (value: string) => /^https?:\/\//i.test(value);

export const storeVenueLogo = async (input: {
    venueId: string;
    data: ArrayBuffer;
    contentType?: string | null;
    filename?: string | null;
    suffix?: string;
}) => {
    const key = buildKey(input.venueId, input.suffix ?? randomUUID(), input.contentType, input.filename);
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.set(key, input.data, {
        metadata: {
            contentType: input.contentType || 'application/octet-stream'
        }
    });
    return {
        key,
        url: buildVenueLogoUrl(key)
    };
};

export const importVenueLogoFromUrl = async (venueId: string, url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch venue logo from ${url}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`Venue logo URL did not return an image for ${url}`);
    }

    const data = await response.arrayBuffer();
    const digest = createHash('sha256').update(url).digest('hex').slice(0, 12);
    return storeVenueLogo({
        venueId,
        data,
        contentType,
        suffix: digest
    });
};

export const getStoredVenueLogo = async (key: string) => {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return null;

    return {
        data: result.data,
        contentType: typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : 'application/octet-stream'
    };
};

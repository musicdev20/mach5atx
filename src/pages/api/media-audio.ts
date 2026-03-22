import type { APIRoute } from 'astro';
import { getStoredMediaAudio, storeMediaAudio } from '../../lib/mediaAudioStorage';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });

export const GET: APIRoute = async ({ url }) => {
    const key = url.searchParams.get('key')?.trim();
    if (!key) {
        return new Response('Not Found', { status: 404 });
    }

    const stored = await getStoredMediaAudio(key);
    if (!stored) {
        return new Response('Not Found', { status: 404 });
    }

    return new Response(stored.data, {
        headers: {
            'content-type': stored.contentType,
            'cache-control': 'public, max-age=31536000, immutable'
        }
    });
};

export const POST: APIRoute = async ({ request }) => {
    if (!isAuthorized(request)) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');
    const recordingIdValue = formData?.get('recordingId');
    const recordingId = typeof recordingIdValue === 'string' ? recordingIdValue.trim() : '';

    if (!(file instanceof File)) {
        return json({ error: 'Audio file is required' }, 400);
    }

    if (!recordingId) {
        return json({ error: 'Recording ID is required' }, 400);
    }

    if (!file.type.toLowerCase().startsWith('audio/')) {
        return json({ error: 'Only audio uploads are allowed' }, 400);
    }

    const stored = await storeMediaAudio({
        recordingId,
        data: await file.arrayBuffer(),
        contentType: file.type,
        filename: file.name
    });

    return json({ ok: true, src: stored.url, key: stored.key });
};

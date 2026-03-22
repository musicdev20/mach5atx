import type { APIRoute } from 'astro';
import { getLiveAudioRecordings, setLiveAudioRecordings } from '../../lib/mediaRecordings';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

export const GET: APIRoute = async () => {
    const recordings = await getLiveAudioRecordings();
    return new Response(JSON.stringify({ recordings }), {
        headers: { 'content-type': 'application/json' }
    });
};

export const PUT: APIRoute = async ({ request }) => {
    if (!isAuthorized(request)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' }
        });
    }

    const body = await request.json().catch(() => null);
    const recordings = body?.recordings;
    if (!Array.isArray(recordings)) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
        });
    }

    try {
        const savedRecordings = await setLiveAudioRecordings(recordings);
        return new Response(JSON.stringify({ ok: true, recordings: savedRecordings }), {
            headers: { 'content-type': 'application/json' }
        });
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Failed to save recordings'
            }),
            {
                status: 400,
                headers: { 'content-type': 'application/json' }
            }
        );
    }
};

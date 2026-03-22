import type { APIRoute } from 'astro';
import { getLiveVideos, setLiveVideos } from '../../lib/mediaVideos';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

export const GET: APIRoute = async () => {
    const videos = await getLiveVideos();
    return new Response(JSON.stringify({ videos }), {
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
    const videos = body?.videos;
    if (!Array.isArray(videos)) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
        });
    }

    try {
        const savedVideos = await setLiveVideos(videos);
        return new Response(JSON.stringify({ ok: true, videos: savedVideos }), {
            headers: { 'content-type': 'application/json' }
        });
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Failed to save videos'
            }),
            {
                status: 400,
                headers: { 'content-type': 'application/json' }
            }
        );
    }
};

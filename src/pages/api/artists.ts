import type { APIRoute } from 'astro';
import { getCoveredArtists, setCoveredArtists } from '../../lib/artists';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

export const GET: APIRoute = async () => {
    const artists = await getCoveredArtists();
    return new Response(JSON.stringify({ artists }), {
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
    const artists = body?.artists;
    if (!Array.isArray(artists)) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
        });
    }

    await setCoveredArtists(artists);
    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' }
    });
};

import type { APIRoute } from 'astro';
import { getUpcomingShows, setUpcomingShows } from '../../lib/shows';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

export const GET: APIRoute = async () => {
    const shows = await getUpcomingShows();
    return new Response(JSON.stringify({ shows }), {
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
    const shows = body?.shows;
    if (!Array.isArray(shows)) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
        });
    }

    await setUpcomingShows(shows);
    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' }
    });
};

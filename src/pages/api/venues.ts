import type { APIRoute } from 'astro';
import { getNotableVenues, setNotableVenues } from '../../lib/venues';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

export const GET: APIRoute = async () => {
    const venues = await getNotableVenues();
    return new Response(JSON.stringify({ venues }), {
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
    const venues = body?.venues;
    if (!Array.isArray(venues)) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
        });
    }

    await setNotableVenues(venues);
    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' }
    });
};

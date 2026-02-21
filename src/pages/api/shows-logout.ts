import type { APIRoute } from 'astro';
import { buildClearCookie } from '../../lib/showsAuth';

export const prerender = false;

export const POST: APIRoute = async () => {
    return new Response(JSON.stringify({ ok: true }), {
        headers: {
            'content-type': 'application/json',
            'set-cookie': buildClearCookie()
        }
    });
};

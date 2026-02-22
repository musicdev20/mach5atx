import type { APIRoute } from 'astro';
import { buildAuthCookie, isShowsAdminEnabled, verifyPassword } from '../../lib/showsAuth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    if (!isShowsAdminEnabled()) {
        return new Response(JSON.stringify({ error: 'Shows admin is not configured' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }

    const body = await request.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!verifyPassword(password)) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
            status: 401,
            headers: { 'content-type': 'application/json' }
        });
    }

    const cookie = buildAuthCookie();
    if (!cookie) {
        return new Response(JSON.stringify({ error: 'Shows admin is not configured' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json', 'set-cookie': cookie }
    });
};

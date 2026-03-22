import type { APIRoute } from 'astro';
import { fallbackVenueLogo, getStoredVenueLogo, storeVenueLogo } from '../../lib/venueLogos';
import { isAuthorized } from '../../lib/showsAuth';

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });

export const GET: APIRoute = async ({ url }) => {
    const key = url.searchParams.get('key')?.trim();
    if (!key) return Response.redirect(fallbackVenueLogo, 302);

    const stored = await getStoredVenueLogo(key);
    if (!stored) return Response.redirect(fallbackVenueLogo, 302);

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
    const venueIdValue = formData?.get('venueId');
    const venueId = typeof venueIdValue === 'string' ? venueIdValue.trim() : '';

    if (!(file instanceof File)) {
        return json({ error: 'Image file is required' }, 400);
    }

    if (!venueId) {
        return json({ error: 'Venue ID is required' }, 400);
    }

    if (!file.type.toLowerCase().startsWith('image/')) {
        return json({ error: 'Only image uploads are allowed' }, 400);
    }

    const stored = await storeVenueLogo({
        venueId,
        data: await file.arrayBuffer(),
        contentType: file.type,
        filename: file.name
    });

    return json({ ok: true, logoUrl: stored.url, key: stored.key });
};

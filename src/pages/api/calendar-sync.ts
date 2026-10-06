import type { APIRoute } from 'astro';
import { getCalendarSyncStatus, isCalendarSyncConfigured, runCalendarSync } from '../../lib/calendarSync';
import { isAuthorized, isInternalSyncCall } from '../../lib/showsAuth';

export const prerender = false;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });

// Last sync result, for the admin Shows tab.
export const GET: APIRoute = async ({ request }) => {
    if (!isAuthorized(request)) return json({ error: 'Unauthorized' }, 401);
    return json({ configured: isCalendarSyncConfigured(), status: await getCalendarSyncStatus() });
};

// Runs a sync now. Called by the admin's button and by the scheduled function.
export const POST: APIRoute = async ({ request }) => {
    const scheduled = isInternalSyncCall(request);
    if (!scheduled && !isAuthorized(request)) return json({ error: 'Unauthorized' }, 401);
    if (!isCalendarSyncConfigured()) {
        return json({ configured: false, error: 'Calendar sync is not set up yet. Add GOOGLE_CALENDAR_ICS_URL in the Netlify environment variables.' }, 400);
    }
    const status = await runCalendarSync(scheduled ? 'schedule' : 'manual');
    return json({ configured: true, status }, status.ok ? 200 : 502);
};

// Scheduled function: asks the site to pull the Google Calendar feed.
// The work itself lives in /api/calendar-sync so the admin's "Sync Google Calendar" button and
// this timer run exactly the same code. Scheduled functions only run on the published deploy.
import { createHash } from 'node:crypto';

export default async (_request, context) => {
    const siteUrl = context?.site?.url || process.env.URL;
    const password = process.env.SHOWS_ADMIN_PASSWORD;
    if (!siteUrl || !password) {
        console.error('calendar-sync: missing site URL or SHOWS_ADMIN_PASSWORD; nothing was synced.');
        return new Response('not configured', { status: 500 });
    }

    const key = createHash('sha256').update(password).digest('hex');
    const response = await fetch(new URL('/api/calendar-sync', siteUrl), {
        method: 'POST',
        // Astro rejects a POST with no content type unless it is same-origin.
        headers: { 'content-type': 'application/json', 'x-mach5-sync': key },
        body: '{}'
    });
    const text = await response.text();
    console.log(`calendar-sync: ${response.status} ${text.slice(0, 2000)}`);
    return new Response(text, { status: response.status });
};

export const config = {
    schedule: '*/30 * * * *'
};

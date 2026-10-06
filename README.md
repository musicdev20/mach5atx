# Astro on Netlify Platform Starter

[Live Demo](https://astro-platform-starter.netlify.app/)

A modern starter based on Astro.js, Tailwind, and [Netlify Core Primitives](https://docs.netlify.com/core/overview/#develop) (Edge Functions, Image CDN, Blobs).

## Astro Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Deploying to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-platform-starter)

## Developing Locally

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.20.8+.                                    |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management. |

1. Clone this repository, then run `npm install` in its root directory.

2. Recommended: link your local repository to a Netlify project. This will ensure you're using the same runtime version for both local development and your deployed project.

```
netlify link
```

3. Run the Astro.js development server:

```
npm run dev
```

## Google Calendar sync (shows)

Shows on the band's Google Calendar are published to the site automatically.

- **What counts as a show:** an event titled `MACH 5 at <venue>` (`MACH 5 @ <venue>` also works). Everything else on the calendar is ignored.
- **Start time:** the calendar keeps shows as all-day entries with the time typed at the end of the title (`MACH 5 at Round Rock Tavern 8pm`, `MACH 5 at Krause's Cafe - 6:30-9`). That time is used and left out of the show and venue names; with no am/pm it is taken as evening. A timed calendar entry uses its own start time instead. An all-day entry with no time in the title gets the usual time of other shows at that venue (8:00 PM if there are none) and is flagged in the admin.
- **Private gigs:** an event whose title contains "private", or whose Google visibility is set to Private, is listed as "Private Event" at the Private Venue with no title, venue or address.
- **Venues:** the venue is matched against the saved venues by name, then by street address. No match creates a new venue from the event's Location field.
- **Hand-entered shows win:** if a show with the same date and venue was already added in the admin, the calendar copy is skipped.
- **The calendar owns synced shows:** their IDs start with `gcal-`. Edit or delete them in Google Calendar; changes made in the admin are undone by the next sync.

Setup: set `GOOGLE_CALENDAR_ICS_URL` in the Netlify environment variables to the calendar's "Secret address in iCal format" (Google Calendar → Settings → the calendar → Integrate calendar). Treat it like a password. Optional: `SHOWS_TIME_ZONE` (default `America/Chicago`). Both are read from `process.env` at request time, so for local testing start the dev server with the variable set in the shell (or use `netlify dev`); a line in `.env` alone is not picked up.

The sync runs every 30 minutes on the published deploy (`netlify/functions/calendar-sync.mjs`) and on demand from **Sync Google Calendar** in the admin Shows tab, which also shows the result of the last run. Code: `src/lib/calendarFeed.ts` (rules, no I/O), `src/lib/calendarSync.ts` (fetch and storage), `src/pages/api/calendar-sync.ts`.

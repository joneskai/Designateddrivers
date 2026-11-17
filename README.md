# Designated Drivers — The Annual Golf Championship

A website for a four-player, twelve-round, 2v2 Ambrose championship between mates. Open it, check the leaderboard, submit a round or a fine, done. There are no accounts, passwords or login screens.

It is plain HTML, CSS and JavaScript with no build step. Data lives in Supabase, so every phone sees the same scoreboard, and the site deploys to Vercel as static files.

```
├── index.html            page shell (header, nav, modals)
├── style.css             all styles (desktop + mobile)
├── engine.js             scoring rules: pure, deterministic, unit-tested
├── data.js               data layer: demo store (browser only) + Supabase store
├── app.js                pages, Championship Race chart, forms
├── config.js             Supabase URL + publishable key (empty = demo mode)
├── config.example.js     template
├── supabase-schema.sql   the whole database: tables, rules, functions, seed data
├── vendor/               Chart.js 4.4.1 + supabase-js 2.45.4 (unmodified, MIT)
├── assets/               logo, player photos, golf course image
└── tests/                scoring tests, browser tests, database tests
```

## The four sections

- **Clubhouse**: Championship Race chart, standings, latest round, key stats.
- **Fixtures**: all 12 rounds. Tap a round to enter or correct its result, change its date and course, swap two unplayed pairings, or delete a result entered by mistake.
- **Players**: profile cards, then a profile each with biography, stats, points chart, partner chemistry, results history and fines.
- **Fines**: the pot, who owes what, the full register and the tariff. Anyone can issue, correct, mark as paid or remove a fine, and add offences to the tariff.

**Submit Result** (top right, or the round button on a phone) is one screen: round, course, date, two gross team scores, submit. Points, standings, the chart and every profile update straight away.

## Updating the database (do this once after pulling this version)

1. In Supabase, open **SQL Editor → New query**.
2. Paste the whole of `supabase-schema.sql` and click **Run**.

The same file sets up a new project and upgrades an existing one. It keeps every result, fixture, fine, payment, season and player. It removes the old administrators list and the Tee Sheet tables, which the site no longer uses. It is safe to run again.

Until it has been run on an existing project, the site still shows everything, but saving a result or fine reports that the database needs updating.

Old sign-in users are not needed any more. You can delete them under **Authentication → Users** if you like; leaving them does no harm.

## How it stays safe without logins

Anyone who has the link can record and correct results and fines. That is the point, and it is also the trade-off: **there is no way to tell one visitor from another, so a stranger who finds the link could enter or delete scores.** For four mates and an unlisted address the risk is small, and these are the protections in place:

| Protection | What it does |
|---|---|
| No direct table access | Row Level Security is on for every table. Visitors can read the championship but cannot insert, update or delete anything directly. |
| Guarded functions only | The site changes data only by calling functions in `supabase-schema.sql`. Each one validates its input: scores 18–200, no future dates, sensible amounts, text length limits, real players and rounds only. |
| Duplicate protection | A round can hold one result (the database enforces it), played rounds are not offered in the submit form, the save button locks while saving, and an identical fine within ten seconds is refused. |
| Rate limits | At most 30 changes per 10 minutes from one address and 300 per day in total. A script cannot flood the scoreboard. |
| Hidden bot field | Forms carry a field people never see; anything that fills it in is ignored. |
| Undo trail | Every change is recorded with the values it replaced, in a table visitors cannot read. A mistake or vandalism can be put back. |
| No secrets in the site | `config.js` holds only the project URL and the publishable key, which are designed to be public. Never put the `service_role` key, a `sb_secret_…` key or the database password anywhere in this repository. |

What these do **not** do: stop a determined person who has the link from entering plausible-looking wrong scores by hand.

### If that ever happens: the club code

One line in the SQL Editor switches on a shared code:

```sql
select public.set_club_code('birdie24');
```

Each phone is then asked for the code the first time it saves something, and remembers it. Reading the site stays open to everyone. Switch it off again with `select public.set_club_code(null);`.

### Seeing and undoing changes

```sql
select created_at, action, detail from public.dd_activity order by created_at desc limit 50;
```

`detail` includes a `previous` entry for edits and deletions, so the old values can be re-entered through the site.

## Preview in demo mode

Add `?demo` to the address (for example `https://your-site.vercel.app/?demo`), or leave `config.js` empty.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/?demo. A gold banner marks demo mode. The demo season is fictional and everything you do is saved only in that browser; demo mode never connects to Supabase.

## Starting from scratch

1. Create a project at https://supabase.com, then run `supabase-schema.sql` in the SQL Editor. This seeds the four players, the ten default fines and Season 01 with 12 balanced fixtures and no results.
2. In **Project Settings → API Keys**, copy the Project URL and the Publishable key into `config.js`.
3. Push to GitHub and import the repository in Vercel (Framework Preset **Other**, no build command).

Results and fines save to Supabase immediately, so **nothing needs redeploying after entering data**. With the repository connected to Vercel, every push to `main` deploys automatically. Vercel never touches the database: when `supabase-schema.sql` changes, run it yourself in the SQL Editor.

## Things you set in the SQL Editor

```sql
-- A player's biography (shown on their profile)
update public.players set bio = 'Short game wizard. Long game hazard.' where id = 'jones';

-- A hosted photo instead of the file in assets/
update public.players set image_url = 'https://…/jones.jpg' where id = 'jones';

-- Start another season with 12 balanced fixtures (earlier seasons are kept)
select public.create_season('Season 02', 2027);

-- Mark a season finished
update public.seasons set status = 'completed' where number = 1;
```

Player photos can also be replaced by overwriting `assets/jones.png`, `fitz.png`, `pirie.png` and `forrest.png` (square, about 512×512). The ones in the repository are neutral placeholders.

For instant updates between phones, run the `alter publication supabase_realtime …` line at the bottom of `supabase-schema.sql`. Without it, pages refresh whenever they are reopened.

## Competition rules (as implemented in `engine.js`)

- Every round is a 2v2 two-person Ambrose match on **gross** strokes with no handicaps. The lowest gross wins.
- **Win = 2 points** for each winner, **draw = 1 point** each, **loss = 0**. The maximum is 24 points per player.
- The schedule rotates Jones+Fitz v Pirie+Forrest → Jones+Pirie v Fitz+Forrest → Jones+Forrest v Fitz+Pirie, four times over, so every player partners every other player four times.
- **Tiebreakers:** points → total wins → cumulative stroke differential. If players are still level the position is shared (shown as `1=`).
- Points are never stored. They are worked out from the results every time, so correcting an earlier round recalculates everything after it.
- Fines never affect championship points.

## Tests

```bash
node tests/engine.test.js
```
25 checks of the scoring rules, tiebreakers, schedule balance and recalculation.

The browser tests need Playwright and a local server on port 8765:
```bash
python3 -m http.server 8765
```
```bash
node tests/e2e.demo.js http://localhost:8765
```
```bash
node tests/e2e.live-mock.js http://localhost:8765
```
`e2e.demo.js` runs the whole site at desktop and iPhone widths with no login: submit, correct and delete a result; issue, correct, pay and delete a fine; duplicate and bot protection; profiles. `e2e.live-mock.js` runs the Supabase path against a mocked client: every write is a function call, the club code flow, and the message shown before the database is updated.

To check the database rules on a local PostgreSQL scratch database:
```bash
psql -d scratch -f tests/supabase-shim.sql -f supabase-schema.sql -f tests/schema.test.sql
```
`supabase-shim.sql` imitates Supabase's built-in roles for testing only; never run it on Supabase.

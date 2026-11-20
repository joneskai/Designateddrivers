# Designated Drivers — The Annual Golf Championship

A website for a four-player, twelve-round, 2v2 Ambrose championship between mates. Open it, check the leaderboard, submit a round or a fine, done. There are no accounts, passwords or login screens.

It is plain HTML, CSS and JavaScript with no build step. Data lives in Supabase, so every phone sees the same scoreboard, and the site deploys to Vercel as static files.

```
├── index.html            page shell (header, nav, modals)
├── style.css             all styles (desktop + mobile)
├── engine.js             scoring rules: pure, deterministic, unit-tested
├── teetime.js            Tee Time rules: the 21-day window, availability, best overlaps
├── data.js               data layer: demo store (browser only) + Supabase store
├── app.js                pages, Championship Race chart, forms
├── config.js             Supabase URL + publishable key (empty = demo mode)
├── config.example.js     template
├── supabase-schema.sql   the whole database: tables, rules, functions, seed data
├── vendor/               Chart.js 4.4.1 + supabase-js 2.45.4 (unmodified, MIT)
├── assets/               logo, player photos, golf course image
└── tests/                scoring tests, browser tests, database tests
```

## The sections

- **Clubhouse**: Championship Race chart, standings, latest round, key stats.
- **Fixtures**: all 12 rounds. Tap a round to enter or correct its result, change its date and course, swap two unplayed pairings, or delete a result entered by mistake.
- **Tee Time**: works out when the next round can be played. See below.
- **Players**: profile cards, then a profile each with a player card (favourite quote, best shot, biggest strength, biggest weakness — anyone can fill it in), stats, points chart, partner chemistry, results history and fines.
- **Players → Fines**: the Players tab has a Players / Fines switch at the top. Fines shows the pot, who owes what, the full register and the tariff. Anyone can issue, correct, mark as paid or remove a fine.

The tariff is:

| Offence | Fine |
|---|---|
| Not at course 10 mins before tee-off | $5 |
| No-show | $20 |
| Ball in water | $2 |
| Fails to pass ladies' tees | $5 |
| Air swing | $5 |

Running `supabase-schema.sql` sets the tariff to exactly these five. Older offences are retired rather than deleted, so fines already recorded keep their offence name and the amount charged at the time.

**The + button.** On a phone the bottom bar is Clubhouse · Fixtures · **+** · Tee Time · Players. The centre + opens three shortcuts into the existing flows:

- **Record Round**: the results form. One screen: round, course, date, two gross team scores, submit. Points, standings, the chart and every profile update straight away.
- **Add Fine**: the fine form (pick the offender and the offence).
- **Schedule Fixture**: the next step on Tee Time for the next round, whatever it is: proposing the best 4/4 time, setting the tee time once all four have confirmed, changing a scheduled round, or filling in availability if no time works yet.

On a computer the top navigation is Clubhouse · Fixtures · Tee Time · Players, and the **Submit Result** button opens the results form.

## Tee Time

Open Tee Time → tap your name → tap the times you can play → the best date appears at the top.

- **Which round:** the next round from Fixtures that isn't locked in yet, with its pairings. Nothing is created separately. A round counts as locked in once all four have confirmed a date, its tee time is set, or a date was entered for it on Fixtures. Locked-in rounds stay at the top of the page (with Set tee time / Change / Cancel) and the calendar moves on to the following round.
- **When availability opens:** three weeks after the previous round: the last one played, or the last one locked in if that's later (lock Round 1 in for Sun 13 Dec and Round 2's calendar opens Fri 1 Jan). The calendar starts on the Friday of the weekend in which that 21-day mark falls (or the next Friday if it lands Monday–Thursday). Round on Sun 13 Dec 2026 → calendar opens Fri 1 Jan 2027. If those weekends have already passed, it starts from the current weekend instead, so it can never get stuck.
- **The calendar:** Friday, Saturday and Sunday, each with Early AM, Late AM, Lunch, Early PM and Twilight. Four weekends to start; "Show 2 more weekends" adds more and keeps everything already entered. Tap a cell to toggle it, tap a day name to fill or clear the day, or use "Free all weekend" / "Can't make it". Those two light up when on; tap again to switch off, which puts the weekend back how it was. Tap anyone's face on a weekend to switch to editing their availability.
- **Answered vs not answered:** a weekend counts as answered once you tick at least one time (anything left grey then means you can't play) or press "Can't make it". Either way your icon on that weekend turns green. Ticking a time and unticking it again leaves the weekend unanswered. An unanswered weekend shows as "not answered", and the site never treats that as a no.
- **Best overlaps:** the top three times, all-four times first and then the earliest. Only a 4/4 time is ever recommended; 3/4 times show as alternatives with who can't make it or who hasn't answered. Preferred windows can be set in `config.js` (`teePreferredWindows: ['early_am', 'late_am']`); by default the earliest window wins a tie.
- **Propose → confirm → schedule:** "Propose round" (or tap any overlap) suggests a date and window, and the proposer is marked as in. Each player taps "I'm in" or "Can't make it". Once all four are in, enter the tee-off time and course; that writes the date, time and course onto the fixture itself, so Fixtures and the Clubhouse show it. It records the plan only. Booking the course is still up to you.
- **After the round:** enter the result as usual. Tee Time moves to the next round and opens its calendar three weeks after the date played. Correcting or deleting a result recalculates it automatically.

Your name choice is remembered on each phone. Every tap shows instantly and saves within half a second ("Saving…" / "Saved"). If the signal drops, taps stay on screen, are kept on the phone (even if the page is closed) and are sent automatically when the connection is back. Open pages check for other people's changes every 15 seconds on Tee Time and every 45 seconds elsewhere, and moving between pages always fetches the latest. If two phones change availability at the same moment, the database merges them cell by cell, so nobody's taps are lost.

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
| Rate limits | At most 30 changes per 10 minutes from one address and 300 per day in total. Tee Time availability is saved a few taps at a time and has its own, roomier limit (240 saves per 10 minutes, 3,000 per day), so filling in a calendar never uses up the allowance for results and fines. |
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
-- Clear a player card (it is normally edited on the player's profile page)
update public.players set quote = null, best_shot = null, strength = null, weakness = null where id = 'jones';

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
```bash
node tests/teetime.test.js
```
18 checks of the Tee Time rules: the 21-day window for every weekday and across month, year and leap-year boundaries; Perth dates; missing versus "can't"; 4/4 versus 3/4; extending; ranking.

```bash
node tests/e2e.teetime.js http://localhost:8765
```
The whole Tee Time flow at desktop and iPhone widths: picking a name, ticking, bulk actions and undo, persistence after refresh, a second device, propose → confirm → schedule → Fixtures and Clubhouse, entering, correcting and deleting the result, and extending when no time works.

```bash
node tests/e2e.review.js http://localhost:8765
```
Edge cases from the full-site review: score validation and a triple-tapped save, draws, correcting and deleting results, a date set on Fixtures locking a round in, a locked-in date that has passed, a proposal whose date has passed, switching name mid-save, retiring and restoring an offence, swapping pairings, the end of a season, and resetting demo data.

```bash
node tests/e2e.multidevice.js
```
Four phones against a real local PostgreSQL loaded with `supabase-schema.sql` (needs `psql`; set `DD_PG_HOST`, `DD_PG_PORT`, `DD_PG_USER`). A small stand-in for Supabase's REST API runs every request as the anonymous visitor, so security rules, the guarded functions and simultaneous transactions are all real. It covers four people tapping at once, one person on two devices, a phone losing signal or closing the page, two people pressing Propose together, everyone confirming at once, setting the tee time, and recording the result.

`e2e.demo.js` runs the whole site at desktop and iPhone widths with no login: submit, correct and delete a result; issue, correct, pay and delete a fine; duplicate and bot protection; profiles. `e2e.live-mock.js` runs the Supabase path against a mocked client: every write is a function call, the club code flow, and the message shown before the database is updated.

To check the database rules on a local PostgreSQL scratch database:
```bash
psql -d scratch -f tests/supabase-shim.sql -f supabase-schema.sql -f tests/schema.test.sql
```
and, on a second fresh scratch database, `tests/teetime.schema.test.sql` (simultaneous edits merging, proposals, confirmations, scheduling).
`supabase-shim.sql` imitates Supabase's built-in roles for testing only; never run it on Supabase.

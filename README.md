# Designated Drivers — The Annual Golf Championship

A static website for a four-player, twelve-round, 2v2 Ambrose championship. It shows live standings, the Championship Race chart, fixtures, player profiles, fines and records, and has **The Tee Sheet** for agreeing a date for each round without the group-chat back-and-forth. It's plain HTML, CSS and vanilla JavaScript with no build step. Data lives in Supabase and the site deploys to Vercel as static files.

```
designated-drivers/
├── index.html            app shell (header, nav, modals)
├── style.css             all styles (desktop + mobile)
├── engine.js             scoring engine: pure, deterministic, unit-tested
├── teesheet.js           Tee Sheet logic: date ranking, time zones, WhatsApp text, .ics export
├── data.js               data layer: DemoStore (browser only) + SupabaseStore
├── app.js                pages, Championship Race chart, forms, routing
├── config.js             your Supabase URL + publishable key (empty = demo mode)
├── config.example.js     documented template
├── supabase-schema.sql   tables, constraints, RLS, RPC functions, seed data
├── migrations/           002_tee_sheet.sql (+ rollback): scheduling tables and player logins
├── vendor/               Chart.js 4.4.1 + supabase-js 2.45.4 (unmodified, MIT)
├── assets/               logo, player photos, golf course image
└── tests/                engine unit tests, browser tests, SQL security tests
```

---

## 1. Preview in demo mode

Demo mode runs whenever `config.js` has empty values, or when you add `?demo` to any URL.

```bash
cd designated-drivers
```
```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. `npx serve .` works too, as does any static server. Opening `index.html` straight from disk also works in most browsers.

- A **gold banner** at the top marks demo mode. The demo season is fictional (Rounds 01–04 played, a handful of fines, and a Round 05 tee-sheet poll waiting on Forrest).
- Demo mode has no logins, so the Tee Sheet shows a "voting as" picker to try each player. That picker exists only in demo mode; on the real site a player's identity comes from their login.
- Everything you do is saved **only in this browser** (localStorage). Demo mode never connects to Supabase, so demo data can't reach production.
- **Reset demo** in the banner or footer restores the original demo data.
- Everyone counts as an administrator in demo mode, so you can try Submit Result, editing, fines and new seasons.

## 2. Create and configure Supabase

1. Create a free project at https://supabase.com (any region; Sydney suits Perth).
2. Open **SQL Editor → New query**, paste all of `supabase-schema.sql` and click **Run**. Then do the same with `migrations/002_tee_sheet.sql` (section 8).
   This creates every table, constraint, trigger, Row Level Security policy and function. It also seeds:
   - the four players (Jones, Fitz, Pirie, Forrest)
   - the ten default fine categories
   - **Season 01 with 12 balanced fixtures and zero results**

   The script can safely be run again.
3. *(Optional: instant cross-device updates)* Uncomment and run the `alter publication supabase_realtime …` line at the bottom of the schema. Without it, open pages still refresh whenever a tab regains focus.
4. *(Optional)* Under **Authentication → Providers → Email**, turn off "Allow new users to sign up". Only the committee needs accounts, and admins are created by hand (step 4 below). Even if a stranger signed up, they couldn't write anything, because they wouldn't be in the `admins` table.

### What the schema contains

| Table | Purpose |
|---|---|
| `players` | The four golfers (id, name, colour, photo path, order) |
| `seasons` | Season 01, 02 … (`total_rounds` must be a multiple of 3; status `active`/`completed`) |
| `fixtures` | One row per round: date, course |
| `fixture_teams` / `team_members` | Side A and side B and their two players. A player can only appear once per fixture, and each team has at most two players |
| `results` | Team **gross** strokes per fixture. `UNIQUE(fixture_id)` stops a round being recorded twice |
| `fine_categories`, `fines`, `fine_payments` | The tariff, each fine, and payments (a fine is "paid" when its payments cover the amount) |
| `admins` | Supabase Auth user IDs allowed to edit |

Championship points are never stored. The site works them out from the results every time, so editing an earlier round recalculates every standing, chart and record after it.

## 3. Add your Supabase credentials safely

In Supabase, go to **Project Settings → API Keys** and copy:
- the **Project URL**, e.g. `https://abcd1234.supabase.co`
- the **Publishable key** (`sb_publishable_…`), or the legacy **anon public** key

Put both in `config.js` (see `config.example.js`):

```js
window.DD_CONFIG = {
  supabaseUrl: 'https://abcd1234.supabase.co',
  supabasePublishableKey: 'sb_publishable_…'
};
```

The publishable key is **meant to be public**, so it's fine to commit `config.js`. Security comes from Row Level Security and the `admins` table:

- Visitors (`anon`) can only **read** published data. All write privileges are revoked from them.
- Results, teams and seasons can only change through the `save_result`, `delete_result`, `swap_fixture_pairings` and `create_season` functions. Each one checks `is_admin()` on the server before doing anything.
- Fines, payments, categories and fixture dates/courses accept writes only from users listed in `admins`.

❌ **Never** put the `service_role` key, a `sb_secret_…` key or the database password in `config.js` or anywhere else in this site.

## 4. Configure the first administrator

1. In Supabase, go to **Authentication → Users → Add user → Create new user**. Enter an email and a strong password, and tick "Auto confirm user".
2. In **SQL Editor**, run:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```
3. On the site, click **Committee sign in** in the footer, or press **+ Submit Result**, then sign in.

Repeat for each extra administrator. To remove one, run `delete from public.admins where email = '…';`.

## 5. Deploy to Vercel

There's no build step.

- **Dashboard:** push the `designated-drivers` folder to a GitHub repo. In Vercel, choose **Add New → Project**, import the repo, set Framework Preset to **Other**, leave the Build Command empty and set the Output Directory to `.` (or leave it at the default). Click **Deploy**.
- **CLI:**
  ```bash
  npm i -g vercel
  ```
  ```bash
  cd designated-drivers && vercel --prod
  ```

Results, fines and tee-sheet votes are saved to Supabase immediately, so **you don't need to redeploy after entering data**. Redeploy only when you change code, images or `config.js`.

If the site is already connected to GitHub in Vercel, committing and pushing these files to the production branch deploys automatically. Database changes are separate: Vercel never touches Supabase, so run any new file in `migrations/` yourself in the SQL Editor. Either order is safe for the Tee Sheet update.

## 6. Update player images

Replace `assets/jones.png`, `assets/fitz.png`, `assets/pirie.png` and `assets/forrest.png` with square headshots (about 512×512 px, face centred) and redeploy. The images currently there are **neutral grey placeholders**, because no headshots were supplied.

To use a hosted image without redeploying:
`update players set image_url = 'https://…/jones.jpg' where id = 'jones';`

Line colours can be changed the same way (the `color` column).

## 7. Add future seasons

On the **Records** page, an administrator can:
- **Crown champion**: appears once all 12 rounds are recorded. It marks the season complete and adds the champion(s) to the Hall of Champions (ties are shared).
- **Start a new season**: creates Season 02, and so on, with 12 freshly balanced fixtures.

Earlier seasons and their results stay intact. A season selector appears in the hero once there's more than one season, and the Records page covers every season.

The SQL equivalent is `select public.create_season('Season 02', 2027);`. It has to be run as an admin, so the site is the easier way.

---

## 8. The Tee Sheet

The Tee Sheet finds a date for the next round. An organiser proposes a few dates, each player taps Available / Maybe / Can't, the site ranks the dates, and the organiser locks one in and then confirms the tee time once the course is booked.

### One-off setup for an existing site

1. **Run the migration.** In Supabase → **SQL Editor**, paste all of `migrations/002_tee_sheet.sql` and click **Run**.
   - It only adds things: one nullable column (`fixtures.tee_time`), six new tables and their functions. No existing result, fixture, fine or administrator is changed.
   - It runs in a single transaction and can safely be run again.
   - Until it has been run, the updated site still works; the Tee Sheet page just says it needs the database update.
2. **Give each player a login.** For each of the four, go to **Authentication → Users → Add user** (email + password, tick "Auto confirm user"), then link the login to their player:
   ```sql
   insert into public.player_accounts (user_id, player_id)
   select id, 'jones' from auth.users where email = 'jones@example.com';
   ```
   `player_id` is `jones`, `fitz`, `pirie` or `forrest`. Each login maps to exactly one player and each player to one login; the database refuses anything else.
   An organiser who also plays needs both rows: the existing `admins` row and a `player_accounts` row for the same login.
3. *(Optional)* Set `timezone` and `siteUrl` in `config.js` (see `config.example.js`). The time zone defaults to `Australia/Perth`. `siteUrl` is the address put into WhatsApp messages and calendar entries; left empty, the site uses whatever address it is opened from.
4. *(Optional: instant updates between phones)* Uncomment and run the `alter publication supabase_realtime …` line at the bottom of the migration. Without it, the page refreshes whenever it regains focus.

Players stay signed in on their phone after the first sign-in, so voting afterwards is just opening the link and tapping.

### How it works

- **Polling.** An organiser opens a poll for a round with one or more proposed slots (date + Morning / Midday / Afternoon / Anytime / a set time), an optional "vote by" deadline and notes. Dates can be added or removed while voting is open. A round can only have one live poll; the database enforces it.
- **Ranking.** Four Available → *All four available*. Three Available + one Maybe → *Likely to work*. Two + two → *Possible*. Then other combinations with no Unavailable, and last any date with an Unavailable. Within a tier: more Available first, then the earlier date. A missing reply is never counted as Available, and a date is only called unanimous when all four said Available.
- **Responded** means a player has answered every proposed date. Adding a date reopens the question for everyone.
- **The deadline is a nudge** unless the organiser ticks "Close voting at the deadline".
- **Date agreed.** *Lock In Date* closes voting. It is refused if anyone is Unavailable. Players who voted Available are recorded as agreed; anyone who said Maybe (or hadn't answered) must tap **I'm in**. An organiser can record that on their behalf, and that is logged.
- **Tee time confirmed.** Once all four are in, the organiser enters course, date, time, an optional booking reference and notes. This updates the existing fixture's date, tee-off time and course in the same database transaction, so Fixtures and the Clubhouse show the same thing. No second fixture is created.
- **Changes.** *Edit booking* amends a confirmed tee time. *Reopen* goes back to voting with every vote kept. Everything is recorded in the collapsible poll history.
- **WhatsApp.** "Share to WhatsApp" opens WhatsApp with a prefilled message; "Copy Reminder" copies a nudge for one outstanding player. Nothing is ever sent automatically.
- **Add to Calendar** downloads an `.ics` file. The tee-off time is converted from the competition time zone to an exact instant, so it lands at the right time in any calendar app. The duration defaults to 4½ hours and can be changed when confirming.

### Who can do what

| | Visitor | Player (signed in) | Organiser (in `admins`) |
|---|---|---|---|
| See the tee sheet, votes and history | ✓ | ✓ | ✓ |
| Vote / tap "I'm in" | – | own answers only | own answers only |
| Open or cancel a poll, add/remove dates, lock in, confirm, reopen | – | – | ✓ |
| Correct another player's vote | – | – | ✓ (logged) |

A player's identity comes only from their login: the voting function takes no player name, so nobody can vote as someone else. The scheduling tables have no write policies at all; every change goes through a database function that checks permissions.

The tee sheet is publicly readable, like the rest of the site. That includes the booking reference and notes, so don't put anything private in them.

### Rolling back

`migrations/002_tee_sheet_rollback.sql` removes the Tee Sheet tables, functions, player-login links and the `tee_time` column. It permanently deletes all polls, votes and scheduling history, so export those tables first if you want to keep them. Results, fines, seasons, administrators and each fixture's date and course are untouched. The website keeps working afterwards without redeploying (the Tee Sheet page shows the "needs a database update" message).

---

## Competition rules (as implemented in `engine.js`)

- Every round is a 2v2 two-person Ambrose match on **gross** strokes with no handicaps. The **lowest gross wins**.
- **Win = 2 points** for each winner, **draw = 1 point** each, **loss = 0**. The maximum is 24 points per player.
- The schedule rotates Jones+Fitz v Pirie+Forrest → Jones+Pirie v Fitz+Forrest → Jones+Forrest v Fitz+Pirie, four times over. That means every split happens 4 times and every player partners every other player 4 times.
- Admins can **swap the pairings of two unplayed rounds** (Fixtures → round → Swap pairing). Swapping whole pairings keeps the season balanced. Dates and courses stay with their rounds.
- **Tiebreakers:** points → total wins → cumulative stroke differential (opponent gross minus own team's gross, summed). If players are still level, the position is shared (shown as `1=`).
- Fines never affect championship points.
- Individual stroke scores aren't recorded: an Ambrose score belongs to the team.

## Tests

```bash
node tests/engine.test.js
```
25 tests cover the scoring rules, tiebreakers, schedule balance, the chart timeline, recalculation after an edit, fines independence and records.

```bash
node tests/teesheet.test.js
```
28 tests cover the Tee Sheet: date ranking, response progress, deadline rule, Perth and daylight-saving time-zone conversion, WhatsApp messages and the calendar file.

The browser tests need Playwright and a local server running on port 8765:
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
node tests/e2e.teesheet.js http://localhost:8765
```
```bash
node tests/e2e.teesheet-live-mock.js http://localhost:8765
```
`e2e.teesheet.js` walks the whole scheduling flow on desktop and iPhone widths: vote, re-rank, refresh, second tab, lock in, "I'm in", confirm, calendar download, WhatsApp links, Fixtures and Clubhouse updates, reopen, cancel, new poll. `e2e.teesheet-live-mock.js` checks visitor / player / organiser permissions in the interface against a mocked Supabase client, and that the site still works before the migration is run.

`e2e.demo.js` runs on desktop and iPhone widths: submit a result, validation, the confirmation screen, duplicate prevention, editing Round 01 and recalculating, fines, and no horizontal overflow. `e2e.live-mock.js` runs the Supabase code path against a mocked client: sign-in gate, `save_result` call, data mapping.

To check database security on a local PostgreSQL:
```bash
psql -d test -f tests/supabase-shim.sql -f supabase-schema.sql -f tests/schema.test.sql
```
For the Tee Sheet, continue on the same scratch database:
```bash
psql -d test -f migrations/002_tee_sheet.sql -f tests/teesheet.schema.test.sql
```
That checks one login per player, own-vote-only voting, no duplicate votes or polls, lock-in and confirmation rules, the fixture update, reopen and cancel.

The first command confirms that visitors and non-admin users can't write, that duplicate, invalid and future-dated results are refused, that swaps keep the season balanced, and that deleting a result keeps its fines. `supabase-shim.sql` imitates Supabase's `auth` schema for testing only; never run it on Supabase.

## Customising

- Colours and fonts: the CSS variables at the top of `style.css`.
- Fine tariff: the Fines page (admins) → **New offence**, or the edit icon next to an existing offence.
- Score limits: `MIN_SCORE`/`MAX_SCORE` in `engine.js`, plus the matching `check` constraints in the SQL.

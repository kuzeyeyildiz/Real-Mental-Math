# Numo — mental maths for classrooms

A practice app for schoolchildren, with a teacher side. Students climb a per-skill
level ladder by answering timed arithmetic; teachers run classrooms, set homework,
share material and watch progress.

Built with React 19, TypeScript and Vite, on Supabase (Postgres + Auth + Storage).

---

## Running it

You need **Node 20 or newer** (developed on Node 22).

```bash
npm install
```

```bash
npm run dev
```

Vite prints a local URL — open it in a browser. That's all: the app talks to a
hosted Supabase project, so there is nothing to install or migrate locally.

### Other commands

```bash
npm run build
```

```bash
npm run lint
```

```bash
npx vitest run
```

`npm run build` type-checks and produces `dist/`. `npx vitest run` runs the test
suite (269 tests, all pure logic — no browser or database needed).

---

## Signing in

Two demo accounts, both with the password `Test1234`:

| Role    | Email                     |
| ------- | ------------------------- |
| Teacher | `numo.teacher@gmail.com`  |
| Student | `numo.student@gmail.com`  |

Or create a new account from the sign-up screen — pick Student or Teacher. A
student can join a class with the six-character code shown on the teacher's
dashboard.

> These are shared demo logins on a shared database. Anything you change, the
> other person sees.

---

## Configuration

`.env` holds two values:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The key is a Supabase **publishable** key. It is meant to be shipped in the
browser bundle and every table is protected by row-level security, so it grants
nothing beyond what a signed-in user is allowed to see. There is no service-role
key in this project.

---

## How it fits together

```
src/
  engine/     Pure logic — no React, no network, fully unit-tested.
              Question generation, the XP ladder, scoring, badges,
              leagues, the class feed, video-URL resolving.
  lib/        Everything that talks to Supabase, plus shared hooks.
  components/ Reusable UI.
  pages/      Screens: auth, benchmark, student app, teacher dashboard.
  data/       Fixed tables — the benchmark paper, province names, labels.
```

The split matters: anything that can be decided without a network call lives in
`engine/` and is tested there. That is why the test suite is fast and needs no
database.

### A few things that are deliberate

- **The clock starts when the student asks for the question**, not when the
  screen appears. The operands stay masked until then, so nobody can solve a
  question untimed and then submit it in a fraction of a second.
- **Levels get gradually more expensive.** Each one costs 16% more than the last,
  starting at 100 XP and capped at 1,500, so there is no sugar rush at the bottom
  and no wall at the top.
- **A student is not assumed to be in a class.** Practising alone is a supported
  way to use the app; Homework and class tables simply aren't shown.
- **Access rules live in the database, not the UI.** Private material, classroom
  isolation and who may friend whom are enforced by row-level security, so hiding
  something in the interface is never the only thing stopping it.

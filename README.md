# 100-Day Fitness OS - Weight Loss Journey Tracker

A React + TypeScript + Vite app for tracking a 100-day fat-loss journey.

## Features

- 100-day plan tracking with day counter and completion percentage
- Profile setup: sex, age, height, start weight, target weight, activity level
- Maintenance calorie calculation using BMR + activity multiplier
- 25% calorie deficit target
- Food eaten log with calories, protein, carbs, fat, and fiber
- Shows calories consumed, remaining calories, and extra calories to burn
- Protein target based on body weight x 1.6g
- Fat minimum based on at least 20% calories from fats
- Fiber target based on ~10g per 1000 kcal
- Daily check-in: weight, waist, sleep, training, workout minutes, exercise burn, water, fruits/vegetables, notes
- Daily protocol score for calorie deficit, protein, sleep, fiber, fruits/vegetables
- 100-day forecast and goal-based calorie guidance
- Data saved in browser localStorage
- Export progress as JSON

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

## Cloudflare Pages + D1

This app is prepared for Cloudflare Pages deployment with D1 database storage.

1. Create a D1 database:

```bash
npm run cf:db:create
```

2. Copy the generated `database_id` into `wrangler.toml`.

3. Apply the database migration:

```bash
npm run cf:db:migrate
```

For local-only testing, use:

```bash
npm run cf:db:migrate:local
```

4. Test the Cloudflare Pages Functions locally:

```bash
npm run cf:pages:dev
```

5. Deploy:

```bash
npm run cf:deploy
```

The frontend keeps localStorage as a fallback, but signed-in users save profile, food entries, and daily logs through `/api/*` Pages Functions into Cloudflare D1.

## Important note

This app is for personal tracking and habit building. It does not replace advice from a doctor, registered dietitian, or certified trainer. Avoid extreme deficits and adjust the targets based on energy, recovery, health conditions, and professional guidance.

## Future backend idea with Django/DRF

Suggested API models:

- UserProfile
- DailyLog
- FoodEntry
- BodyMeasurement
- ProgressPhoto
- TrainingSession

Suggested endpoints:

- `GET /api/profile/`
- `PATCH /api/profile/`
- `GET /api/daily-logs/?start=&end=`
- `POST /api/daily-logs/`
- `GET /api/food-entries/?date=`
- `POST /api/food-entries/`
- `DELETE /api/food-entries/{id}/`

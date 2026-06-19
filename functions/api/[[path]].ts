type Env = {
  DB: D1Database;
};

type Profile = {
  name: string;
  sex: 'male' | 'female';
  age: number;
  heightCm: number;
  startWeightKg: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
  startDate: string;
  planDays: number;
};

type FoodEntry = {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type DailyLog = {
  date: string;
  weightKg: number;
  waistCm: number;
  sleepHours: number;
  trainingType: 'rest' | 'strength' | 'cardio' | 'sports' | 'mixed';
  workoutMinutes: number;
  exerciseCaloriesBurned: number;
  waterLiters: number;
  fruitsVegGrams: number;
  notes: string;
};

type User = {
  id: string;
  email: string;
};

const SESSION_COOKIE = 'fitness_os_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;

const defaultProfile = (name: string): Profile => ({
  name: name || 'Paurush',
  sex: 'male',
  age: 28,
  heightCm: 175,
  startWeightKg: 75,
  currentWeightKg: 75,
  targetWeightKg: 68,
  activityLevel: 'light',
  startDate: new Date().toISOString().slice(0, 10),
  planDays: 100,
});

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = context.request.method.toUpperCase();

  try {
    if (method === 'OPTIONS') return json({});
    if (path === 'auth/register' && method === 'POST') return register(context);
    if (path === 'auth/login' && method === 'POST') return login(context);
    if (path === 'auth/logout' && method === 'POST') return logout(context);
    if (path === 'auth/me' && method === 'GET') return me(context);

    const user = await requireUser(context);
    if (path === 'data' && method === 'GET') return getData(context.env.DB, user.id);
    if (path === 'data' && method === 'PUT') return replaceData(context, user.id);
    if (path === 'profile' && method === 'PUT') return saveProfileRoute(context, user.id);
    if (path === 'foods' && method === 'POST') return saveFoodRoute(context, user.id);
    if (path.startsWith('foods/') && method === 'DELETE') return deleteFoodRoute(context, user.id, path.split('/')[1]);
    if (path === 'logs' && method === 'PUT') return saveLogRoute(context, user.id);

    return json({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : 'Server error' }, 500);
  }
};

async function register(context: EventContext<Env, string, unknown>) {
  const body = await readJson<{ email?: string; password?: string; name?: string }>(context.request);
  const email = normalizeEmail(body.email);
  const password = body.password ?? '';
  if (!email) return json({ error: 'Email is required' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

  const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'Account already exists' }, 409);

  const userId = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  const profile = defaultProfile(body.name ?? '');

  await context.env.DB.batch([
    context.env.DB.prepare('INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
      .bind(userId, email, passwordHash, salt),
    profileStatement(context.env.DB, userId, profile),
  ]);

  return createSessionResponse(context, { id: userId, email });
}

async function login(context: EventContext<Env, string, unknown>) {
  const body = await readJson<{ email?: string; password?: string }>(context.request);
  const email = normalizeEmail(body.email);
  const password = body.password ?? '';
  const user = await context.env.DB.prepare('SELECT id, email, password_hash, password_salt FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; password_salt: string }>();

  if (!user) return json({ error: 'Invalid email or password' }, 401);
  const attemptedHash = await hashPassword(password, user.password_salt);
  if (!timingSafeEqual(attemptedHash, user.password_hash)) return json({ error: 'Invalid email or password' }, 401);

  return createSessionResponse(context, { id: user.id, email: user.email });
}

async function logout(context: EventContext<Env, string, unknown>) {
  const sessionId = getCookie(context.request, SESSION_COOKIE);
  if (sessionId) {
    await context.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  return json({ ok: true }, 200, clearSessionCookie());
}

async function me(context: EventContext<Env, string, unknown>) {
  const user = await getUserFromSession(context);
  return json({ user });
}

async function getData(db: D1Database, userId: string) {
  const [profileRow, foodsResult, logsResult] = await Promise.all([
    db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first<Record<string, unknown>>(),
    db.prepare('SELECT * FROM food_entries WHERE user_id = ? ORDER BY date DESC, created_at DESC').bind(userId).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date DESC').bind(userId).all<Record<string, unknown>>(),
  ]);

  return json({
    profile: profileFromRow(profileRow),
    foods: foodsResult.results.map(foodFromRow),
    logs: logsResult.results.map(logFromRow),
  });
}

async function replaceData(context: EventContext<Env, string, unknown>, userId: string) {
  const data = await readJson<{ profile?: Profile; foods?: FoodEntry[]; logs?: DailyLog[] }>(context.request);
  const profile = sanitizeProfile(data.profile ?? defaultProfile(''));
  const foods = Array.isArray(data.foods) ? data.foods.map(sanitizeFood) : [];
  const logs = Array.isArray(data.logs) ? data.logs.map(sanitizeLog) : [];

  const statements = [
    context.env.DB.prepare('DELETE FROM food_entries WHERE user_id = ?').bind(userId),
    context.env.DB.prepare('DELETE FROM daily_logs WHERE user_id = ?').bind(userId),
    profileStatement(context.env.DB, userId, profile),
    ...foods.map((food) => foodStatement(context.env.DB, userId, food)),
    ...logs.map((log) => logStatement(context.env.DB, userId, log)),
  ];

  await context.env.DB.batch(statements);
  return json({ ok: true });
}

async function saveProfileRoute(context: EventContext<Env, string, unknown>, userId: string) {
  const profile = sanitizeProfile(await readJson<Profile>(context.request));
  await profileStatement(context.env.DB, userId, profile).run();
  return json({ ok: true });
}

async function saveFoodRoute(context: EventContext<Env, string, unknown>, userId: string) {
  const food = sanitizeFood(await readJson<FoodEntry>(context.request));
  await foodStatement(context.env.DB, userId, food).run();
  return json({ food });
}

async function deleteFoodRoute(context: EventContext<Env, string, unknown>, userId: string, foodId: string) {
  await context.env.DB.prepare('DELETE FROM food_entries WHERE user_id = ? AND id = ?').bind(userId, foodId).run();
  return json({ ok: true });
}

async function saveLogRoute(context: EventContext<Env, string, unknown>, userId: string) {
  const log = sanitizeLog(await readJson<DailyLog>(context.request));
  await logStatement(context.env.DB, userId, log).run();
  return json({ ok: true });
}

async function createSessionResponse(context: EventContext<Env, string, unknown>, user: User) {
  const sessionId = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await context.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, user.id, expiresAt)
    .run();

  return json({ user }, 200, sessionCookie(context.request, sessionId, expiresAt));
}

async function requireUser(context: EventContext<Env, string, unknown>) {
  const user = await getUserFromSession(context);
  if (!user) throw json({ error: 'Authentication required' }, 401);
  return user;
}

async function getUserFromSession(context: EventContext<Env, string, unknown>): Promise<User | null> {
  const sessionId = getCookie(context.request, SESSION_COOKIE);
  if (!sessionId) return null;

  const row = await context.env.DB.prepare(
    `SELECT users.id, users.email, sessions.expires_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ?`
  ).bind(sessionId).first<{ id: string; email: string; expires_at: string }>();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await context.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }
  return { id: row.id, email: row.email };
}

function profileStatement(db: D1Database, userId: string, profile: Profile) {
  return db.prepare(
    `INSERT INTO profiles (
      user_id, name, sex, age, height_cm, start_weight_kg, current_weight_kg,
      target_weight_kg, activity_level, start_date, plan_days, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      name = excluded.name,
      sex = excluded.sex,
      age = excluded.age,
      height_cm = excluded.height_cm,
      start_weight_kg = excluded.start_weight_kg,
      current_weight_kg = excluded.current_weight_kg,
      target_weight_kg = excluded.target_weight_kg,
      activity_level = excluded.activity_level,
      start_date = excluded.start_date,
      plan_days = excluded.plan_days,
      updated_at = CURRENT_TIMESTAMP`
  ).bind(
    userId,
    profile.name,
    profile.sex,
    profile.age,
    profile.heightCm,
    profile.startWeightKg,
    profile.currentWeightKg,
    profile.targetWeightKg,
    profile.activityLevel,
    profile.startDate,
    profile.planDays
  );
}

function foodStatement(db: D1Database, userId: string, food: FoodEntry) {
  return db.prepare(
    `INSERT INTO food_entries (
      id, user_id, date, name, calories, protein, carbs, fat, fiber
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      name = excluded.name,
      calories = excluded.calories,
      protein = excluded.protein,
      carbs = excluded.carbs,
      fat = excluded.fat,
      fiber = excluded.fiber`
  ).bind(food.id, userId, food.date, food.name, food.calories, food.protein, food.carbs, food.fat, food.fiber);
}

function logStatement(db: D1Database, userId: string, log: DailyLog) {
  return db.prepare(
    `INSERT INTO daily_logs (
      user_id, date, weight_kg, waist_cm, sleep_hours, training_type,
      workout_minutes, exercise_calories_burned, water_liters, fruits_veg_grams, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, date) DO UPDATE SET
      weight_kg = excluded.weight_kg,
      waist_cm = excluded.waist_cm,
      sleep_hours = excluded.sleep_hours,
      training_type = excluded.training_type,
      workout_minutes = excluded.workout_minutes,
      exercise_calories_burned = excluded.exercise_calories_burned,
      water_liters = excluded.water_liters,
      fruits_veg_grams = excluded.fruits_veg_grams,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP`
  ).bind(
    userId,
    log.date,
    log.weightKg,
    log.waistCm,
    log.sleepHours,
    log.trainingType,
    log.workoutMinutes,
    log.exerciseCaloriesBurned,
    log.waterLiters,
    log.fruitsVegGrams,
    log.notes
  );
}

function profileFromRow(row: Record<string, unknown> | null): Profile {
  if (!row) return defaultProfile('');
  return {
    name: stringValue(row.name),
    sex: stringValue(row.sex) === 'female' ? 'female' : 'male',
    age: numberValue(row.age),
    heightCm: numberValue(row.height_cm),
    startWeightKg: numberValue(row.start_weight_kg),
    currentWeightKg: numberValue(row.current_weight_kg),
    targetWeightKg: numberValue(row.target_weight_kg),
    activityLevel: activityValue(row.activity_level),
    startDate: stringValue(row.start_date),
    planDays: numberValue(row.plan_days),
  };
}

function foodFromRow(row: Record<string, unknown>): FoodEntry {
  return {
    id: stringValue(row.id),
    date: stringValue(row.date),
    name: stringValue(row.name),
    calories: numberValue(row.calories),
    protein: numberValue(row.protein),
    carbs: numberValue(row.carbs),
    fat: numberValue(row.fat),
    fiber: numberValue(row.fiber),
  };
}

function logFromRow(row: Record<string, unknown>): DailyLog {
  return {
    date: stringValue(row.date),
    weightKg: numberValue(row.weight_kg),
    waistCm: numberValue(row.waist_cm),
    sleepHours: numberValue(row.sleep_hours),
    trainingType: trainingValue(row.training_type),
    workoutMinutes: numberValue(row.workout_minutes),
    exerciseCaloriesBurned: numberValue(row.exercise_calories_burned),
    waterLiters: numberValue(row.water_liters),
    fruitsVegGrams: numberValue(row.fruits_veg_grams),
    notes: stringValue(row.notes),
  };
}

function sanitizeProfile(profile: Profile): Profile {
  return {
    name: stringValue(profile.name).slice(0, 120) || 'Paurush',
    sex: profile.sex === 'female' ? 'female' : 'male',
    age: clampNumber(profile.age, 1, 120),
    heightCm: clampNumber(profile.heightCm, 50, 260),
    startWeightKg: clampNumber(profile.startWeightKg, 20, 400),
    currentWeightKg: clampNumber(profile.currentWeightKg, 20, 400),
    targetWeightKg: clampNumber(profile.targetWeightKg, 20, 400),
    activityLevel: activityValue(profile.activityLevel),
    startDate: stringValue(profile.startDate).slice(0, 10),
    planDays: clampNumber(profile.planDays, 1, 1000),
  };
}

function sanitizeFood(food: FoodEntry): FoodEntry {
  return {
    id: stringValue(food.id) || crypto.randomUUID(),
    date: stringValue(food.date).slice(0, 10),
    name: stringValue(food.name).slice(0, 240),
    calories: clampNumber(food.calories, 0, 10000),
    protein: clampNumber(food.protein, 0, 1000),
    carbs: clampNumber(food.carbs, 0, 1000),
    fat: clampNumber(food.fat, 0, 1000),
    fiber: clampNumber(food.fiber, 0, 1000),
  };
}

function sanitizeLog(log: DailyLog): DailyLog {
  return {
    date: stringValue(log.date).slice(0, 10),
    weightKg: clampNumber(log.weightKg, 20, 400),
    waistCm: clampNumber(log.waistCm, 0, 300),
    sleepHours: clampNumber(log.sleepHours, 0, 24),
    trainingType: trainingValue(log.trainingType),
    workoutMinutes: clampNumber(log.workoutMinutes, 0, 1440),
    exerciseCaloriesBurned: clampNumber(log.exerciseCaloriesBurned, 0, 10000),
    waterLiters: clampNumber(log.waterLiters, 0, 20),
    fruitsVegGrams: clampNumber(log.fruitsVegGrams, 0, 5000),
    notes: stringValue(log.notes).slice(0, 2000),
  };
}

async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

async function hashPassword(password: string, salt: string) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256
  );
  return bufferToBase64(bits);
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function randomToken(bytes: number) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sessionCookie(request: Request, value: string, expiresAt: string) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    'Set-Cookie': `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}${secure}`,
  };
}

function clearSessionCookie() {
  return {
    'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  };
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('Cookie') ?? '';
  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = numberValue(value);
  return Math.min(max, Math.max(min, parsed));
}

function activityValue(value: unknown): Profile['activityLevel'] {
  return value === 'sedentary' || value === 'moderate' || value === 'active' ? value : 'light';
}

function trainingValue(value: unknown): DailyLog['trainingType'] {
  return value === 'strength' || value === 'cardio' || value === 'sports' || value === 'mixed' ? value : 'rest';
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

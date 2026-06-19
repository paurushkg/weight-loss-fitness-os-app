import { FormEvent, useEffect, useMemo, useState } from 'react';

type Sex = 'male' | 'female';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
type TrainingType = 'rest' | 'strength' | 'cardio' | 'sports' | 'mixed';
type AuthMode = 'login' | 'register';
type SyncState = 'local' | 'checking' | 'cloud' | 'saving' | 'error';

type Profile = {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  startWeightKg: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
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

type FoodEstimate = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: number;
  note: string;
};

type FoodModel = Omit<FoodEstimate, 'name' | 'confidence' | 'note'> & {
  label: string;
  keywords: string[];
  serving: string;
};

type DailyLog = {
  date: string;
  weightKg: number;
  waistCm: number;
  sleepHours: number;
  trainingType: TrainingType;
  workoutMinutes: number;
  exerciseCaloriesBurned: number;
  waterLiters: number;
  fruitsVegGrams: number;
  notes: string;
};

type AppData = {
  profile: Profile;
  foods: FoodEntry[];
  logs: DailyLog[];
};

type AuthUser = {
  id: string;
  email: string;
};

const STORAGE_KEY = 'fitness-os-100-day-data-v1';

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialProfile: Profile = {
  name: 'Paurush',
  sex: 'male',
  age: 28,
  heightCm: 175,
  startWeightKg: 75,
  currentWeightKg: 75,
  targetWeightKg: 68,
  activityLevel: 'light',
  startDate: todayISO(),
  planDays: 100,
};

const initialData: AppData = {
  profile: initialProfile,
  foods: [],
  logs: [],
};

const activityFactors: Record<ActivityLevel, { label: string; factor: number; hint: string }> = {
  sedentary: { label: 'Sedentary', factor: 1.2, hint: 'Desk job, very low movement' },
  light: { label: 'Light', factor: 1.375, hint: 'Light walks or 1-3 workouts/week' },
  moderate: { label: 'Moderate', factor: 1.55, hint: '3-5 training days/week' },
  active: { label: 'Active', factor: 1.725, hint: 'Hard training or active job' },
};

const trainingLabels: Record<TrainingType, string> = {
  rest: 'Rest / mobility',
  strength: 'Strength training',
  cardio: 'Cardio',
  sports: 'Sports',
  mixed: 'Mixed training',
};

const foodModels: FoodModel[] = [
  { label: 'cooked rice', keywords: ['rice', 'chawal'], serving: '150g', calories: 195, protein: 4, carbs: 43, fat: 0, fiber: 1 },
  { label: 'roti', keywords: ['roti', 'chapati'], serving: '1 piece', calories: 120, protein: 4, carbs: 22, fat: 3, fiber: 3 },
  { label: 'dal', keywords: ['dal', 'lentil'], serving: '1 bowl', calories: 180, protein: 10, carbs: 28, fat: 4, fiber: 8 },
  { label: 'paneer', keywords: ['paneer'], serving: '100g', calories: 265, protein: 18, carbs: 3, fat: 21, fiber: 0 },
  { label: 'chicken breast', keywords: ['chicken'], serving: '150g', calories: 250, protein: 46, carbs: 0, fat: 5, fiber: 0 },
  { label: 'egg', keywords: ['egg', 'eggs'], serving: '1 piece', calories: 78, protein: 6, carbs: 1, fat: 5, fiber: 0 },
  { label: 'oats', keywords: ['oats', 'oatmeal'], serving: '50g', calories: 190, protein: 7, carbs: 32, fat: 4, fiber: 5 },
  { label: 'banana', keywords: ['banana'], serving: '1 piece', calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 },
  { label: 'apple', keywords: ['apple'], serving: '1 piece', calories: 95, protein: 0, carbs: 25, fat: 0, fiber: 4 },
  { label: 'milk', keywords: ['milk'], serving: '250ml', calories: 150, protein: 8, carbs: 12, fat: 8, fiber: 0 },
  { label: 'curd', keywords: ['curd', 'yogurt', 'dahi'], serving: '100g', calories: 61, protein: 4, carbs: 5, fat: 3, fiber: 0 },
  { label: 'poha', keywords: ['poha'], serving: '1 bowl', calories: 250, protein: 5, carbs: 45, fat: 7, fiber: 3 },
  { label: 'idli', keywords: ['idli'], serving: '1 piece', calories: 58, protein: 2, carbs: 12, fat: 0, fiber: 1 },
  { label: 'dosa', keywords: ['dosa'], serving: '1 piece', calories: 168, protein: 4, carbs: 29, fat: 4, fiber: 2 },
  { label: 'upma', keywords: ['upma'], serving: '1 bowl', calories: 260, protein: 6, carbs: 42, fat: 8, fiber: 4 },
  { label: 'biryani', keywords: ['biryani', 'biriyani'], serving: '1 bowl', calories: 500, protein: 18, carbs: 62, fat: 18, fiber: 4 },
  { label: 'salad', keywords: ['salad'], serving: '1 bowl', calories: 80, protein: 3, carbs: 14, fat: 2, fiber: 5 },
  { label: 'bread', keywords: ['bread', 'toast'], serving: '1 slice', calories: 75, protein: 3, carbs: 14, fat: 1, fiber: 1 },
  { label: 'peanut butter', keywords: ['peanut butter'], serving: '1 tbsp', calories: 95, protein: 4, carbs: 3, fat: 8, fiber: 1 },
  { label: 'whey protein', keywords: ['whey', 'protein powder'], serving: '1 scoop', calories: 120, protein: 24, carbs: 3, fat: 2, fiber: 0 },
];

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function safeNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function diffDays(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.floor(diff / 86_400_000);
}

function kgFromCalories(calories: number) {
  return calories / 7700;
}

function getQuantityMultiplier(text: string, food: FoodModel) {
  const keywordPattern = food.keywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const nearbyAmount = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(kg|g|gram|grams|ml|cup|cups|bowl|bowls|piece|pieces|slice|slices|scoop|scoops|tbsp|tablespoons?)?\\s*(?:of\\s+)?(?:${keywordPattern})`, 'i');
  const amountMatch = text.match(nearbyAmount);
  if (!amountMatch) return 1;

  const amount = Number(amountMatch[1]);
  const unit = amountMatch[2]?.toLowerCase() ?? '';
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  if (unit === 'kg') return amount * 10;
  if (unit === 'g' || unit === 'gram' || unit === 'grams') return amount / 100;
  if (unit === 'ml' && food.serving.includes('250ml')) return amount / 250;
  if (unit === 'cup' || unit === 'cups' || unit === 'bowl' || unit === 'bowls') return amount;
  if (unit === 'piece' || unit === 'pieces' || unit === 'slice' || unit === 'slices' || unit === 'scoop' || unit === 'scoops') return amount;
  if (unit === 'tbsp' || unit.startsWith('tablespoon')) return amount;
  return amount;
}

function estimateFood(description: string): FoodEstimate {
  const normalized = description.toLowerCase();
  const matches = foodModels.filter((food) =>
    food.keywords.some((keyword) => normalized.includes(keyword))
  );

  if (matches.length === 0) {
    return {
      name: description.trim(),
      calories: 300,
      protein: 10,
      carbs: 35,
      fat: 10,
      fiber: 4,
      confidence: 35,
      note: 'Generic meal estimate. Add quantity or a known food name for a better result.',
    };
  }

  const estimate = matches.reduce(
    (total, food) => {
      const multiplier = getQuantityMultiplier(normalized, food);
      return {
        calories: total.calories + food.calories * multiplier,
        protein: total.protein + food.protein * multiplier,
        carbs: total.carbs + food.carbs * multiplier,
        fat: total.fat + food.fat * multiplier,
        fiber: total.fiber + food.fiber * multiplier,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  const matchedNames = matches.map((food) => `${food.label} (${food.serving})`).join(', ');

  return {
    name: description.trim(),
    calories: round(estimate.calories),
    protein: round(estimate.protein),
    carbs: round(estimate.carbs),
    fat: round(estimate.fat),
    fiber: round(estimate.fiber),
    confidence: Math.min(92, 58 + matches.length * 12),
    note: `Estimated from ${matchedNames}. Adjust values if your portion was different.`,
  };
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialData;
    const parsed = JSON.parse(raw) as AppData;
    return {
      profile: { ...initialProfile, ...parsed.profile },
      foods: Array.isArray(parsed.foods) ? parsed.foods : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return initialData;
  }
}

function getDefaultLog(date: string, profile: Profile): DailyLog {
  return {
    date,
    weightKg: profile.currentWeightKg,
    waistCm: 0,
    sleepHours: 7,
    trainingType: 'rest',
    workoutMinutes: 0,
    exerciseCaloriesBurned: 0,
    waterLiters: 2.5,
    fruitsVegGrams: 500,
    notes: '',
  };
}

function calculateTargets(profile: Profile, latestWeightKg: number, selectedDay: number) {
  const weight = latestWeightKg || profile.currentWeightKg;
  const bmr =
    profile.sex === 'male'
      ? 10 * weight + 6.25 * profile.heightCm - 5 * profile.age + 5
      : 10 * weight + 6.25 * profile.heightCm - 5 * profile.age - 161;
  const maintenance = Math.max(1200, round(bmr * activityFactors[profile.activityLevel].factor));
  const fatLossCalories = round(maintenance * 0.75);
  const dailyDeficit = maintenance - fatLossCalories;
  const remainingDays = Math.max(1, profile.planDays - selectedDay + 1);
  const remainingWeightToLose = Math.max(0, weight - profile.targetWeightKg);
  const goalDeficitPerDay = round((remainingWeightToLose * 7700) / remainingDays);
  const goalBasedCalories = Math.max(1000, maintenance - goalDeficitPerDay);

  return {
    bmr: round(bmr),
    maintenance,
    fatLossCalories,
    dailyDeficit,
    goalDeficitPerDay,
    goalBasedCalories,
    estimatedLossIn100Days: kgFromCalories(dailyDeficit * profile.planDays),
    proteinMin: round(weight * 1.2),
    proteinTarget: round(weight * 1.6),
    proteinMax: round(weight * 2.2),
    minFatGrams: round((fatLossCalories * 0.2) / 9),
    fiberTarget: round((fatLossCalories / 1000) * 10),
    remainingDays,
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed');
  }
  return payload as T;
}

function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [foodForm, setFoodForm] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
  });
  const [foodEstimate, setFoodEstimate] = useState<FoodEstimate | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('checking');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    void checkSession();
  }, []);

  const profile = data.profile;
  const selectedDay = Math.min(Math.max(diffDays(profile.startDate, selectedDate) + 1, 1), profile.planDays);
  const completionPct = Math.min(100, Math.max(0, round((selectedDay / profile.planDays) * 100)));

  const todayLog = data.logs.find((log) => log.date === selectedDate) ?? getDefaultLog(selectedDate, profile);
  const latestLoggedWeight = useMemo(() => {
    const logsWithWeight = data.logs
      .filter((log) => log.weightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return logsWithWeight.length > 0 ? logsWithWeight[logsWithWeight.length - 1].weightKg : profile.currentWeightKg;
  }, [data.logs, profile.currentWeightKg]);

  const targets = calculateTargets(profile, latestLoggedWeight, selectedDay);
  const foodsForDate = data.foods.filter((food) => food.date === selectedDate);

  const totals = foodsForDate.reduce(
    (acc, food) => ({
      calories: acc.calories + food.calories,
      protein: acc.protein + food.protein,
      carbs: acc.carbs + food.carbs,
      fat: acc.fat + food.fat,
      fiber: acc.fiber + food.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const caloriesRemaining = Math.max(0, targets.fatLossCalories - totals.calories);
  const extraBurnNeeded = Math.max(0, totals.calories - targets.fatLossCalories);
  const totalDeficitToday = Math.max(
    0,
    targets.maintenance + todayLog.exerciseCaloriesBurned - totals.calories
  );
  const deficitCompletion = Math.min(100, round((totalDeficitToday / targets.dailyDeficit) * 100));
  const proteinCompletion = Math.min(100, round((totals.protein / targets.proteinTarget) * 100));
  const weightLost = Math.max(0, profile.startWeightKg - latestLoggedWeight);
  const weightGoalTotal = Math.max(0.1, profile.startWeightKg - profile.targetWeightKg);
  const weightGoalPct = Math.min(100, round((weightLost / weightGoalTotal) * 100));

  async function checkSession() {
    try {
      const result = await apiRequest<{ user: AuthUser | null }>('/api/auth/me');
      setUser(result.user);
      if (result.user) {
        await loadCloudData();
      } else {
        setSyncState('local');
      }
    } catch {
      setSyncState('local');
    }
  }

  async function loadCloudData() {
    setSyncState('checking');
    const cloudData = await apiRequest<AppData>('/api/data');
    setData(cloudData);
    setSyncState('cloud');
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    setSyncState('checking');
    try {
      const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const result = await apiRequest<{ user: AuthUser }>(path, {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      setUser(result.user);
      await loadCloudData();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not sign in');
      setSyncState('local');
    }
  }

  async function logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setSyncState('local');
    }
  }

  async function saveProfile(profileToSave: Profile) {
    if (!user) return;
    setSyncState('saving');
    try {
      await apiRequest('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(profileToSave),
      });
      setSyncState('cloud');
    } catch {
      setSyncState('error');
    }
  }

  async function uploadLocalData() {
    if (!user) return;
    setSyncState('saving');
    try {
      await apiRequest('/api/data', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setSyncState('cloud');
    } catch {
      setSyncState('error');
    }
  }

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    const nextProfile = { ...profile, [key]: value };
    setData((current) => ({
      ...current,
      profile: nextProfile,
    }));
    void saveProfile(nextProfile);
  }

  function updateLog<K extends keyof DailyLog>(key: K, value: DailyLog[K]) {
    setData((current) => {
      const existingLog = current.logs.find((log) => log.date === selectedDate);
      const nextLog = { ...(existingLog ?? getDefaultLog(selectedDate, current.profile)), [key]: value };
      const logs = existingLog
        ? current.logs.map((log) => (log.date === selectedDate ? nextLog : log))
        : [...current.logs, nextLog];

      if (user) {
        void apiRequest('/api/logs', {
          method: 'PUT',
          body: JSON.stringify(nextLog),
        }).then(() => setSyncState('cloud')).catch(() => setSyncState('error'));
      }

      return {
        ...current,
        profile: key === 'weightKg' ? { ...current.profile, currentWeightKg: Number(value) } : current.profile,
        logs,
      };
    });
  }

  function addFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const calories = safeNumber(foodForm.calories);
    if (!foodForm.name.trim() || calories <= 0) return;

    const newFood: FoodEntry = {
      id: makeId(),
      date: selectedDate,
      name: foodForm.name.trim(),
      calories,
      protein: safeNumber(foodForm.protein),
      carbs: safeNumber(foodForm.carbs),
      fat: safeNumber(foodForm.fat),
      fiber: safeNumber(foodForm.fiber),
    };

    setData((current) => ({ ...current, foods: [newFood, ...current.foods] }));
    if (user) {
      setSyncState('saving');
      void apiRequest('/api/foods', {
        method: 'POST',
        body: JSON.stringify(newFood),
      }).then(() => setSyncState('cloud')).catch(() => setSyncState('error'));
    }
    setFoodForm({ name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '' });
    setFoodEstimate(null);
  }

  function removeFood(id: string) {
    setData((current) => ({ ...current, foods: current.foods.filter((food) => food.id !== id) }));
    if (user) {
      setSyncState('saving');
      void apiRequest(`/api/foods/${id}`, { method: 'DELETE' })
        .then(() => setSyncState('cloud'))
        .catch(() => setSyncState('error'));
    }
  }

  function estimateFoodForm() {
    if (!foodForm.name.trim()) return;
    const estimate = estimateFood(foodForm.name);
    setFoodEstimate(estimate);
    setFoodForm((current) => ({
      ...current,
      calories: String(estimate.calories),
      protein: String(estimate.protein),
      carbs: String(estimate.carbs),
      fat: String(estimate.fat),
      fiber: String(estimate.fiber),
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fitness-os-data-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetData() {
    const confirmed = window.confirm('Reset all saved progress, food logs, and profile data?');
    if (confirmed) setData(initialData);
  }

  const syncLabel = user
    ? syncState === 'cloud'
      ? 'Cloud saved'
      : syncState === 'saving'
        ? 'Saving...'
        : syncState === 'error'
          ? 'Cloud sync issue'
          : 'Checking cloud...'
    : 'Local only';

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">100-Day Fitness OS</p>
          <h1>Weight loss journey tracker</h1>
          <p>
            Track calories, protein, training, sleep, and fiber with browser fallback and Cloudflare D1
            sync when you are signed in.
          </p>
          <div className="hero-actions">
            <button onClick={exportData}>Export data</button>
            <button className="ghost" onClick={resetData}>Reset</button>
          </div>
        </div>
        <div className="day-card">
          <span>Day</span>
          <strong>{selectedDay}</strong>
          <small>of {profile.planDays}</small>
          <div className="progress-track">
            <div style={{ width: `${completionPct}%` }} />
          </div>
          <p>{completionPct}% plan completed</p>
        </div>
      </section>

      <section className="grid">
        <article className="panel auth-panel">
          <div>
            <p className="eyebrow">Cloud account</p>
            <h2>{user ? 'Synced with Cloudflare D1' : 'Sign in to save across devices'}</h2>
            <p className="note">
              {user
                ? `${user.email} is connected. ${syncLabel}.`
                : 'Your app still works locally, but sign-in enables D1 database storage.'}
            </p>
          </div>
          {user ? (
            <div className="auth-actions">
              <button type="button" onClick={uploadLocalData}>Upload local data</button>
              <button type="button" className="ghost" onClick={logout}>Sign out</button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleAuth}>
              {authMode === 'register' && (
                <input
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="Name"
                />
              )}
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="Email"
              />
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="Password"
              />
              <button type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
              >
                {authMode === 'login' ? 'Create account' : 'Use existing account'}
              </button>
              {authError && <p className="form-error">{authError}</p>}
            </form>
          )}
        </article>
      </section>

      <section className="grid two-columns">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Setup</p>
              <h2>Your targets</h2>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Name
              <input value={profile.name} onChange={(e) => updateProfile('name', e.target.value)} />
            </label>
            <label>
              Sex
              <select value={profile.sex} onChange={(e) => updateProfile('sex', e.target.value as Sex)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label>
              Age
              <input type="number" value={profile.age} onChange={(e) => updateProfile('age', safeNumber(e.target.value, profile.age))} />
            </label>
            <label>
              Height, cm
              <input type="number" value={profile.heightCm} onChange={(e) => updateProfile('heightCm', safeNumber(e.target.value, profile.heightCm))} />
            </label>
            <label>
              Start weight, kg
              <input type="number" value={profile.startWeightKg} onChange={(e) => updateProfile('startWeightKg', safeNumber(e.target.value, profile.startWeightKg))} />
            </label>
            <label>
              Target weight, kg
              <input type="number" value={profile.targetWeightKg} onChange={(e) => updateProfile('targetWeightKg', safeNumber(e.target.value, profile.targetWeightKg))} />
            </label>
            <label>
              Start date
              <input type="date" value={profile.startDate} onChange={(e) => updateProfile('startDate', e.target.value)} />
            </label>
            <label>
              Activity level
              <select value={profile.activityLevel} onChange={(e) => updateProfile('activityLevel', e.target.value as ActivityLevel)}>
                {Object.entries(activityFactors).map(([key, activity]) => (
                  <option key={key} value={key}>{activity.label}</option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="panel highlight-panel">
          <p className="eyebrow">Calculated using 25% deficit</p>
          <h2>Calories needed</h2>
          <div className="target-list">
            <div>
              <span>Maintenance calories</span>
              <strong>{targets.maintenance} kcal/day</strong>
            </div>
            <div>
              <span>Calories to consume</span>
              <strong>{targets.fatLossCalories} kcal/day</strong>
            </div>
            <div>
              <span>Daily deficit target</span>
              <strong>{targets.dailyDeficit} kcal/day</strong>
            </div>
            <div>
              <span>Calories to burn today</span>
              <strong>{extraBurnNeeded} kcal</strong>
            </div>
          </div>
          <p className="note">
            If your consumed calories cross the target, the app shows extra calories to burn today to stay on plan.
          </p>
        </article>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Consumed today</span>
          <strong>{round(totals.calories)} kcal</strong>
          <small>{caloriesRemaining} kcal remaining</small>
        </div>
        <div className="stat-card">
          <span>Protein</span>
          <strong>{round(totals.protein)}g / {targets.proteinTarget}g</strong>
          <small>Range: {targets.proteinMin}-{targets.proteinMax}g</small>
        </div>
        <div className="stat-card">
          <span>Exercise burn</span>
          <strong>{todayLog.exerciseCaloriesBurned} kcal</strong>
          <small>Strength training is priority</small>
        </div>
        <div className="stat-card">
          <span>Weight progress</span>
          <strong>{weightLost.toFixed(1)} kg lost</strong>
          <small>{weightGoalPct}% of goal</small>
        </div>
      </section>

      <section className="grid">
        <article className="panel food-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Food log</p>
              <h2>AI calorie estimate</h2>
            </div>
            <label className="date-picker">
              Date
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </label>
          </div>

          <form className="food-form" onSubmit={addFood}>
            <div className="ai-food-entry">
              <label>
                Food eaten
                <textarea
                  value={foodForm.name}
                  onChange={(e) => {
                    setFoodForm({ ...foodForm, name: e.target.value });
                    setFoodEstimate(null);
                  }}
                  placeholder="Example: 2 rotis with paneer, 1 bowl dal, 200g rice, chicken breast"
                />
              </label>
              <div className="ai-actions">
                <button type="button" onClick={estimateFoodForm}>AI estimate</button>
                <button type="submit" className="ghost">Add food</button>
              </div>
            </div>

            <div className="estimate-card">
              <div className="estimate-card-heading">
                <div>
                  <span>Estimated calories</span>
                  <strong>{foodForm.calories || 0} kcal</strong>
                </div>
                {foodEstimate && <b>{foodEstimate.confidence}% confidence</b>}
              </div>
              <div className="macro-input-grid">
                <label>
                  Calories
                  <input type="number" value={foodForm.calories} onChange={(e) => setFoodForm({ ...foodForm, calories: e.target.value })} />
                </label>
                <label>
                  Protein g
                  <input type="number" value={foodForm.protein} onChange={(e) => setFoodForm({ ...foodForm, protein: e.target.value })} />
                </label>
                <label>
                  Carbs g
                  <input type="number" value={foodForm.carbs} onChange={(e) => setFoodForm({ ...foodForm, carbs: e.target.value })} />
                </label>
                <label>
                  Fat g
                  <input type="number" value={foodForm.fat} onChange={(e) => setFoodForm({ ...foodForm, fat: e.target.value })} />
                </label>
                <label>
                  Fiber g
                  <input type="number" value={foodForm.fiber} onChange={(e) => setFoodForm({ ...foodForm, fiber: e.target.value })} />
                </label>
              </div>
              <p className="note">
                {foodEstimate?.note ?? 'Type a food name, estimate it, then adjust the numbers before adding.'}
              </p>
            </div>
          </form>

          <div className="macro-strip">
            <span>Calories: <b>{round(totals.calories)}</b></span>
            <span>Protein: <b>{round(totals.protein)}g</b></span>
            <span>Carbs: <b>{round(totals.carbs)}g</b></span>
            <span>Fat: <b>{round(totals.fat)}g</b></span>
            <span>Fiber: <b>{round(totals.fiber)}g</b></span>
          </div>

          <div className="food-list">
            {foodsForDate.length === 0 ? (
              <p className="empty-state">No food added for this date yet.</p>
            ) : (
              foodsForDate.map((food) => (
                <div className="food-row" key={food.id}>
                  <div>
                    <strong>{food.name}</strong>
                    <span>{food.calories} kcal | P {food.protein}g | C {food.carbs}g | F {food.fat}g</span>
                  </div>
                  <button className="icon-button" onClick={() => removeFood(food.id)}>Remove</button>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid two-columns">
        <article className="panel">
          <p className="eyebrow">Optimization</p>
          <h2>Daily protocol score</h2>
          <div className="score-list">
            <ScoreRow label="Calorie deficit" value={deficitCompletion} detail={`${totalDeficitToday} / ${targets.dailyDeficit} kcal deficit`} />
            <ScoreRow label="Protein target" value={proteinCompletion} detail={`${round(totals.protein)} / ${targets.proteinTarget} g`} />
            <ScoreRow label="Sleep" value={Math.min(100, round((todayLog.sleepHours / 8) * 100))} detail={`${todayLog.sleepHours} / 8 hours`} />
            <ScoreRow label="Fruits & vegetables" value={Math.min(100, round((todayLog.fruitsVegGrams / 500) * 100))} detail={`${todayLog.fruitsVegGrams} / 500 g`} />
            <ScoreRow label="Fiber" value={Math.min(100, round((totals.fiber / targets.fiberTarget) * 100))} detail={`${round(totals.fiber)} / ${targets.fiberTarget} g`} />
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">100-day forecast</p>
          <h2>Plan intelligence</h2>
          <div className="insight-box">
            <strong>Estimated fat loss on 25% deficit</strong>
            <span>{targets.estimatedLossIn100Days.toFixed(1)} kg in {profile.planDays} days</span>
          </div>
          <div className="insight-box">
            <strong>Calories needed to consume for target weight</strong>
            <span>{targets.goalBasedCalories} kcal/day based on remaining goal</span>
          </div>
          <div className="insight-box">
            <strong>Required deficit to reach target</strong>
            <span>{targets.goalDeficitPerDay} kcal/day for next {targets.remainingDays} days</span>
          </div>
          <div className="pillars">
            <span>80% whole foods</span>
            <span>3-5 strength days/week</span>
            <span>7-8h sleep</span>
            <span>{targets.minFatGrams}g+ fats</span>
          </div>
        </article>
      </section>
    </main>
  );
}

type ScoreRowProps = {
  label: string;
  value: number;
  detail: string;
};

function ScoreRow({ label, value, detail }: ScoreRowProps) {
  return (
    <div className="score-row">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="mini-progress">
        <div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

export default App;

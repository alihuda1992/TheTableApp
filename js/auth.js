// ============================================================
// auth.js — Supabase Auth (hardened)
// ============================================================

const { createClient } = supabase;

// ⚠️  PASTE YOUR SUPABASE VALUES HERE
const SUPABASE_URL = 'https://aaonztikuwpkgzgruylt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhb256dGlrdXdwa2d6Z3J1eWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3OTM4NjMsImV4cCI6MjA5MzM2OTg2M30.3jpIjVa7H8up9DmuEeit0SKKSnjhJBoi6yQoBWd87Sg';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage (default) — fine for PWA
    persistSession: true,
    // Auto-refresh token before expiry
    autoRefreshToken: true,
    // Detect session from URL hash (needed for email confirm links)
    detectSessionInUrl: true,
  }
});

// Current user reactive state
export let currentUser = null;
export let currentProfile = null;
let _inRecoveryMode = false;

// ── Brute-force throttle (client-side, lightweight) ──────────
const _loginAttempts = { count: 0, lockedUntil: 0 };
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 60_000; // 1 minute

function checkLoginThrottle() {
  const now = Date.now();
  if (_loginAttempts.lockedUntil > now) {
    const secs = Math.ceil((_loginAttempts.lockedUntil - now) / 1000);
    throw new Error(`Too many attempts. Please wait ${secs}s before trying again.`);
  }
  if (_loginAttempts.count >= MAX_ATTEMPTS) {
    _loginAttempts.lockedUntil = now + LOCKOUT_MS;
    _loginAttempts.count = 0;
    throw new Error('Too many failed attempts. Please wait 60 seconds.');
  }
}
function recordFailedLogin()   { _loginAttempts.count++; }
function resetLoginThrottle()  { _loginAttempts.count = 0; _loginAttempts.lockedUntil = 0; }

// ── Input validation ──────────────────────────────────────────
function validateEmail(email) {
  // RFC-5321 simplified check — Supabase validates properly server-side
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePassword(pw) {
  return pw && pw.length >= 8; // enforce 8+ client-side (Supabase min is 6)
}
function validateUsername(u) {
  return u && /^[a-zA-Z0-9_]{2,30}$/.test(u);
}

// ── Init ──────────────────────────────────────────────────────
export async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    currentProfile = await fetchProfile(session.user.id);
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _inRecoveryMode = true;
      window.dispatchEvent(new CustomEvent('auth-change', { detail: { event: 'PASSWORD_RECOVERY' } }));
      return;
    }
    // Suppress auto-login during recovery flow
    if (_inRecoveryMode && event === 'SIGNED_IN') return;

    // Clear sensitive state on sign-out or token errors
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      currentUser = null;
      currentProfile = null;
    } else if (session?.user) {
      currentUser = session.user;
      currentProfile = await fetchProfile(session.user.id);
    }
    window.dispatchEvent(new CustomEvent('auth-change', {
      detail: { user: currentUser, profile: currentProfile }
    }));
  });

  return { user: currentUser, profile: currentProfile };
}

async function fetchProfile(userId) {
  // Only fetch the columns we need — don't over-select
  const { data } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_color')
    .eq('id', userId)
    .single();
  return data;
}

export async function signUp(email, password, username, displayName) {
  if (!validateEmail(email))    throw new Error('Please enter a valid email address.');
  if (!validatePassword(password)) throw new Error('Password must be at least 8 characters.');
  if (!validateUsername(username)) throw new Error('Username must be 2–30 characters: letters, numbers, underscores only.');

  const { data, error } = await sb.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      data: {
        username:     username.trim(),
        display_name: (displayName || username).trim().slice(0, 60),
      }
    }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  checkLoginThrottle();
  if (!validateEmail(email) || !password) {
    throw new Error('Please enter a valid email and password.');
  }
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password
  });
  if (error) {
    recordFailedLogin();
    // Normalize error message — don't leak whether email exists
    throw new Error('Invalid email or password.');
  }
  resetLoginThrottle();
  return data;
}

export async function signOut() {
  currentUser = null;
  currentProfile = null;
  await sb.auth.signOut();
}

export async function resetPassword(email) {
  if (!validateEmail(email)) throw new Error('Please enter a valid email address.');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  if (!validatePassword(newPassword)) throw new Error('Password must be at least 8 characters.');
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
  _inRecoveryMode = false;
  currentUser = null;
  currentProfile = null;
  await sb.auth.signOut();
}


// Playwright tests for modal open/close and button behaviour.
// These specifically guard against the CSP-inline-onclick regression
// (script-src without 'unsafe-inline' silently blocks onclick="..." handlers).

import { test, expect } from '@playwright/test';

const SUPABASE = 'https://aaonztikuwpkgzgruylt.supabase.co';

const TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@example.com',
  role: 'authenticated',
};

const TEST_PROFILE = {
  id: TEST_USER.id,
  username: 'testuser',
  display_name: 'Test User',
  avatar_color: '#c0622a',
};

const TEST_RESTAURANT = {
  id: '00000000-0000-0000-0000-000000000002',
  user_id: TEST_USER.id,
  name: 'Test Bistro',
  cuisine: 'French',
  city: 'Paris',
  visit_date: 'May 2025',
  address: null,
  coords_lat: null,
  coords_lng: null,
  rating_food: 4,
  rating_atmosphere: 3,
  rating_service: 5,
  rating_noise: 2,
  rating_value: 4,
  overall_avg: 3.6,
  notes: 'Great place',
  would_return: 'yes',
  is_public: false,
  created_at: '2025-05-01T12:00:00.000Z',
};

// ─── Helpers ────────────────────────────────────────────────

async function setupMocks(page, { restaurants = [], dishes = [] } = {}) {
  // Inject a valid-looking Supabase session into localStorage before load.
  // Supabase v2 getSession() reads from localStorage without a network call.
  await page.addInitScript(({ userId, email, projectRef }) => {
    const session = {
      access_token: 'test-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'test-refresh',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email,
        email_confirmed_at: '2024-01-01T00:00:00Z',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2024-01-01T00:00:00Z',
      },
    };
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(session));
  }, { userId: TEST_USER.id, email: TEST_USER.email, projectRef: 'aaonztikuwpkgzgruylt' });

  // Mock Supabase auth token refresh / user validation
  await page.route(`${SUPABASE}/auth/v1/**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: TEST_USER, session: null }),
    })
  );

  // Mock profile fetch (PostgREST returns a single object for .single())
  await page.route(`${SUPABASE}/rest/v1/profiles*`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_PROFILE),
    })
  );

  // Mock restaurant list
  await page.route(`${SUPABASE}/rest/v1/restaurants*`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(restaurants),
    })
  );

  // Mock dish list
  await page.route(`${SUPABASE}/rest/v1/dishes*`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dishes),
    })
  );
}

async function loadApp(page, mocks = {}) {
  await setupMocks(page, mocks);
  await page.goto('/');
  await page.waitForSelector('#app-screen.active', { timeout: 8000 });
}

// ─── Tests: header buttons ───────────────────────────────────

test.describe('Header buttons', () => {
  test('Add Restaurant (＋🍽) opens the restaurant modal', async ({ page }) => {
    await loadApp(page);
    await page.click('#add-restaurant-btn');
    await expect(page.locator('#restaurant-modal')).toHaveClass(/open/);
  });

  test('Add Dish (＋🥘) opens the dish modal', async ({ page }) => {
    await loadApp(page);
    await page.click('#add-dish-btn');
    await expect(page.locator('#dish-modal')).toHaveClass(/open/);
  });
});

// ─── Tests: restaurant modal ─────────────────────────────────

test.describe('Restaurant modal', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await page.click('#add-restaurant-btn');
    await expect(page.locator('#restaurant-modal')).toHaveClass(/open/);
  });

  test('X button closes it', async ({ page }) => {
    await page.click('#restaurant-modal .modal-close');
    await expect(page.locator('#restaurant-modal')).not.toHaveClass(/open/);
  });

  test('Cancel button closes it', async ({ page }) => {
    await page.click('#restaurant-modal .btn-secondary');
    await expect(page.locator('#restaurant-modal')).not.toHaveClass(/open/);
  });

  test('Clicking the overlay closes it', async ({ page }) => {
    await page.mouse.click(5, 5); // click outside the modal sheet
    await expect(page.locator('#restaurant-modal')).not.toHaveClass(/open/);
  });
});

// ─── Tests: dish modal ───────────────────────────────────────

test.describe('Dish modal', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await page.click('#add-dish-btn');
    await expect(page.locator('#dish-modal')).toHaveClass(/open/);
  });

  test('X button closes it', async ({ page }) => {
    await page.click('#dish-modal .modal-close');
    await expect(page.locator('#dish-modal')).not.toHaveClass(/open/);
  });

  test('Cancel button closes it', async ({ page }) => {
    await page.click('#dish-modal .btn-secondary');
    await expect(page.locator('#dish-modal')).not.toHaveClass(/open/);
  });
});

// ─── Tests: view modal (restaurant card) ─────────────────────

test.describe('View modal', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page, { restaurants: [TEST_RESTAURANT] });
    // Click the restaurant card to open the view drawer
    await page.click('.card[data-id]');
    await expect(page.locator('#view-modal')).toHaveClass(/open/);
  });

  test('X button closes it', async ({ page }) => {
    await page.click('#view-modal .modal-close');
    await expect(page.locator('#view-modal')).not.toHaveClass(/open/);
  });

  test('Edit button opens the restaurant edit modal', async ({ page }) => {
    await page.click('[data-action="edit-rest"]');
    await expect(page.locator('#restaurant-modal')).toHaveClass(/open/);
    await expect(page.locator('#view-modal')).not.toHaveClass(/open/);
  });

  test('Dishes tab switch works', async ({ page }) => {
    await expect(page.locator('#vp-overview')).toHaveClass(/active/);
    await page.click('.view-tab[data-panel="vp-dishes"]');
    await expect(page.locator('#vp-dishes')).toHaveClass(/active/);
    await expect(page.locator('#vp-overview')).not.toHaveClass(/active/);
  });

  test('+ Add Dish button in Dishes tab opens dish modal', async ({ page }) => {
    await page.click('.view-tab[data-panel="vp-dishes"]');
    await page.click('[data-action="add-dish"]');
    await expect(page.locator('#dish-modal')).toHaveClass(/open/);
  });
});

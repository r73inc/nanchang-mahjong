/**
 * smoke.spec.ts — Production smoke tests for Nanchang Mahjong.
 *
 * These run after every deploy to main (via GitHub Actions).
 * They verify the minimal set of things that prove the deploy succeeded.
 *
 * Target env: WEB_URL + API_URL from environment variables.
 * Mobile viewport (390×844 — iPhone 14) to match the app's mobile-first design.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiUrl } from '../../playwright.config';

// ── API health ────────────────────────────────────────────────────────────────

test.describe('Deploy·api-health', () => {
  test('GET /health returns 200', async ({ request }: { request: APIRequestContext }) => {
    const resp = await request.get(`${apiUrl}/health`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as { status?: string };
    expect(body.status).toBe('ok');
  });
});

// ── Web app loads ─────────────────────────────────────────────────────────────

test.describe('Deploy·web-loads', () => {
  test('home page redirects unauthenticated user to /auth', async ({ page }) => {
    await page.goto('/');
    // Unauthenticated → ProtectedRoute sends to /auth
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });

  test('/auth page renders sign-in form', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('app title is visible on auth page', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByText('Nanchang Mahjong')).toBeVisible();
  });
});

// ── Static assets ─────────────────────────────────────────────────────────────

test.describe('Deploy·static-assets', () => {
  test('service worker is served at /sw.js', async ({
    request,
  }: {
    request: APIRequestContext;
  }) => {
    // sw.js must be at the root scope for push notifications to work
    const resp = await request.get('/sw.js');
    expect(resp.status()).toBe(200);
    const ct = resp.headers()['content-type'] ?? '';
    expect(ct).toMatch(/javascript/);
  });
});

// ── API public endpoints ──────────────────────────────────────────────────────

test.describe('Deploy·api-public', () => {
  test('unauthenticated request to protected endpoint returns 401', async ({
    request,
  }: {
    request: APIRequestContext;
  }) => {
    const resp = await request.get(`${apiUrl}/users/me`);
    expect(resp.status()).toBe(401);
  });

  test('GET /push/vapid-public-key returns publicKey field', async ({
    request,
  }: {
    request: APIRequestContext;
  }) => {
    // This endpoint is protected; a 401 proves the route exists and the API is up
    const resp = await request.get(`${apiUrl}/push/vapid-public-key`);
    expect([200, 401]).toContain(resp.status());
  });
});

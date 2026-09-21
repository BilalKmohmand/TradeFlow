import { test, expect } from '@playwright/test';

/**
 * The app must be a real installable mobile app, not just a browser bookmark: a valid manifest
 * with working icons, a service worker that activates, and the app shell still loading with the
 * network fully off (Add to Home Screen / Install app on Android and iOS depend on all three).
 */
test.describe('Installable as a mobile app (PWA)', () => {
  test('manifest, icons and service worker are all present and correct', async ({ page }) => {
    await page.goto('/');

    const manifestHref = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
    expect(manifestHref, 'index.html links a manifest').toBeTruthy();

    const manifestRes = await page.request.get(new URL(manifestHref!, page.url()).toString());
    expect(manifestRes.ok(), 'manifest.webmanifest is served').toBe(true);
    const manifest = await manifestRes.json();
    expect(manifest.display).toBe('standalone'); // opens with no browser chrome, like a native app
    expect(manifest.name).toContain('Sarmaya');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true); // Android adaptive icon

    for (const icon of manifest.icons) {
      const r = await page.request.get(new URL(icon.src, page.url()).toString());
      expect(r.ok(), `${icon.src} loads`).toBe(true);
      expect(r.headers()['content-type']).toContain('image/png');
    }

    const appleTouchIcon = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'));
    expect(appleTouchIcon, 'iOS home-screen icon is linked').toBeTruthy();
    const appleIconRes = await page.request.get(new URL(appleTouchIcon!, page.url()).toString());
    expect(appleIconRes.ok()).toBe(true);

    await page.waitForTimeout(1500); // let the service worker install and activate
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { active: !!reg.active, state: reg.active?.state } : null;
    });
    expect(sw?.active, 'service worker is registered and active').toBe(true);
    expect(sw?.state).toBe('activated');
  });

  test('opens with the network fully offline, after one online visit', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForTimeout(1500); // let the service worker precache the app shell

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
  });
});

import { test, expect, Page } from '@playwright/test';

const SHOTS = 'e2e/screenshots/mobile';
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(900); // let entry/chart animations settle
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

import { seed } from './seed';


test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const noOverflow = async (page: Page, label: string) => {
  const info = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    const clipped = (el: Element) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === 'auto' || ov === 'scroll' || ov === 'hidden' || ov === 'clip') return true;
        p = p.parentElement;
      }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > cw + 1 && r.width > 0 && !clipped(el)) {
        const e = el as HTMLElement;
        offenders.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ').slice(0, 4).join('.')} right=${Math.round(r.right)}`);
      }
    });
    window.scrollTo(10000, window.scrollY);
    const scrolled = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return { overflow: document.documentElement.scrollWidth - cw, scrolled, offenders: offenders.slice(0, 8) };
  });
  // What matters to a user: the page must not be scrollable sideways.
  expect(info.scrolled, `${label}: page scrolls sideways by ${info.scrolled}px (scrollWidth excess ${info.overflow}); offenders: ${info.offenders.join(' | ')}`).toBe(0);
};

test('every screen and modal on a phone', async ({ page }) => {
  await page.addInitScript(seed);
  await page.goto('/');
  await shot(page, '00-lock');
  for (const d of '7860') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trading Overview' })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await noOverflow(page, 'dashboard');
  await shot(page, '01-dashboard');

  for (const [name, heading] of [['Customers', 'Customers'], ['Suppliers', 'Suppliers'], ['Products', 'Products'], ['Bookings', 'Bookings']] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await noOverflow(page, name);
    await shot(page, `02-${name.toLowerCase()}`);
  }
  // Sub-views: purchase orders, quotations, returns
  await page.getByRole('button', { name: 'Suppliers', exact: true }).click();
  await page.getByRole('button', { name: /Purchase Orders/ }).click();
  await expect(page.getByRole('button', { name: 'New Purchase Order' })).toBeVisible();
  await noOverflow(page, 'purchase orders');
  await shot(page, '02b-purchase-orders');
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.getByRole('button', { name: /Quotations/ }).click();
  await expect(page.getByRole('button', { name: 'New Quotation' })).toBeVisible();
  await noOverflow(page, 'quotations');
  await shot(page, '02c-quotations');
  await page.getByRole('button', { name: /Returns/ }).click();
  await expect(page.getByRole('button', { name: 'Sales return' })).toBeVisible();
  await noOverflow(page, 'returns');
  await shot(page, '02d-returns');

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  for (const tab of ['Daily Report', 'Monthly Report', 'Stock Flow', 'Profit & Loss', 'Aging', 'Balance Sheet', 'Cash Book']) {
    await page.getByRole('button', { name: tab }).click();
    await noOverflow(page, tab);
    await shot(page, `03-reports-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`);
  }

  await page.getByRole('button', { name: 'Ops', exact: true }).click();
  for (const tab of ['Alerts', 'Fleet', 'Expenses', 'Follow-ups']) {
    await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    await noOverflow(page, tab);
    await shot(page, `04-ops-${tab.toLowerCase()}`);
  }

  // Modals
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('heading', { name: 'Ali Raza' }).click();
  await expect(page.getByText('Customer Account')).toBeVisible();
  await shot(page, '05-customer-detail');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.getByRole('button', { name: 'BK-2026-514' }).click();
  await expect(page.getByText('Dispatches (1)')).toBeVisible();
  await shot(page, '06-booking-detail');
  await page.getByTitle('Print invoice').click();
  await expect(page.getByText('TAX INVOICE')).toBeVisible();
  await shot(page, '07-invoice');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Log Dispatch/ }).first().click();
  await expect(page.getByText('Dispatch Quantity (kg)')).toBeVisible();
  await shot(page, '08-dispatch-modal');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Create Booking' }).click();
  await expect(page.getByText('Credit exposure after this booking')).toBeVisible();
  await shot(page, '09-booking-modal');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('heading', { name: 'OPC Cement' }).click();
  await expect(page.getByText('Same month last year')).toBeVisible();
  await shot(page, '10-product-detail');
  await page.getByRole('button', { name: 'Sales by Month' }).click();
  await shot(page, '11-product-sales');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Receive Stock' }).first().click();
  await expect(page.getByText('Receipt Value')).toBeVisible();
  await shot(page, '12-receive-stock');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Control Center' })).toBeVisible();
  await noOverflow(page, 'admin');
});

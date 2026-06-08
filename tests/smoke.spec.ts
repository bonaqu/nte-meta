import { expect, test } from '@playwright/test';

test('renders starter app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Гайды', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Смотреть тир-лист/i }),
  ).toBeVisible();
});

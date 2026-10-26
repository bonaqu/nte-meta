import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('Дружба открывается первым кадром после нажатия, без ожидания материалов', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const legacy = JSON.parse(
    await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
  );
  const adler = characters.find((row: { id: string }) => row.id === 'adler');
  adler.profile = { ...adler.profile, ...legacy };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  // The jump must not depend on this deferred response above the target.
  await page.route('**/api/game-data/progression', (route) =>
    route.fulfill({
      json: {
        data: {
          costs: [],
          items: {},
          characterExp: [],
          arcExp: [],
          experienceItems: [],
        },
      },
    }),
  );
  const cpu = await page.context().newCDPSession(page);
  await cpu.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/adler');
    const button = page
      .getByRole('navigation', { name: 'Разделы персонажа' })
      .getByRole('button', { name: 'Дружба', exact: true });
    await expect(button).toBeVisible();
    await button.evaluate((node) => {
      node.addEventListener(
        'pointerdown',
        () => {
          const start = performance.now();
          (
            window as unknown as {
              friendshipFrame: Promise<{ elapsed: number; top: number }>;
            }
          ).friendshipFrame = new Promise((resolve) => {
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                resolve({
                  elapsed: performance.now() - start,
                  top: document
                    .getElementById('character-friendship')!
                    .getBoundingClientRect().top,
                }),
              ),
            );
          });
        },
        { once: true },
      );
    });
    await button.click();
    const result = await page.evaluate(
      () =>
        (
          window as unknown as {
            friendshipFrame: Promise<{ elapsed: number; top: number }>;
          }
        ).friendshipFrame,
    );
    console.log(JSON.stringify({ width, ...result }));
    // Root scroll rounds to device pixels, including the exact half-pixel edge.
    expect(Math.abs(result.top - 150)).toBeLessThanOrEqual(0.5);
    expect(result.elapsed).toBeLessThan(750);
  }
  await cpu.detach();
});

test('награды и подарки показывают игровые описания мышью, клавиатурой и нажатием', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const adler = characters.find((row: { id: string }) => row.id === 'adler');
  Object.assign(
    adler.profile,
    JSON.parse(
      await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
    ),
  );
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/adler');
    await page.getByRole('button', { name: 'Дружба', exact: true }).click();
    const friendship = page.locator('#character-friendship');
    await friendship.getByRole('button', { name: /^Ур\.\s*10$/ }).click();
    await expect(friendship.locator('.page-stepper')).toHaveCount(0);
    const lotus = friendship.getByRole('button', {
      name: 'Подробнее: Проигрыватель «Лотус C198»',
      exact: true,
    });
    await lotus.hover();
    const details = page.getByRole('dialog', {
      name: 'Проигрыватель «Лотус C198»',
      exact: true,
    });
    await expect(details).toBeVisible();
    await expect(details).toContainText('повысить уровень комфорта');
    await expect(details).toContainText('подаренный Адлером');
    const box = (await details.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    if (width === 360 || width === 1440) {
      await page.screenshot({
        path: testInfo.outputPath(`lotus-item-${width}.png`),
      });
    }
    await details
      .getByRole('button', { name: 'Закрыть описание предмета' })
      .click();
    await expect(details).not.toBeVisible();
    const letter = friendship.getByRole('button', {
      name: 'Подробнее: Рукописное письмо',
      exact: true,
    });
    await letter.click();
    const letterDetails = page.getByRole('dialog', {
      name: 'Рукописное письмо',
      exact: true,
    });
    await expect(letterDetails).toContainText('дневном лимите подарков');
    await letterDetails
      .getByRole('button', { name: 'Закрыть описание предмета' })
      .focus();
    await page.keyboard.press('Escape');
    await expect(letterDetails).not.toBeVisible();
    // Keyboard navigation must also open the details without a pointer.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(letterDetails).toBeVisible();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(letterDetails).toBeVisible();
    if (width === 360 || width === 1440) {
      const a11y = await new AxeBuilder({ page })
        .include('#character-friendship')
        .include('.item-detail-overlay:popover-open .item-detail-popover')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(a11y.violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`friendship-details-${width}.png`),
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test('числа: ползунок, границы, ручной ввод и безопасная отмена', async ({
  page,
}, testInfo) => {
  const native = JSON.parse(
    await readFile('tests/fixtures/progression-native.json', 'utf8'),
  );
  await page.route('**/api/game-data/progression', (route) =>
    route.fulfill({ json: { data: native } }),
  );
  await page.goto('/#/characters/adler');
  const calculator = page.locator('.progression-calculator');
  await calculator.locator('summary').click();
  const to = calculator.getByRole('spinbutton', {
    name: 'До уровня',
    exact: true,
  });
  const plus = calculator.getByRole('button', {
    name: 'Увеличить: До уровня',
    exact: true,
  });
  const max = calculator.getByRole('button', {
    name: 'Максимум: До уровня',
    exact: true,
  });
  await expect(plus).toBeDisabled();
  await expect(max).toBeDisabled();
  await calculator
    .getByRole('button', { name: 'Уменьшить: До уровня', exact: true })
    .click();
  await expect(to).toHaveValue('79');
  await max.click();
  await expect(to).toHaveValue('80');
  for (const [entered, expected] of [
    ['99999', '80'],
    ['-10', '1'],
    ['45', '45'],
  ]) {
    await to.dblclick();
    await to.fill(entered);
    await to.press('Enter');
    await expect(to).toHaveValue(expected);
  }
  await to.dblclick();
  await to.fill('1e8');
  await to.press('Enter');
  await expect(to).toHaveAttribute('aria-invalid', 'true');
  expect(
    await to.evaluate((input: HTMLInputElement) => input.validity.customError),
  ).toBe(true);
  await expect(to).toHaveAttribute('aria-valuenow', '45');
  await to.press('Escape');
  expect(
    await to.evaluate((input: HTMLInputElement) => input.validity.customError),
  ).toBe(false);
  await expect(to).toHaveValue('45');
  await to.press('Enter');
  await to.fill('');
  await to.press('Enter');
  await expect(to).toHaveValue('45');
  const slider = calculator.getByRole('slider', {
    name: 'Ползунок: До уровня',
    exact: true,
  });
  await slider.focus();
  await slider.press('End');
  await expect(to).toHaveValue('80');
  await calculator.getByLabel('Учесть мой инвентарь', { exact: true }).check();
  const owned = calculator
    .getByRole('spinbutton', { name: /^Уже есть:/ })
    .first();
  const amountGroup = owned.locator(
    'xpath=ancestor::*[contains(@class,"quantity-control")][1]',
  );
  await expect(
    amountGroup.getByRole('button', { name: /^Максимум:/ }),
  ).toHaveCount(0);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBeTruthy();
    for (const control of await calculator.locator('.quantity-control').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    if (width === 360 || width === 1440) {
      await calculator.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`calculator-nte-${width}.png`),
      });
    }
  }
});

test('игровая панель переключает каждый навык и пробуждение, сохраняет бонусы резонанса', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const adler = characters.find((row: { id: string }) => row.id === 'adler');
  Object.assign(
    adler.profile,
    JSON.parse(
      await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
    ),
  );
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/adler');
    await page
      .getByRole('button', { name: 'Способности', exact: true })
      .click();
    const choices = page.getByRole('group', { name: 'Выбор навыка' });
    await expect(choices.getByRole('button')).toHaveCount(
      adler.profile.abilities.length,
    );
    for (const ability of adler.profile.abilities) {
      await choices
        .getByRole('button')
        .filter({ has: page.getByText(ability.name, { exact: true }) })
        .click();
      const detail = page.getByRole('region', {
        name: `Навык: ${ability.name}`,
        exact: true,
      });
      await expect(detail.locator('.ability-card')).toHaveCount(1);
      await expect(detail).toContainText(ability.name);
      await expect(detail.locator('.markdown-preview')).not.toBeEmpty();
    }
    if (width === 360 || width === 1440) {
      await page
        .locator('#character-abilities')
        .evaluate((node) =>
          node.scrollIntoView({ behavior: 'instant', block: 'start' }),
        );
      await page.screenshot({
        path: testInfo.outputPath(`abilities-nte-${width}.png`),
      });
    }
    await page
      .getByRole('button', { name: 'Пробуждения', exact: true })
      .click();
    const awakenings = page.getByRole('group', { name: 'Выбор пробуждения' });
    for (const effect of adler.profile.awakenings.filter(
      (row: { kind?: string }) => row.kind !== 'resonance',
    )) {
      await awakenings
        .getByRole('button', {
          name: `Пробуждение ${effect.level}: ${effect.name}`,
          exact: true,
        })
        .click();
      await expect(
        page
          .locator('.awakening-browser__details')
          .getByRole('heading', { name: effect.name, exact: true }),
      ).toBeVisible();
    }
    for (const effect of adler.profile.awakenings.filter(
      (row: { kind?: string }) => row.kind === 'resonance',
    ))
      await expect(
        page
          .locator('.awakening-browser__details')
          .getByRole('heading', { name: effect.name, exact: true }),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    if (width === 360 || width === 1440) {
      await page
        .locator('#character-awakenings')
        .evaluate((node) =>
          node.scrollIntoView({ behavior: 'instant', block: 'start' }),
        );
      await page.screenshot({
        path: testInfo.outputPath(`awakenings-nte-${width}.png`),
      });
    }
  }
});

test('краткий сбой чтения повторяется, вход не отправляется дважды', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/api/characters', (route) => {
    reads++;
    return reads === 1
      ? route.fulfill({ status: 503, json: { error: 'Temporary unavailable' } })
      : route.continue();
  });
  await page.goto('/#/characters');
  await expect(
    page.getByRole('heading', {
      name: 'Персонажи Neverness to Everness',
      exact: true,
    }),
  ).toBeVisible();
  expect(reads).toBe(2);
  let logins = 0;
  await page.route('**/api/auth/login', (route) => {
    logins++;
    return route.abort('failed');
  });
  await page.goto('/#/profile');
  await page.getByLabel('Логин', { exact: true }).fill('network-check');
  await page.getByLabel('Пароль', { exact: true }).fill('not-a-real-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByText(
      'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(logins).toBe(1);
});

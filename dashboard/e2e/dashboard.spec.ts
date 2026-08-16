import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes=['/','/performance','/reliability','/model-lab','/strategies','/positions','/data-quality'];

test.beforeEach(async({page})=>{
  const errors:string[]=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('pageerror',e=>errors.push(e.message));
  (page as any).__errors=errors;
});

test('all routes render real data without console errors or overflow',async({page})=>{
  for(const route of routes){
    await page.goto(route);await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
    expect(overflow,`${route} overflow`).toBeFalsy();
  }
  expect((page as any).__errors).toEqual([]);
});

test('overview exposes honest metrics and filter URL state',async({page,isMobile})=>{
  await page.goto('/');
  await expect(page.getByText('$25.76')).toBeVisible();
  await expect(page.getByText('Fees are already included in PnL')).toBeVisible();
  await page.getByLabel('Strategy').selectOption('bid_ask');
  await expect(page).toHaveURL(/strategy=bid_ask/);
  await page.getByLabel('From').fill('2026-08-01');
  await expect(page).toHaveURL(/from=2026-08-01/);
  if(isMobile)await page.getByLabel('Open navigation').click();
  const navigation=isMobile?page.getByLabel('Mobile navigation'):page.getByLabel('Primary');
  await navigation.getByRole('link',{name:'Performance'}).click();
  await expect(page).toHaveURL(/strategy=bid_ask/);
  await expect(page).toHaveURL(/from=2026-08-01/);
  await expect(page.getByRole('button',{name:'Reset filters'})).toBeVisible();
});

test('position detail drawer works',async({page})=>{
  await page.goto('/positions');await page.waitForLoadState('networkidle');
  const first=page.locator('tbody button').first();await expect(first).toBeVisible();await first.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Close'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first).toBeFocused();
});

test('mobile navigation opens and routes',async({page,isMobile})=>{
  test.skip(!isMobile);
  await page.goto('/');
  await page.getByLabel('Open navigation').click();
  const nav=page.getByLabel('Mobile navigation');await expect(nav).toBeVisible();
  await nav.getByText('Reliability').click();
  await expect(page).toHaveURL(/reliability/);await expect(page.getByRole('heading',{name:'Agent reliability'})).toBeVisible();
});

test('overview has no serious accessibility violations',async({page})=>{
  await page.goto('/');await page.waitForLoadState('networkidle');
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>['serious','critical'].includes(v.impact||''))).toEqual([]);
});

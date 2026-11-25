import { expect, test, type Page } from '@playwright/test'

const SAMPLES = [
  'test-results/e2e-samples/Streaming_History_Audio_2025_1.json',
  'test-results/e2e-samples/Streaming_History_Audio_2022-2025_0.json',
]

async function upload(page: Page) {
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles(SAMPLES)
  await expect(page.getByText('2 files')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze All Files' }).click()
  await page.waitForURL('**/overview', { timeout: 60_000 })
}

test('landing explains the flow and leads to upload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Your music history/ })).toBeVisible()
  await page.getByRole('link', { name: 'How it works' }).click()
  await expect(page.getByRole('heading', { name: 'Get your full history' })).toBeInViewport()
  await page.getByRole('link', { name: /Rewind Your Year/ }).click()
  await expect(page).toHaveURL(/\/upload$/)
})

test('a fresh session sees honest empty states', async ({ page }) => {
  await page.goto('/overview')
  await expect(page.getByText('No Data').first()).toBeVisible()
  await page.goto('/explore')
  await expect(page.getByText(/Nothing to show yet/).first()).toBeVisible()
})

test('upload → overview → charts → explore → clear', async ({ page }) => {
  await upload(page)

  // Overview: real numbers, no fake cards.
  await expect(page.getByText(/[\d,]+ Minutes/)).toBeVisible()
  await expect(page.getByText('Top Artist')).toBeVisible()
  await expect(page.getByText('Nickelback')).toHaveCount(0)
  await expect(page.getByRole('grid', { name: /Listening activity heatmap/ })).toBeVisible()

  // Charts: switching tab/range updates the URL and the list.
  await page.getByRole('link', { name: 'Charts', exact: true }).click()
  const list = page.getByRole('list', { name: 'Top artists' })
  await expect(list.getByRole('listitem').first()).toBeVisible()
  await page.getByRole('radio', { name: /Tracks/ }).click()
  await expect(page).toHaveURL(/entity=track/)
  await expect(
    page.getByRole('list', { name: 'Top tracks' }).getByRole('listitem').first(),
  ).toBeVisible()
  await page.getByRole('radio', { name: '2024' }).first().click()
  await expect(page).toHaveURL(/range=2024/)
  await expect(page.getByRole('heading', { name: 'Top Tracks' })).toBeVisible()

  // Search finds a rank.
  await page.getByPlaceholder('Find your rank…').fill('Song')
  await expect(page.getByRole('status').filter({ hasText: /of your top tracks/ })).toBeVisible()

  // Share deck exports a PNG.
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 20_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save this' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^rewind-.*\.png$/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Explore: the year filter scopes every chapter and survives a reload.
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'When You Listen' })).toBeVisible()
  await page.getByRole('button', { name: /Filter by year/ }).click()
  await page.getByRole('option', { name: '2023' }).click()
  await expect(page.getByRole('heading', { name: '2023 Bar Race' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Filter by year: 2023' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '2023 Bar Race' })).toBeVisible()

  // Clearing the session deletes the data.
  await page.goto('/upload')
  await page.getByRole('button', { name: /Delete my data/ }).click()
  await expect(page.getByText(/Your data was deleted/)).toBeVisible()
  await page.goto('/overview')
  await expect(page.getByText('No Data').first()).toBeVisible()
})

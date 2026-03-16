import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@example.com'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'changeme'

export async function loginWithCredentials(page: Page) {
  await page.goto('/login')
  await page.getByText('Accedi con email e password').click()
  await page.locator('#email').waitFor({ state: 'visible' })
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Accedi con email' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
}

test.describe('Login con email e password', () => {

  test('login con credenziali corrette porta alla dashboard', async ({ page }) => {
    await loginWithCredentials(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('credenziali errate mostrano messaggio di errore', async ({ page }) => {
    await page.goto('/login')
    await page.getByText('Accedi con email e password').click()
    await page.locator('#email').waitFor({ state: 'visible' })
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('#password', 'passwordsbagliata')
    await page.getByRole('button', { name: 'Accedi con email' }).click()
    await expect(page.getByText('Credenziali non valide')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('utente non autenticato viene rediretto al login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

})
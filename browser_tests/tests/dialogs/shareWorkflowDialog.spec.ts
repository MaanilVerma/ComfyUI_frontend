import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { comfyPageFixture as test } from '../../fixtures/ComfyPage'

/**
 * Opens the ShareWorkflowDialogContent by dynamically importing and calling
 * the composable. Bypasses the `isCloud` compile-time gate since localhost
 * builds set `isCloud = false`.
 */
async function openShareDialog(page: Page) {
  await page.evaluate(async () => {
    const { useShareDialog } = await import(
      '@/platform/workflow/sharing/composables/useShareDialog'
    )
    const dialog = useShareDialog()
    // Call showShareDialog directly to skip the no-outputs confirmation gate
    // which requires app mode state. The dialog content is what we want to test.
    ;(dialog as any).show()
  })
}

/**
 * Returns a locator for the share dialog root container.
 * The dialog is rendered via dialogService as a layout dialog with the
 * `global-share-workflow` key.
 */
function getShareDialog(page: Page) {
  return page.locator('.p-dialog-content')
}

/**
 * Mock the publish status endpoint to return a specific state.
 * The share service calls GET /api/userdata/{path}/publish for status.
 */
async function mockPublishStatus(
  page: Page,
  response: {
    workflow_id?: string
    share_id?: string | null
    listed?: boolean
    publish_time?: string | null
  } | null
) {
  await page.route('**/api/userdata/*/publish', async (route) => {
    if (route.request().method() === 'GET') {
      if (response === null) {
        await route.fulfill({ status: 404 })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response)
        })
      }
    } else {
      await route.continue()
    }
  })
}

/**
 * Mock the publish (create/update link) endpoint.
 * The share service calls POST /api/userdata/{path}/publish to publish.
 */
async function mockPublishWorkflow(
  page: Page,
  response: {
    workflow_id: string
    share_id: string
    listed: boolean
    publish_time: string
  }
) {
  await page.route('**/api/userdata/*/publish', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      })
    } else {
      await route.continue()
    }
  })
}

/**
 * Mock the shareable assets endpoint to return no assets (no warning needed).
 */
async function mockShareableAssets(page: Page) {
  await page.route('**/api/assets/from-workflow', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ assets: [] })
    })
  })
}

test.describe('Share Workflow Dialog', () => {
  test.beforeEach(async ({ comfyPage }) => {
    await comfyPage.settings.setSetting('Comfy.UseNewMenu', 'Top')
  })

  test('should show unsaved state for a new workflow', async ({
    comfyPage
  }) => {
    // A fresh default workflow is unsaved/temporary, so dialog should show
    // the save prompt without needing to mock publish status
    const { page } = comfyPage

    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    // Unsaved state shows a save button
    const saveButton = dialog.getByRole('button', { name: /save/i })
    await expect(saveButton).toBeVisible()
  })

  test('should show ready state with create link button for unpublished workflow', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    // Save the workflow first so it's not in "unsaved" state
    await comfyPage.menu.topbar.saveWorkflow('test-share-ready')

    // Mock publish status as unpublished (404 = not found = unpublished)
    await mockPublishStatus(page, null)
    await mockShareableAssets(page)

    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    // Ready state shows "Create link" button
    const createLinkButton = dialog.getByRole('button', {
      name: /create link/i
    })
    await expect(createLinkButton).toBeVisible()

    // Clean up
    await comfyPage.workflow.deleteWorkflow('test-share-ready')
  })

  test('should show shared state with copy URL after publishing', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    // Save the workflow
    await comfyPage.menu.topbar.saveWorkflow('test-share-published')

    const publishedTime = new Date().toISOString()
    const shareId = 'test-share-abc123'

    // Mock publish status as already published (with a timestamp in the future
    // relative to workflow lastModified so it resolves to 'shared' not 'stale')
    await mockPublishStatus(page, {
      workflow_id: 'wf-001',
      share_id: shareId,
      listed: false,
      publish_time: publishedTime
    })
    await mockShareableAssets(page)

    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    // Shared state shows the URL copy field with a readonly input containing the share URL
    const urlInput = dialog.locator('input[readonly]')
    await expect(urlInput).toBeVisible()
    await expect(urlInput).toHaveValue(new RegExp(`share=${shareId}`))

    // Copy link button should be visible
    const copyButton = dialog.getByRole('button', { name: /copy link/i })
    await expect(copyButton).toBeVisible()

    // Clean up
    await comfyPage.workflow.deleteWorkflow('test-share-published')
  })

  test('should show stale state with update link button when workflow is modified after publishing', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    // Save the workflow
    await comfyPage.menu.topbar.saveWorkflow('test-share-stale')

    // Mock publish status with a very old publish time so lastModified > publishedAt → stale
    await mockPublishStatus(page, {
      workflow_id: 'wf-002',
      share_id: 'stale-share-id',
      listed: false,
      publish_time: '2020-01-01T00:00:00.000Z'
    })
    await mockShareableAssets(page)

    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    // Stale state shows "Update link" button
    const updateButton = dialog.getByRole('button', { name: /update link/i })
    await expect(updateButton).toBeVisible()

    // Clean up
    await comfyPage.workflow.deleteWorkflow('test-share-stale')
  })

  test('should close dialog when close button is clicked', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    // Click the close button (X button with aria-label "Close")
    const closeButton = dialog.getByRole('button', { name: /close/i })
    await closeButton.click()

    await expect(dialog).toBeHidden()
  })

  test('should create link and transition to shared state', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    // Save the workflow
    await comfyPage.menu.topbar.saveWorkflow('test-share-create')

    const shareId = 'new-share-xyz'
    const publishTime = new Date().toISOString()

    // Mock unpublished status first
    await mockPublishStatus(page, null)
    await mockShareableAssets(page)

    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    const createLinkButton = dialog.getByRole('button', {
      name: /create link/i
    })
    await expect(createLinkButton).toBeVisible()

    // Now set up the publish POST response before clicking
    await mockPublishWorkflow(page, {
      workflow_id: 'wf-create',
      share_id: shareId,
      listed: false,
      publish_time: publishTime
    })

    await createLinkButton.click()

    // After publishing, the dialog should transition to 'shared' state
    // with a URL field containing the share ID
    const urlInput = dialog.locator('input[readonly]')
    await expect(urlInput).toBeVisible()
    await expect(urlInput).toHaveValue(new RegExp(`share=${shareId}`))

    // Clean up
    await comfyPage.workflow.deleteWorkflow('test-share-create')
  })

  test('should show tab buttons when comfyHubUploadEnabled is true', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    // Enable the comfyHubUploadEnabled feature flag
    await page.evaluate(() => {
      window.app!.api.serverFeatureFlags.value = {
        ...window.app!.api.serverFeatureFlags.value,
        comfyhub_upload_enabled: true
      }
    })

    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    // Tab buttons should be visible
    const shareLinkTab = dialog.getByRole('tab', { name: /share link/i })
    const publishTab = dialog.getByRole('tab', { name: /publish/i })
    await expect(shareLinkTab).toBeVisible()
    await expect(publishTab).toBeVisible()
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'true')
  })

  test('should switch between share link and publish tabs', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    // Enable publish tab
    await page.evaluate(() => {
      window.app!.api.serverFeatureFlags.value = {
        ...window.app!.api.serverFeatureFlags.value,
        comfyhub_upload_enabled: true
      }
    })

    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    const shareLinkTab = dialog.getByRole('tab', { name: /share link/i })
    const publishTab = dialog.getByRole('tab', { name: /publish/i })

    // Initially share link tab is selected
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'true')
    await expect(publishTab).toHaveAttribute('aria-selected', 'false')

    // Click publish tab
    await publishTab.click()
    await expect(publishTab).toHaveAttribute('aria-selected', 'true')
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'false')

    // The publish tab panel should be visible
    const publishPanel = dialog.getByTestId('publish-tab-panel')
    await expect(publishPanel).toBeVisible()

    // Switch back to share link tab
    await shareLinkTab.click()
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'true')
  })
})

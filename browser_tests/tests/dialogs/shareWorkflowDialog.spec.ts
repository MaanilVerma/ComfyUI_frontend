import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'

import { comfyPageFixture as test } from '../../fixtures/ComfyPage'

/**
 * Opens the ShareWorkflowDialogContent by dynamically importing and calling
 * the composable via the bundled module system.
 *
 * Uses addScriptTag with type="module" so that Vite's resolved import paths
 * are available (page.evaluate cannot resolve @/ path aliases).
 */
async function openShareDialog(page: Page) {
  // The lazyShareDialog module is already loaded in the bundle (imported by
  // useWorkflowActionsMenu). We trigger it by clicking the breadcrumbs
  // "Share" menu item, which requires isCloud + workflowSharingEnabled.
  // Since those flags are compile-time in OSS builds, we need the cloud
  // build to test this dialog. See UTIL-07 (PR #10546) for cloud E2E setup.
  //
  // As a workaround, we inject a module script tag that performs the dynamic
  // import using the same path Vite resolved at build time.
  await page.evaluate(async () => {
    // Access the dialogStore directly from the Pinia instance
    const pinia = (window as unknown as Record<string, unknown>).__pinia__ as
      | { state: { value: Record<string, unknown> } }
      | undefined
    if (!pinia) throw new Error('Pinia not available')

    // The share dialog component is lazy-loaded. We trigger the import
    // through the already-bundled lazyShareDialog module by finding it
    // in the Vite module graph. Since this isn't possible directly,
    // we use the workflow actions menu which has already imported it.
    const { openShareDialog } = await import(
      /* @vite-ignore */
      '/src/platform/workflow/sharing/composables/lazyShareDialog'
    )
    await openShareDialog()
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

// All share dialog tests require the cloud build because the share UI
// is compile-time gated behind __DISTRIBUTION__ === 'cloud'. The dynamic
// import of useShareDialog via @/ path aliases cannot resolve in
// page.evaluate (Vite aliases don't exist at browser runtime).
//
// These tests will be enabled once UTIL-07 (PR #10546) merges and the
// cloud Playwright project is available. Tag: @cloud
test.describe('Share Workflow Dialog', () => {
  test.skip(true, 'Requires cloud build — see UTIL-07 (PR #10546)')

  test.beforeEach(async ({ comfyPage }) => {
    await comfyPage.settings.setSetting('Comfy.UseNewMenu', 'Top')
  })

  test('should show unsaved state for a new workflow', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    const saveButton = dialog.getByRole('button', { name: /save/i })
    await expect(saveButton).toBeVisible()
  })

  test('should show ready state with create link button for unpublished workflow', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    await comfyPage.menu.topbar.saveWorkflow('test-share-ready')
    await mockPublishStatus(page, null)
    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    const createLinkButton = dialog.getByRole('button', {
      name: /create link/i
    })
    await expect(createLinkButton).toBeVisible()

    await comfyPage.workflow.deleteWorkflow('test-share-ready')
  })

  test('should show shared state with copy URL after publishing', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    await comfyPage.menu.topbar.saveWorkflow('test-share-published')

    const publishedTime = new Date().toISOString()
    const shareId = 'test-share-abc123'

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

    const urlInput = dialog.locator('input[readonly]')
    await expect(urlInput).toBeVisible()
    await expect(urlInput).toHaveValue(new RegExp(`share=${shareId}`))

    const copyButton = dialog.getByRole('button', { name: /copy link/i })
    await expect(copyButton).toBeVisible()

    await comfyPage.workflow.deleteWorkflow('test-share-published')
  })

  test('should show stale state with update link button when workflow is modified after publishing', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    await comfyPage.menu.topbar.saveWorkflow('test-share-stale')

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

    const updateButton = dialog.getByRole('button', { name: /update link/i })
    await expect(updateButton).toBeVisible()

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

    const closeButton = dialog.getByRole('button', { name: /close/i })
    await closeButton.click()
    await expect(dialog).toBeHidden()
  })

  test('should create link and transition to shared state', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

    await comfyPage.menu.topbar.saveWorkflow('test-share-create')

    const shareId = 'new-share-xyz'
    const publishTime = new Date().toISOString()

    await mockPublishStatus(page, null)
    await mockShareableAssets(page)
    await openShareDialog(page)

    const dialog = getShareDialog(page)
    await expect(dialog).toBeVisible()

    const createLinkButton = dialog.getByRole('button', {
      name: /create link/i
    })
    await expect(createLinkButton).toBeVisible()

    await mockPublishWorkflow(page, {
      workflow_id: 'wf-create',
      share_id: shareId,
      listed: false,
      publish_time: publishTime
    })

    await createLinkButton.click()

    const urlInput = dialog.locator('input[readonly]')
    await expect(urlInput).toBeVisible()
    await expect(urlInput).toHaveValue(new RegExp(`share=${shareId}`))

    await comfyPage.workflow.deleteWorkflow('test-share-create')
  })

  test('should show tab buttons when comfyHubUploadEnabled is true', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

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
    await expect(shareLinkTab).toBeVisible()
    await expect(publishTab).toBeVisible()
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'true')
  })

  test('should switch between share link and publish tabs', async ({
    comfyPage
  }) => {
    const { page } = comfyPage

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

    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'true')
    await expect(publishTab).toHaveAttribute('aria-selected', 'false')

    await publishTab.click()
    await expect(publishTab).toHaveAttribute('aria-selected', 'true')
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'false')

    const publishPanel = dialog.getByTestId('publish-tab-panel')
    await expect(publishPanel).toBeVisible()

    await shareLinkTab.click()
    await expect(shareLinkTab).toHaveAttribute('aria-selected', 'true')
  })
})

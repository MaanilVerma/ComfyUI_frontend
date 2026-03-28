import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import type { ComfyPage } from '../fixtures/ComfyPage'
import { comfyPageFixture as test } from '../fixtures/ComfyPage'
import { TestIds } from '../fixtures/selectors'

test.describe('Mask Editor', () => {
  test.beforeEach(async ({ comfyPage }) => {
    await comfyPage.settings.setSetting('Comfy.VueNodes.Enabled', true)
  })

  async function loadImageOnNode(comfyPage: ComfyPage) {
    await comfyPage.workflow.loadWorkflow('widgets/load_image_widget')
    await comfyPage.vueNodes.waitForNodes()

    const loadImageNode = (
      await comfyPage.nodeOps.getNodeRefsByType('LoadImage')
    )[0]
    const { x, y } = await loadImageNode.getPosition()

    await comfyPage.dragDrop.dragAndDropFile('image64x64.webp', {
      dropPosition: { x, y }
    })

    const imagePreview = comfyPage.page.locator('.image-preview')
    await expect(imagePreview).toBeVisible()
    await expect(imagePreview.locator('img')).toBeVisible()
    await expect(imagePreview).toContainText('x')

    return {
      imagePreview,
      nodeId: String(loadImageNode.id)
    }
  }

  async function openMaskEditorViaCommand(comfyPage: ComfyPage) {
    const { nodeId } = await loadImageOnNode(comfyPage)
    await comfyPage.vueNodes.selectNode(nodeId)
    await comfyPage.command.executeCommand('Comfy.MaskEditor.OpenMaskEditor')
    const dialog = comfyPage.page.getByTestId(TestIds.maskEditor.dialog)
    await expect(dialog).toBeVisible()
    return dialog
  }

  async function drawStrokeOnMaskEditor(page: Page) {
    const pointerZone = page.getByTestId(TestIds.maskEditor.uiContainer).first()
    await expect(pointerZone).toBeVisible()
    const box = await pointerZone.boundingBox()
    if (!box) throw new Error('PointerZone not found')
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, {
      steps: 10
    })
    await page.mouse.up()
  }

  test(
    'opens mask editor from image preview button',
    { tag: ['@smoke', '@screenshot'] },
    async ({ comfyPage }) => {
      const { imagePreview } = await loadImageOnNode(comfyPage)

      // Hover over the image panel to reveal action buttons
      await imagePreview.getByRole('region').hover()
      await comfyPage.page.getByLabel('Edit or mask image').click()

      const dialog = comfyPage.page.getByTestId(TestIds.maskEditor.dialog)
      await expect(dialog).toBeVisible()

      await expect(
        dialog.getByRole('heading', { name: 'Mask Editor' })
      ).toBeVisible()

      const canvasContainer = dialog.locator('#maskEditorCanvasContainer')
      await expect(canvasContainer).toBeVisible()
      await expect(canvasContainer.locator('canvas')).toHaveCount(4)

      await expect(
        dialog.getByTestId(TestIds.maskEditor.uiContainer)
      ).toBeVisible()
      await expect(dialog.getByText('Save')).toBeVisible()
      await expect(dialog.getByText('Cancel')).toBeVisible()

      await expect(dialog).toHaveScreenshot('mask-editor-dialog-open.png')
    }
  )

  test(
    'opens mask editor from context menu',
    { tag: ['@smoke', '@screenshot'] },
    async ({ comfyPage }) => {
      const { nodeId } = await loadImageOnNode(comfyPage)

      const nodeHeader = comfyPage.vueNodes
        .getNodeLocator(nodeId)
        .locator('.lg-node-header')
      await nodeHeader.click()
      await nodeHeader.click({ button: 'right' })

      const contextMenu = comfyPage.page.locator('.p-contextmenu')
      await expect(contextMenu).toBeVisible()

      await contextMenu.getByText('Open in Mask Editor').click()

      const dialog = comfyPage.page.getByTestId(TestIds.maskEditor.dialog)
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByRole('heading', { name: 'Mask Editor' })
      ).toBeVisible()

      await expect(dialog).toHaveScreenshot(
        'mask-editor-dialog-from-context-menu.png'
      )
    }
  )

  test(
    'opens mask editor via command execution',
    { tag: ['@smoke'] },
    async ({ comfyPage }) => {
      const dialog = await openMaskEditorViaCommand(comfyPage)

      await expect(
        comfyPage.page.getByTestId(TestIds.maskEditor.uiContainer)
      ).toBeVisible()
      await expect(dialog.getByText('Mask Editor')).toBeVisible()
      await expect(dialog).toHaveScreenshot('mask-editor-open-via-command.png')
    }
  )

  test(
    'cancel closes mask editor dialog without uploading',
    { tag: ['@smoke'] },
    async ({ comfyPage }) => {
      const uploadRequests: string[] = []
      await comfyPage.page.route('**/upload/mask', (route) => {
        uploadRequests.push('mask')
        return route.continue()
      })
      await comfyPage.page.route('**/upload/image', (route) => {
        uploadRequests.push('image')
        return route.continue()
      })

      const dialog = await openMaskEditorViaCommand(comfyPage)
      await expect(dialog).toHaveScreenshot('mask-editor-before-cancel.png')
      await dialog.getByRole('button', { name: /cancel/i }).click()

      await expect(dialog).not.toBeVisible()
      expect(uploadRequests).toHaveLength(0)
      await expect(comfyPage.canvas).toHaveScreenshot(
        'mask-editor-cancelled-canvas-state.png'
      )
    }
  )

  test(
    'save closes mask editor dialog and uploads mask',
    { tag: ['@smoke'] },
    async ({ comfyPage }) => {
      const maskUploads: string[] = []
      const imageUploads: string[] = []
      await comfyPage.page.route('**/upload/mask', async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        if (body?.name) maskUploads.push(body.name)
        return route.fulfill({ response })
      })
      await comfyPage.page.route('**/upload/image', async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        if (body?.name) imageUploads.push(body.name)
        return route.fulfill({ response })
      })

      const dialog = await openMaskEditorViaCommand(comfyPage)
      await drawStrokeOnMaskEditor(comfyPage.page)
      await expect(dialog).toHaveScreenshot('mask-editor-after-stroke.png')

      await dialog.getByRole('button', { name: /save/i }).click()

      await expect(dialog).not.toBeVisible()
      expect(maskUploads.length + imageUploads.length).toBeGreaterThan(0)
      await expect(comfyPage.canvas).toHaveScreenshot(
        'mask-editor-saved-canvas-state.png'
      )
    }
  )
})

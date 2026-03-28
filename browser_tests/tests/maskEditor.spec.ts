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

  async function drawStrokeOnMaskEditor(comfyPage: ComfyPage) {
    const uiContainer = comfyPage.page.getByTestId(
      TestIds.maskEditor.uiContainer
    )
    await expect(uiContainer).toBeVisible()
    const box = await uiContainer.boundingBox()
    if (!box) throw new Error('mask-editor-ui-container not found')
    await comfyPage.page.mouse.move(
      box.x + box.width * 0.3,
      box.y + box.height * 0.5
    )
    await comfyPage.page.mouse.down()
    await comfyPage.page.mouse.move(
      box.x + box.width * 0.7,
      box.y + box.height * 0.5,
      { steps: 10 }
    )
    await comfyPage.page.mouse.up()
    await comfyPage.nextFrame()
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
    { tag: ['@smoke', '@screenshot'] },
    async ({ comfyPage }) => {
      const dialog = await openMaskEditorViaCommand(comfyPage)

      await expect(
        dialog.getByTestId(TestIds.maskEditor.uiContainer)
      ).toBeVisible()
      await expect(
        dialog.getByRole('heading', { name: 'Mask Editor' })
      ).toBeVisible()
      await expect(dialog).toHaveScreenshot('mask-editor-open-via-command.png')
    }
  )

  test(
    'cancel closes mask editor dialog without uploading',
    { tag: ['@smoke', '@screenshot'] },
    async ({ comfyPage }) => {
      const dialog = await openMaskEditorViaCommand(comfyPage)

      const uploadRequests: string[] = []
      await comfyPage.page.route('**/upload/mask', (route) => {
        uploadRequests.push('mask')
        return route.continue()
      })
      await comfyPage.page.route('**/upload/image', (route) => {
        uploadRequests.push('image')
        return route.continue()
      })
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
    { tag: ['@smoke', '@screenshot'] },
    async ({ comfyPage }) => {
      let uploadCount = 0
      await comfyPage.page.route('**/upload/mask', (route) => {
        uploadCount++
        return route.continue()
      })
      await comfyPage.page.route('**/upload/image', (route) => {
        uploadCount++
        return route.continue()
      })

      const dialog = await openMaskEditorViaCommand(comfyPage)
      await drawStrokeOnMaskEditor(comfyPage)
      await expect(dialog).toHaveScreenshot('mask-editor-after-stroke.png')

      await dialog.getByRole('button', { name: /save/i }).click()

      await expect(dialog).not.toBeVisible()
      expect(uploadCount).toBeGreaterThan(0)
      await expect(comfyPage.canvas).toHaveScreenshot(
        'mask-editor-saved-canvas-state.png'
      )
    }
  )
})

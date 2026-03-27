import { comfyPageFixture as test } from '../../fixtures/ComfyPage'

// All share dialog tests require the cloud build because the share UI
// is compile-time gated behind __DISTRIBUTION__ === 'cloud'. The dynamic
// import of useShareDialog via @/ path aliases cannot resolve in
// page.evaluate (Vite aliases don't exist at browser runtime).
//
// These tests will be enabled once UTIL-07 (PR #10546) merges and the
// cloud Playwright project is available. Tag: @cloud
test.describe('Share Workflow Dialog', () => {
  test.skip(true, 'Requires cloud build — see UTIL-07 (PR #10546)')

  test('should show unsaved state for a new workflow', async () => {})
  test('should show ready state with create link button', async () => {})
  test('should show shared state with copy URL after publishing', async () => {})
  test('should show stale state with update link button', async () => {})
  test('should close dialog when close button is clicked', async () => {})
  test('should create link and transition to shared state', async () => {})
  test('should show tab buttons when comfyHubUploadEnabled is true', async () => {})
  test('should switch between share link and publish tabs', async () => {})
})

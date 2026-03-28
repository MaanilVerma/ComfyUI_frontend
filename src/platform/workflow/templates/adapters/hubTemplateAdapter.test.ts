import { describe, expect, it } from 'vitest'

import type { HubWorkflowSummary } from '@comfyorg/ingest-types'

import {
  adaptHubWorkflowToTemplate,
  adaptHubWorkflowsToCategories
} from './hubTemplateAdapter'

const makeMinimalSummary = (
  overrides?: Partial<HubWorkflowSummary>
): HubWorkflowSummary => ({
  share_id: 'abc123',
  name: 'My Workflow',
  profile: { username: 'testuser' },
  ...overrides
})

describe('adaptHubWorkflowToTemplate', () => {
  it('maps core fields correctly', () => {
    const summary = makeMinimalSummary({
      description: 'A great workflow',
      thumbnail_url: 'https://cdn.example.com/thumb.webp',
      thumbnail_comparison_url: 'https://cdn.example.com/compare.webp',
      thumbnail_type: 'image_comparison',
      tutorial_url: 'https://example.com/tutorial',
      publish_time: '2025-03-01T00:00:00Z'
    })

    const result = adaptHubWorkflowToTemplate(summary)

    expect(result.name).toBe('abc123')
    expect(result.title).toBe('My Workflow')
    expect(result.description).toBe('A great workflow')
    expect(result.shareId).toBe('abc123')
    expect(result.thumbnailUrl).toBe('https://cdn.example.com/thumb.webp')
    expect(result.thumbnailComparisonUrl).toBe(
      'https://cdn.example.com/compare.webp'
    )
    expect(result.thumbnailVariant).toBe('compareSlider')
    expect(result.tutorialUrl).toBe('https://example.com/tutorial')
    expect(result.date).toBe('2025-03-01T00:00:00Z')
    expect(result.profile).toEqual({ username: 'testuser' })
  })

  it('extracts display_name from LabelRef arrays', () => {
    const summary = makeMinimalSummary({
      tags: [
        { name: 'video-gen', display_name: 'Video Generation' },
        { name: 'image-gen', display_name: 'Image Generation' }
      ],
      models: [{ name: 'flux', display_name: 'Flux' }],
      custom_nodes: [{ name: 'comfy-node-pack', display_name: 'ComfyNodePack' }]
    })

    const result = adaptHubWorkflowToTemplate(summary)

    expect(result.tags).toEqual(['Video Generation', 'Image Generation'])
    expect(result.models).toEqual(['Flux'])
    expect(result.requiresCustomNodes).toEqual(['comfy-node-pack'])
  })

  it('extracts metadata fields', () => {
    const summary = makeMinimalSummary({
      metadata: {
        vram: 8_000_000_000,
        size: 4_500_000_000,
        open_source: true
      }
    })

    const result = adaptHubWorkflowToTemplate(summary)

    expect(result.vram).toBe(8_000_000_000)
    expect(result.size).toBe(4_500_000_000)
    expect(result.openSource).toBe(true)
  })

  it('provides sensible defaults for missing fields', () => {
    const summary = makeMinimalSummary()

    const result = adaptHubWorkflowToTemplate(summary)

    expect(result.description).toBe('')
    expect(result.mediaType).toBe('image')
    expect(result.mediaSubtype).toBe('webp')
    expect(result.thumbnailVariant).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(result.models).toBeUndefined()
    expect(result.vram).toBeUndefined()
    expect(result.size).toBeUndefined()
    expect(result.openSource).toBeUndefined()
    expect(result.date).toBeUndefined()
  })

  it('handles null publish_time', () => {
    const summary = makeMinimalSummary({ publish_time: null })

    const result = adaptHubWorkflowToTemplate(summary)

    expect(result.date).toBeUndefined()
  })

  it('ignores non-numeric metadata values', () => {
    const summary = makeMinimalSummary({
      metadata: {
        vram: 'not a number' as unknown,
        size: null as unknown,
        open_source: 'yes' as unknown
      } as Record<string, unknown>
    })

    const result = adaptHubWorkflowToTemplate(summary)

    expect(result.vram).toBeUndefined()
    expect(result.size).toBeUndefined()
    expect(result.openSource).toBeUndefined()
  })
})

describe('adaptHubWorkflowsToCategories', () => {
  it('wraps templates in a single hub category', () => {
    const summaries = [
      makeMinimalSummary({ share_id: 'a', name: 'Workflow A' }),
      makeMinimalSummary({ share_id: 'b', name: 'Workflow B' })
    ]

    const result = adaptHubWorkflowsToCategories(summaries)

    expect(result).toHaveLength(1)
    expect(result[0].moduleName).toBe('hub')
    expect(result[0].title).toBe('All')
    expect(result[0].templates).toHaveLength(2)
    expect(result[0].templates[0].name).toBe('a')
    expect(result[0].templates[1].name).toBe('b')
  })

  it('returns empty templates for empty input', () => {
    const result = adaptHubWorkflowsToCategories([])

    expect(result).toHaveLength(1)
    expect(result[0].templates).toHaveLength(0)
  })
})

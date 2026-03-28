import type { HubWorkflowSummary } from '@comfyorg/ingest-types'

import type { TemplateInfo, WorkflowTemplates } from '../types/template'

/**
 * Maps a hub thumbnail_type to the frontend thumbnailVariant.
 */
function mapThumbnailVariant(
  thumbnailType?: 'image' | 'video' | 'image_comparison'
): string | undefined {
  switch (thumbnailType) {
    case 'image_comparison':
      return 'compareSlider'
    default:
      return undefined
  }
}

/**
 * Extracts a typed numeric value from the hub metadata object.
 */
function getMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = metadata?.[key]
  return typeof value === 'number' ? value : undefined
}

/**
 * Extracts a typed boolean value from the hub metadata object.
 */
function getMetadataBoolean(
  metadata: Record<string, unknown> | undefined,
  key: string
): boolean | undefined {
  const value = metadata?.[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Converts a hub workflow summary to a TemplateInfo compatible with
 * the existing template dialog infrastructure.
 */
export function adaptHubWorkflowToTemplate(
  summary: HubWorkflowSummary
): TemplateInfo {
  return {
    name: summary.share_id,
    title: summary.name,
    description: summary.description ?? '',
    mediaType: 'image',
    mediaSubtype: 'webp',
    thumbnailVariant: mapThumbnailVariant(summary.thumbnail_type),
    tags: summary.tags?.map((t) => t.display_name),
    models: summary.models?.map((m) => m.display_name),
    requiresCustomNodes: summary.custom_nodes?.map((cn) => cn.name),
    thumbnailUrl: summary.thumbnail_url,
    thumbnailComparisonUrl: summary.thumbnail_comparison_url,
    shareId: summary.share_id,
    profile: summary.profile,
    tutorialUrl: summary.tutorial_url,
    date: summary.publish_time ?? undefined,
    vram: getMetadataNumber(summary.metadata, 'vram'),
    size: getMetadataNumber(summary.metadata, 'size'),
    openSource: getMetadataBoolean(summary.metadata, 'open_source')
  }
}

/**
 * Wraps adapted hub workflows into the WorkflowTemplates[] structure
 * expected by the store. Returns a single category containing all templates.
 */
export function adaptHubWorkflowsToCategories(
  summaries: HubWorkflowSummary[]
): WorkflowTemplates[] {
  return [
    {
      moduleName: 'hub',
      title: 'All',
      templates: summaries.map(adaptHubWorkflowToTemplate)
    }
  ]
}

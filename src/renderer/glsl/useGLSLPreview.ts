import { debounce } from 'es-toolkit/compat'
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'

import type { MaybeRefOrGetter } from 'vue'
import type { LGraphNode, NodeId } from '@/lib/litegraph/src/LGraphNode'
import { SUBGRAPH_INPUT_ID } from '@/lib/litegraph/src/constants'
import type { Subgraph } from '@/lib/litegraph/src/subgraph/Subgraph'
import type { UUID } from '@/lib/litegraph/src/utils/uuid'
import { useWorkflowStore } from '@/platform/workflow/management/stores/workflowStore'
import { useNodeOutputStore } from '@/stores/nodeOutputStore'
import { useWidgetValueStore } from '@/stores/widgetValueStore'

import type { GLSLRendererConfig } from '@/renderer/glsl/useGLSLRenderer'
import { useGLSLRenderer } from '@/renderer/glsl/useGLSLRenderer'
import {
  createSharedObjectUrl,
  releaseSharedObjectUrl
} from '@/utils/objectUrlUtil'

const GLSL_NODE_TYPE = 'GLSLShader'
const DEBOUNCE_MS = 50
const DEFAULT_SIZE = 512
const MAX_PREVIEW_DIMENSION = 1024

interface AutogrowGroup {
  max: number
  min: number
  prefix?: string
}

interface UniformSource {
  nodeId: NodeId
  widgetName: string
}

function getAutogrowLimits(node: LGraphNode): GLSLRendererConfig {
  const defaults: GLSLRendererConfig = {
    maxInputs: 5,
    maxFloatUniforms: 5,
    maxIntUniforms: 5
  }

  if (!('comfyDynamic' in node)) return defaults

  const dynamic = node.comfyDynamic
  if (
    typeof dynamic !== 'object' ||
    dynamic === null ||
    !('autogrow' in dynamic)
  )
    return defaults

  const groups = dynamic.autogrow as Record<string, AutogrowGroup> | undefined
  if (!groups) return defaults

  return {
    maxInputs: groups['images']?.max ?? defaults.maxInputs,
    maxFloatUniforms: groups['floats']?.max ?? defaults.maxFloatUniforms,
    maxIntUniforms: groups['ints']?.max ?? defaults.maxIntUniforms
  }
}

function normalizeDimension(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SIZE
  return parsed
}

function clampResolution(w: number, h: number): [number, number] {
  const maxDim = Math.max(w, h)
  if (maxDim <= MAX_PREVIEW_DIMENSION) return [w, h]
  const scale = MAX_PREVIEW_DIMENSION / maxDim
  return [Math.round(w * scale), Math.round(h * scale)]
}

function getImageThroughSubgraphBoundary(
  node: LGraphNode,
  slot: number,
  ownerSubgraphNode: LGraphNode
): HTMLImageElement | undefined {
  const graph = node.graph
  if (!graph) return undefined

  const input = node.inputs[slot]
  if (input?.link == null) return undefined

  const link = graph._links.get(input.link)
  if (!link || link.origin_id !== SUBGRAPH_INPUT_ID) return undefined

  const outerUpstream = ownerSubgraphNode.getInputNode(link.origin_slot)
  if (!outerUpstream?.imgs?.length) return undefined

  return outerUpstream.imgs[0]
}

function extractUniformSources(
  glslNode: LGraphNode,
  subgraph: Subgraph
): { floats: UniformSource[]; ints: UniformSource[] } {
  const floats: UniformSource[] = []
  const ints: UniformSource[] = []

  if (!glslNode.inputs) return { floats, ints }

  for (const input of glslNode.inputs) {
    if (input.link == null) continue

    const link = subgraph.getLink(input.link)
    if (!link || link.origin_id === SUBGRAPH_INPUT_ID) continue

    const sourceNode = subgraph.getNodeById(link.origin_id)
    if (!sourceNode?.widgets?.[0]) continue

    const inputName = input.name ?? ''
    const dotIndex = inputName.indexOf('.')
    if (dotIndex === -1) continue

    const prefix = inputName.slice(0, dotIndex)
    const source: UniformSource = {
      nodeId: sourceNode.id as NodeId,
      widgetName: sourceNode.widgets[0].name
    }

    if (prefix === 'floats') floats.push(source)
    else if (prefix === 'ints') ints.push(source)
  }

  return { floats, ints }
}

export function useGLSLPreview(
  nodeMaybe: MaybeRefOrGetter<LGraphNode | null | undefined>
) {
  const lastError = ref<string | null>(null)
  const widgetValueStore = useWidgetValueStore()
  const nodeOutputStore = useNodeOutputStore()

  let renderer: ReturnType<typeof useGLSLRenderer> | null = null
  let rendererReady = false
  let renderRequestId = 0

  const nodeRef = computed(() => toValue(nodeMaybe) ?? null)

  const isGLSLNode = computed(() => nodeRef.value?.type === GLSL_NODE_TYPE)

  const innerGLSLNode = computed(() => {
    const node = nodeRef.value
    if (!node?.isSubgraphNode()) return null
    const subgraph = node.subgraph as Subgraph | undefined
    return subgraph?.nodes.find((n) => n.type === GLSL_NODE_TYPE) ?? null
  })

  const isGLSLSubgraphNode = computed(() => innerGLSLNode.value !== null)

  const ownerSubgraphNode = computed(() => {
    const node = nodeRef.value
    const graph = node?.graph
    if (!graph) return null
    const rootGraph = graph.rootGraph
    if (!rootGraph || graph === rootGraph) return null

    return (
      rootGraph._nodes.find(
        (n) => n.isSubgraphNode() && n.subgraph === graph
      ) ?? null
    )
  })

  const graphId = computed(
    () => nodeRef.value?.graph?.rootGraph?.id as UUID | undefined
  )

  const nodeId = computed(() => nodeRef.value?.id as NodeId | undefined)

  const { nodeToNodeLocatorId } = useWorkflowStore()

  const hasExecutionOutput = computed(() => {
    const node = nodeRef.value
    if (!node) return false

    const outputs = nodeOutputStore.nodeOutputs

    const locatorId = nodeToNodeLocatorId(node)
    if (outputs[locatorId]?.images?.length) return true

    const inner = innerGLSLNode.value
    if (inner) {
      const innerLocatorId = nodeToNodeLocatorId(inner)
      if (outputs[innerLocatorId]?.images?.length) return true
    }

    return false
  })

  const isActive = computed(
    () =>
      (isGLSLNode.value || isGLSLSubgraphNode.value) && hasExecutionOutput.value
  )

  const shaderSource = computed(() => {
    const gId = graphId.value
    if (!gId) return undefined

    // Direct GLSLShader
    if (isGLSLNode.value) {
      const nId = nodeId.value
      if (nId == null) return undefined
      return widgetValueStore.getWidget(gId, nId, 'fragment_shader')?.value as
        | string
        | undefined
    }

    const inner = innerGLSLNode.value
    if (inner) {
      return widgetValueStore.getWidget(
        gId,
        inner.id as NodeId,
        'fragment_shader'
      )?.value as string | undefined
    }

    return undefined
  })

  const rendererConfig = computed(() => {
    const inner = innerGLSLNode.value
    if (inner) return getAutogrowLimits(inner)

    const node = nodeRef.value
    if (!node) return { maxInputs: 5, maxFloatUniforms: 5, maxIntUniforms: 5 }
    return getAutogrowLimits(node)
  })

  const uniformSources = computed(() => {
    const node = nodeRef.value
    const inner = innerGLSLNode.value
    if (!node?.isSubgraphNode() || !inner) return null
    return extractUniformSources(inner, node.subgraph as Subgraph)
  })

  function collectUniformValues(
    subgraphSources: UniformSource[] | undefined,
    groupName: string,
    uniformPrefix: string,
    maxCount: number
  ): number[] {
    const gId = graphId.value
    if (!gId) return []

    if (subgraphSources) {
      return subgraphSources.map(({ nodeId: nId, widgetName }) => {
        const widget = widgetValueStore.getWidget(gId, nId, widgetName)
        return Number(widget?.value ?? 0) || 0
      })
    }

    const nId = nodeId.value
    const node = nodeRef.value
    if (nId == null || !node) return []

    const values: number[] = []
    for (let i = 0; i < maxCount; i++) {
      const inputName = `${groupName}.${uniformPrefix}${i}`
      const widget = widgetValueStore.getWidget(gId, nId, inputName)
      if (widget !== undefined) {
        values.push(Number(widget.value) || 0)
        continue
      }

      const slot = node.inputs?.findIndex((inp) => inp.name === inputName)
      if (slot == null || slot < 0) break

      const upstreamNode = node.getInputNode(slot)
      if (!upstreamNode) break
      const upstreamWidgets = widgetValueStore.getNodeWidgets(
        gId,
        upstreamNode.id as NodeId
      )
      if (upstreamWidgets.length === 0) break
      values.push(Number(upstreamWidgets[0].value) || 0)
    }
    return values
  }

  const floatValues = computed(() =>
    collectUniformValues(
      uniformSources.value?.floats,
      'floats',
      'u_float',
      rendererConfig.value.maxFloatUniforms
    )
  )

  const intValues = computed(() =>
    collectUniformValues(
      uniformSources.value?.ints,
      'ints',
      'u_int',
      rendererConfig.value.maxIntUniforms
    )
  )

  function loadInputImages(): void {
    const node = nodeRef.value
    if (!node?.inputs || !renderer) return

    if (isGLSLSubgraphNode.value) {
      let imageSlotIndex = 0
      for (let slot = 0; slot < node.inputs.length; slot++) {
        if (node.inputs[slot].type !== 'IMAGE') continue
        const upstreamNode = node.getInputNode(slot)
        if (upstreamNode?.imgs?.length) {
          renderer.bindInputImage(imageSlotIndex, upstreamNode.imgs[0])
        }
        imageSlotIndex++
      }
      return
    }

    let imageSlotIndex = 0
    for (let slot = 0; slot < node.inputs.length; slot++) {
      const input = node.inputs[slot]
      if (!input.name.startsWith('images.image')) continue

      const upstreamNode = node.getInputNode(slot)
      if (upstreamNode?.imgs?.length) {
        renderer.bindInputImage(imageSlotIndex, upstreamNode.imgs[0])
        imageSlotIndex++
        continue
      }

      const owner = ownerSubgraphNode.value
      if (owner) {
        const img = getImageThroughSubgraphBoundary(node, slot, owner)
        if (img) {
          renderer.bindInputImage(imageSlotIndex, img)
        }
      }
      imageSlotIndex++
    }
  }

  function getResolution(): [number, number] {
    const node = nodeRef.value
    if (!node?.inputs) return [DEFAULT_SIZE, DEFAULT_SIZE]

    if (isGLSLSubgraphNode.value) {
      for (let slot = 0; slot < node.inputs.length; slot++) {
        if (node.inputs[slot].type !== 'IMAGE') continue
        const upstreamNode = node.getInputNode(slot)
        if (!upstreamNode?.imgs?.length) continue
        const img = upstreamNode.imgs[0]
        return clampResolution(
          img.naturalWidth || DEFAULT_SIZE,
          img.naturalHeight || DEFAULT_SIZE
        )
      }
      return [DEFAULT_SIZE, DEFAULT_SIZE]
    }

    for (let slot = 0; slot < node.inputs.length; slot++) {
      const input = node.inputs[slot]
      if (!input.name.startsWith('images.image')) continue

      const upstreamNode = node.getInputNode(slot)
      if (upstreamNode?.imgs?.length) {
        const img = upstreamNode.imgs[0]
        return clampResolution(
          img.naturalWidth || DEFAULT_SIZE,
          img.naturalHeight || DEFAULT_SIZE
        )
      }

      const owner = ownerSubgraphNode.value
      if (owner) {
        const img = getImageThroughSubgraphBoundary(node, slot, owner)
        if (img) {
          return clampResolution(
            img.naturalWidth || DEFAULT_SIZE,
            img.naturalHeight || DEFAULT_SIZE
          )
        }
      }
    }

    const gId = graphId.value
    const nId = nodeId.value
    if (gId && nId != null) {
      const widthWidget = widgetValueStore.getWidget(
        gId,
        nId,
        'size_mode.width'
      )
      const heightWidget = widgetValueStore.getWidget(
        gId,
        nId,
        'size_mode.height'
      )
      if (widthWidget && heightWidget) {
        return clampResolution(
          normalizeDimension(widthWidget.value),
          normalizeDimension(heightWidget.value)
        )
      }
    }

    return [DEFAULT_SIZE, DEFAULT_SIZE]
  }

  function ensureRenderer(): ReturnType<typeof useGLSLRenderer> {
    if (!renderer) {
      renderer = useGLSLRenderer(rendererConfig.value)
    }
    return renderer
  }

  async function renderPreview(): Promise<void> {
    const requestId = ++renderRequestId
    const source = shaderSource.value
    if (!source || !isActive.value) return

    const r = ensureRenderer()

    try {
      if (!rendererReady) {
        const [w, h] = getResolution()
        if (!r.init(w, h)) {
          lastError.value = 'WebGL2 not available'
          return
        }
        rendererReady = true
      }

      const result = r.compileFragment(source)
      if (!result.success) {
        lastError.value = result.log
        return
      }
      lastError.value = null

      const [w, h] = getResolution()
      r.setResolution(w, h)

      loadInputImages()

      for (let i = 0; i < floatValues.value.length; i++) {
        r.setFloatUniform(i, floatValues.value[i])
      }
      for (let i = 0; i < intValues.value.length; i++) {
        r.setIntUniform(i, intValues.value[i])
      }

      r.render()

      const blob = await r.toBlob()
      if (requestId !== renderRequestId) return
      const blobUrl = createSharedObjectUrl(blob)

      const inner = innerGLSLNode.value
      if (inner) {
        const innerLocatorId = nodeToNodeLocatorId(inner)
        nodeOutputStore.setNodePreviewsByLocatorId(innerLocatorId, [blobUrl])
      } else {
        const nId = nodeId.value
        if (nId != null) {
          nodeOutputStore.setNodePreviewsByNodeId(nId, [blobUrl])
        }
      }

      releaseSharedObjectUrl(blobUrl)
    } catch (error) {
      if (requestId !== renderRequestId) return
      lastError.value =
        error instanceof Error ? error.message : 'Failed to render preview'
    }
  }

  const debouncedRender = debounce((): void => {
    void renderPreview()
  }, DEBOUNCE_MS)

  watch(
    isActive,
    (active) => {
      if (isGLSLNode.value) {
        const node = nodeRef.value
        if (node) node.hideOutputImages = active
      }
      if (active) debouncedRender()
    },
    { immediate: true }
  )

  watch(
    () => [floatValues.value, intValues.value] as const,
    () => {
      if (isActive.value) debouncedRender()
    },
    { deep: true }
  )

  watch(shaderSource, () => {
    if (isActive.value) debouncedRender()
  })

  function dispose(): void {
    debouncedRender.cancel()
    renderer?.dispose()
  }

  onScopeDispose(dispose)

  return {
    isActive,
    lastError,
    dispose
  }
}

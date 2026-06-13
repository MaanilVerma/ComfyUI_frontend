<template>
  <Transition name="open-in-desktop-banner">
    <div
      v-if="visible"
      class="fixed inset-x-0 top-0 z-1100 border-b border-muted bg-secondary-background"
      role="region"
      :aria-label="t('openInDesktop.title')"
      @keydown.esc="dismiss"
    >
      <div class="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-3">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-base-background text-text-secondary"
        >
          <i class="icon-[lucide--monitor-down] size-4" aria-hidden="true" />
        </span>

        <div class="flex min-w-0 flex-1 flex-col justify-center">
          <span
            class="truncate font-inter text-[13px] leading-tight font-medium text-base-foreground"
          >
            {{ t('openInDesktop.title') }}
          </span>
          <span
            class="hidden truncate font-inter text-[11px] leading-tight text-text-secondary sm:block"
          >
            {{ t('openInDesktop.message') }}
          </span>
        </div>

        <Button
          as="a"
          variant="link"
          size="sm"
          :href="DESKTOP_DOWNLOAD_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden sm:inline-flex"
        >
          {{ t('openInDesktop.getApp') }}
        </Button>

        <Button variant="primary" size="md" @click="openInDesktop">
          <i class="icon-[lucide--external-link]" aria-hidden="true" />
          {{ t('openInDesktop.action') }}
        </Button>

        <Button
          variant="textonly"
          size="icon"
          :aria-label="t('openInDesktop.dismiss')"
          @click="dismiss"
        >
          <i class="icon-[lucide--x]" aria-hidden="true" />
        </Button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Button from '@/components/ui/button/Button.vue'
import {
  DESKTOP_DOWNLOAD_URL,
  useOpenInDesktopBanner
} from '@/platform/cloud/desktop/useOpenInDesktopBanner'

const { t } = useI18n()
const { visible, openInDesktop, dismiss } = useOpenInDesktopBanner()
</script>

<style scoped>
.open-in-desktop-banner-enter-active,
.open-in-desktop-banner-leave-active {
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}

.open-in-desktop-banner-enter-from,
.open-in-desktop-banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>

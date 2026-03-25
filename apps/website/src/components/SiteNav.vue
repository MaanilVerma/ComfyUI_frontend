<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import type { Locale } from '../i18n/translations'
import { localePath, t } from '../i18n/translations'

const { locale = 'en' } = defineProps<{ locale?: Locale }>()

const mobileMenuOpen = ref(false)

const navLinks = computed(() => [
  { label: t('nav.enterprise', locale), href: localePath('/enterprise', locale) },
  { label: t('nav.gallery', locale), href: localePath('/gallery', locale) },
  { label: t('nav.about', locale), href: localePath('/about', locale) },
  { label: t('nav.careers', locale), href: localePath('/careers', locale) }
])

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && mobileMenuOpen.value) {
    mobileMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('astro:after-swap', () => {
    mobileMenuOpen.value = false
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <nav
    class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md"
    :aria-label="t('nav.ariaLabel', locale)"
  >
    <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
      <!-- Logo -->
      <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
      <a :href="localePath('/', locale)" class="text-2xl font-bold italic text-brand-yellow">
        Comfy
      </a>
      <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->

      <!-- Desktop nav links -->
      <div class="hidden items-center gap-8 md:flex">
        <a
          v-for="link in navLinks"
          :key="link.href"
          :href="link.href"
          class="text-sm font-medium tracking-wide text-white transition-colors hover:text-brand-yellow"
        >
          {{ link.label }}
        </a>

        <!-- CTA buttons -->
        <div class="flex items-center gap-3">
          <a
            href="https://app.comfy.org"
            class="rounded-full bg-brand-yellow px-5 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            {{ t('nav.cloud', locale) }}
          </a>
          <a
            href="https://hub.comfy.org"
            class="rounded-full border border-brand-yellow px-5 py-2 text-sm font-semibold text-brand-yellow transition-colors hover:bg-brand-yellow hover:text-black"
          >
            {{ t('nav.hub', locale) }}
          </a>
        </div>
      </div>

      <!-- Mobile hamburger -->
      <button
        class="flex flex-col gap-1.5 md:hidden"
        :aria-label="t('nav.toggleMenu', locale)"
        aria-controls="site-mobile-menu"
        :aria-expanded="mobileMenuOpen"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <span
          class="block h-0.5 w-6 bg-white transition-transform"
          :class="mobileMenuOpen && 'translate-y-2 rotate-45'"
        />
        <span
          class="block h-0.5 w-6 bg-white transition-opacity"
          :class="mobileMenuOpen && 'opacity-0'"
        />
        <span
          class="block h-0.5 w-6 bg-white transition-transform"
          :class="mobileMenuOpen && '-translate-y-2 -rotate-45'"
        />
      </button>
    </div>

    <!-- Mobile menu -->
    <div
      v-show="mobileMenuOpen"
      id="site-mobile-menu"
      class="border-t border-white/10 bg-black px-6 pb-6 md:hidden"
    >
      <div class="flex flex-col gap-4 pt-4">
        <a
          v-for="link in navLinks"
          :key="link.href"
          :href="link.href"
          class="text-sm font-medium tracking-wide text-white transition-colors hover:text-brand-yellow"
          @click="mobileMenuOpen = false"
        >
          {{ link.label }}
        </a>

        <div class="flex flex-col gap-3 pt-2">
          <a
            href="https://app.comfy.org"
            class="rounded-full bg-brand-yellow px-5 py-2 text-center text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            {{ t('nav.cloud', locale) }}
          </a>
          <a
            href="https://hub.comfy.org"
            class="rounded-full border border-brand-yellow px-5 py-2 text-center text-sm font-semibold text-brand-yellow transition-colors hover:bg-brand-yellow hover:text-black"
          >
            {{ t('nav.hub', locale) }}
          </a>
        </div>
      </div>
    </div>
  </nav>
</template>

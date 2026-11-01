<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()

const sections = [
  { to: '/', key: 'nav.overview' },
  { to: '/fixtures', key: 'nav.fixtures' },
  { to: '/standings', key: 'nav.standings' },
  { to: '/leaders', key: 'nav.leaders' },
  { to: '/playoffs', key: 'nav.playoffs' },
]

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div class="shell">
    <nav class="side" :aria-label="t('nav.label')">
      <div class="side-title">AHM</div>
      <NuxtLink
        v-for="section in sections"
        :key="section.to"
        :to="section.to"
        class="side-link"
        active-class=""
        exact-active-class="side-on"
      >
        {{ t(section.key) }}
      </NuxtLink>
      <div class="side-foot">
        <button
          v-for="option in locales"
          :key="option.code"
          type="button"
          class="side-small"
          :aria-pressed="option.code === locale"
          @click="setLocale(option.code)"
        >
          {{ option.code }}
        </button>
        <button type="button" class="side-small" @click="signOut">{{ t('season.signOut') }}</button>
      </div>
    </nav>
    <main class="content"><slot /></main>
  </div>
</template>

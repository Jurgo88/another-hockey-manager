<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()

useHead({ title: () => t('app.name'), htmlAttrs: { lang: () => locale.value } })
</script>

<template>
  <div class="page">
    <header class="header">
      <strong>{{ t('app.name') }}</strong>
      <nav>
        <button
          v-for="option in locales"
          :key="option.code"
          type="button"
          class="link"
          :aria-pressed="option.code === locale"
          @click="setLocale(option.code)"
        >
          {{ option.name }}
        </button>
      </nav>
    </header>
    <main><NuxtPage /></main>
  </div>
</template>

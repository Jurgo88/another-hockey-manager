<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
</script>

<template>
  <div class="bare">
    <header class="bare-head">
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
    <main><slot /></main>
  </div>
</template>

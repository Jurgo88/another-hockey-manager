<script setup lang="ts">
const { t } = useI18n()

const { data: notices } = await useFetch('/api/notices', {
  headers: useRequestHeaders(['cookie']),
})

onMounted(async () => {
  await $fetch('/api/notices/read', { method: 'POST' })
  await refreshNuxtData('unread')
})
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.notices') }}</h1>
  </header>
  <p v-if="!notices?.length" class="muted">{{ t('notices.empty') }}</p>
  <section v-else class="sheet">
    <NoticeList :notices="notices" />
  </section>
</template>

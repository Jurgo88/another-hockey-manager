<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const { data: roster } = await useFetch('/api/roster', { headers: useRequestHeaders(['cookie']) })

const player = computed(() =>
  [...(roster.value?.skaters ?? []), ...(roster.value?.goalies ?? [])].find(
    (candidate) => candidate.id === route.params.id,
  ),
)
const attributes = computed(() => Object.entries(player.value?.attributes ?? {}))
</script>

<template>
  <template v-if="player">
    <header class="page-head">
      <h1>{{ player.name }}</h1>
      <div>{{ t('roster.age') }} {{ player.age }}, {{ player.place ?? '-' }}</div>
    </header>
    <p v-if="player.out" class="tag-out">{{ t('roster.out', { days: player.out }) }}</p>
    <section class="sheet">
      <h2>{{ t('roster.attributes') }}</h2>
      <div class="attrs">
        <div v-for="[key, value] in attributes" :key="key" class="attr">
          <span>{{ t(`attributes.${key}`) }}</span>
          <strong>{{ shown(value) }}</strong>
        </div>
      </div>
    </section>
    <p><NuxtLink to="/roster">{{ t('nav.roster') }}</NuxtLink></p>
  </template>
  <p v-else>{{ t('roster.notOurs') }}</p>
</template>

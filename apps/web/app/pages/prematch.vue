<script setup lang="ts">
import type { Lineup } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const { t } = useI18n()

const headers = useRequestHeaders(['cookie'])
const { data: season } = await useFetch('/api/season', { headers })
const { data } = await useFetch<LineupPage>('/api/lineup', { headers })

if (season.value?.following) await navigateTo('/live')
else if (!season.value?.playsNext) await navigateTo('/')

const draft = ref<Lineup | null>(data.value ? structuredClone(toRaw(data.value.lineup)) : null)
const dirty = ref(false)
const busy = ref(false)
const problems = ref<string[]>([])
const failure = ref<string | null>(null)

function changed(lineup: Lineup) {
  draft.value = lineup
  dirty.value = true
  problems.value = []
}

async function start() {
  busy.value = true
  problems.value = []
  failure.value = null
  try {
    if (dirty.value) await $fetch('/api/lineup', { method: 'PUT', body: draft.value })
    await $fetch('/api/live/open', { method: 'POST' })
    await navigateTo('/live')
  } catch (error) {
    const violations = (error as { data?: { data?: { message: string }[] } }).data?.data
    if (violations) problems.value = violations.map((violation) => violation.message)
    else failure.value = 'errors.saveFailed'
    busy.value = false
  }
}
</script>

<template>
  <header class="page-head">
    <h1>{{ t('prematch.title') }}</h1>
    <button type="button" class="button button-go" :disabled="busy" @click="start">
      {{ t('prematch.start') }}
    </button>
  </header>
  <p v-if="season?.next" class="strong">
    {{
      t(season.next.atHome ? 'season.nextHome' : 'season.nextAway', {
        opponent: season.next.opponent,
        day: season.next.day + 1,
      })
    }}
  </p>
  <p class="muted">{{ t('prematch.help') }}</p>
  <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
  <ul v-if="problems.length" class="error" role="alert">
    <li v-for="problem in problems" :key="problem">{{ problem }}</li>
  </ul>
  <template v-if="draft && data">
    <InjuryNotice :lineup="draft" :players="data.players" @update:lineup="changed" />
    <TacticsPanel
      :tactics="draft.tactics"
      :rotation="true"
      @update:tactics="changed({ ...draft!, tactics: $event })"
    />
    <LineupBoard
      :lineup="draft"
      :players="data.players"
      :spares="true"
      @update:lineup="changed"
    />
  </template>
</template>

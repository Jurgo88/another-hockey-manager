<script setup lang="ts">
import type { Lineup } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const { t } = useI18n()

const { data, refresh } = await useFetch<LineupPage>('/api/lineup', {
  headers: useRequestHeaders(['cookie']),
})

const draft = ref<Lineup | null>(data.value ? structuredClone(toRaw(data.value.lineup)) : null)
const dirty = ref(false)
const saved = ref(false)
const problems = ref<string[]>([])
const failure = ref<string | null>(null)

function changed(lineup: Lineup) {
  draft.value = lineup
  dirty.value = true
  saved.value = false
  problems.value = []
}

function reset() {
  if (data.value) draft.value = structuredClone(toRaw(data.value.lineup))
  dirty.value = false
  problems.value = []
}

async function save() {
  failure.value = null
  problems.value = []
  try {
    await $fetch('/api/lineup', { method: 'PUT', body: draft.value })
    await refresh()
    dirty.value = false
    saved.value = true
  } catch (error) {
    const violations = (error as { data?: { data?: { message: string }[] } }).data?.data
    if (violations) problems.value = violations.map((violation) => violation.message)
    else failure.value = 'errors.saveFailed'
  }
}
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.lineup') }}</h1>
    <div class="actions">
      <button type="button" class="button" :disabled="!dirty" @click="reset">{{ t('lineup.reset') }}</button>
      <button type="button" class="button button-go" :disabled="!dirty || data?.locked" @click="save">
        {{ t('lineup.save') }}
      </button>
    </div>
  </header>
  <p class="muted">{{ t('lineup.help') }}</p>
  <p v-if="data?.locked" class="error">{{ t('errors.fixtureFollowed') }}</p>
  <p v-if="saved" class="strong">{{ t('lineup.saved') }}</p>
  <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
  <ul v-if="problems.length" class="error" role="alert">
    <li v-for="problem in problems" :key="problem">{{ problem }}</li>
  </ul>
  <LineupBoard
    v-if="draft && data"
    :lineup="draft"
    :players="data.players"
    :spares="true"
    @update:lineup="changed"
  />
</template>

<script setup lang="ts">
import type { Tactics } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const { t } = useI18n()

const { data, refresh } = await useFetch<LineupPage>('/api/lineup', {
  headers: useRequestHeaders(['cookie']),
})

const draft = ref<Tactics | null>(
  data.value ? structuredClone(toRaw(data.value.lineup.tactics)) : null,
)
const dirty = ref(false)
const saved = ref(false)
const failure = ref<string | null>(null)

function changed(tactics: Tactics) {
  draft.value = tactics
  dirty.value = true
  saved.value = false
}

async function save() {
  if (!data.value) return
  saved.value = false
  failure.value = null
  try {
    await $fetch('/api/lineup', {
      method: 'PUT',
      body: { ...data.value.lineup, tactics: draft.value },
    })
    await refresh()
    dirty.value = false
    saved.value = true
  } catch {
    failure.value = 'errors.saveFailed'
  }
}
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.tactics') }}</h1>
    <button type="button" class="button button-go" :disabled="!dirty || data?.locked" @click="save">
      {{ t('lineup.save') }}
    </button>
  </header>
  <p v-if="data?.locked" class="error">{{ t('errors.fixtureFollowed') }}</p>
  <p v-if="saved" class="strong">{{ t('lineup.saved') }}</p>
  <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
  <TacticsPanel v-if="draft" :tactics="draft" :rotation="true" @update:tactics="changed" />
</template>

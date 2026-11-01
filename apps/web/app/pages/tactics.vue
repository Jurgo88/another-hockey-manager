<script setup lang="ts">
import type { Lineup, MatchupPolicy } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const { t } = useI18n()

const { data, refresh } = await useFetch<LineupPage>('/api/lineup', {
  headers: useRequestHeaders(['cookie']),
})
const initial = data.value?.lineup.tactics

const aggression = ref(initial?.aggression ?? 50)
const shotVolume = ref(initial?.shotVolume ?? 50)
const shiftLength = ref(initial?.shiftLength ?? 50)
const matchup = ref<MatchupPolicy>(initial?.matchup ?? 'none')
const restOnBackToBack = ref(initial?.goalieRotation.restOnBackToBack ?? true)
const maxStarts = ref(initial?.goalieRotation.maxConsecutiveStarts ?? 0)
const saved = ref(false)
const failure = ref<string | null>(null)

const dials = [
  { key: 'aggression', value: aggression },
  { key: 'shotVolume', value: shotVolume },
  { key: 'shiftLength', value: shiftLength },
]
const policies: MatchupPolicy[] = ['none', 'exploit', 'shutdown']

async function save() {
  if (!data.value) return
  saved.value = false
  failure.value = null
  const { lineup } = data.value
  const next: Lineup = {
    ...lineup,
    tactics: {
      ...lineup.tactics,
      aggression: aggression.value,
      shotVolume: shotVolume.value,
      shiftLength: shiftLength.value,
      matchup: matchup.value,
      goalieRotation: {
        restOnBackToBack: restOnBackToBack.value,
        maxConsecutiveStarts: maxStarts.value > 0 ? maxStarts.value : null,
      },
    },
  }
  try {
    await $fetch('/api/lineup', { method: 'PUT', body: next })
    await refresh()
    saved.value = true
  } catch {
    failure.value = 'errors.saveFailed'
  }
}
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.tactics') }}</h1>
    <button type="button" class="button button-go" :disabled="data?.locked" @click="save">
      {{ t('lineup.save') }}
    </button>
  </header>
  <p v-if="data?.locked" class="error">{{ t('errors.fixtureFollowed') }}</p>
  <p v-if="saved" class="strong">{{ t('lineup.saved') }}</p>
  <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>

  <section class="sheet">
    <h2>{{ t('tactics.style') }}</h2>
    <label v-for="dial in dials" :key="dial.key" class="dial">
      <span class="strong">{{ t(`tactics.${dial.key}`) }}: {{ dial.value.value }}</span>
      <span class="muted">{{ t(`tactics.${dial.key}Help`) }}</span>
      <input v-model.number="dial.value.value" type="range" min="0" max="100" />
    </label>
  </section>
  <section class="sheet">
    <h2>{{ t('tactics.matchup') }}</h2>
    <label v-for="policy in policies" :key="policy" class="dial">
      <span>
        <input v-model="matchup" type="radio" name="matchup" :value="policy" />
        <span class="strong"> {{ t(`tactics.${policy}`) }}</span>
      </span>
      <span class="muted">{{ t(`tactics.${policy}Help`) }}</span>
    </label>
  </section>
  <section class="sheet">
    <h2>{{ t('tactics.rotation') }}</h2>
    <label class="dial">
      <span><input v-model="restOnBackToBack" type="checkbox" /> {{ t('tactics.restOnBackToBack') }}</span>
    </label>
    <label class="dial">
      {{ t('tactics.maxStarts') }}
      <input v-model.number="maxStarts" type="number" min="0" max="20" style="max-width: 6rem" />
    </label>
  </section>
</template>

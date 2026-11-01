<script setup lang="ts">
import type { Lineup, MatchupPolicy } from '@ahm/sim'

const { t } = useI18n()

const { data: live, refresh } = await useFetch('/api/live', {
  headers: useRequestHeaders(['cookie']),
})
if (!live.value) await navigateTo('/')

const asLineup = (value: unknown) => structuredClone(toRaw(value)) as Lineup
const draft = ref<Lineup | null>(live.value ? asLineup(live.value.lineup) : null)
const busy = ref(false)
const problems = ref<string[]>([])
const failure = ref<string | null>(null)

const plays = computed(() => [...(live.value?.plays ?? [])].reverse())
const changedAny = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(live.value?.lineup),
)
const dials = ['aggression', 'shotVolume', 'shiftLength'] as const
const policies: MatchupPolicy[] = ['none', 'exploit', 'shutdown']

async function playOn() {
  busy.value = true
  problems.value = []
  failure.value = null
  try {
    await $fetch('/api/live/continue', {
      method: 'POST',
      body: changedAny.value ? { lineup: draft.value } : {},
    })
    await refresh()
    draft.value = live.value ? asLineup(live.value.lineup) : null
  } catch (error) {
    const violations = (error as { data?: { data?: { message: string }[] } }).data?.data
    if (violations) problems.value = violations.map((violation) => violation.message)
    else failure.value = 'errors.saveFailed'
  } finally {
    busy.value = false
  }
}

async function finish() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/season/advance', { method: 'POST', body: { mode: 'day' } })
    await navigateTo('/')
  } catch {
    failure.value = 'errors.saveFailed'
    busy.value = false
  }
}
</script>

<template>
  <template v-if="live">
    <header class="page-head">
      <h1>{{ live.home }} {{ live.homeGoals }} : {{ live.awayGoals }} {{ live.away }}</h1>
      <div>{{ t('live.shots', { home: live.homeShots, away: live.awayShots }) }}</div>
    </header>
    <p class="strong">
      {{
        live.ended
          ? t('live.final')
          : live.throughPeriod
            ? t('live.after', { period: live.throughPeriod })
            : ''
      }}
    </p>
    <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
    <ul v-if="problems.length" class="error" role="alert">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>

    <div class="actions">
      <button v-if="live.ended" type="button" class="button button-go" :disabled="busy" @click="finish">
        {{ t('live.finish') }}
      </button>
      <button v-else type="button" class="button button-go" :disabled="busy" @click="playOn">
        {{ t(changedAny ? 'live.applyAndPlay' : 'live.play') }}
      </button>
    </div>

    <div class="grid">
      <section class="sheet">
        <h2>{{ t('live.plays') }}</h2>
        <PlayByPlay :plays="plays" />
      </section>
      <section v-if="!live.ended && draft" class="sheet">
        <h2>{{ t('live.tactics') }}</h2>
        <label v-for="dial in dials" :key="dial" class="dial">
          <span class="strong">{{ t(`tactics.${dial}`) }}: {{ draft.tactics[dial] }}</span>
          <input
            type="range"
            min="0"
            max="100"
            :value="draft.tactics[dial]"
            @input="
              draft = {
                ...draft!,
                tactics: { ...draft!.tactics, [dial]: Number(($event.target as HTMLInputElement).value) },
              }
            "
          />
        </label>
        <label v-for="policy in policies" :key="policy" class="dial">
          <span>
            <input
              type="radio"
              name="live-matchup"
              :checked="draft.tactics.matchup === policy"
              @change="draft = { ...draft!, tactics: { ...draft!.tactics, matchup: policy } }"
            />
            {{ t(`tactics.${policy}`) }}
          </span>
        </label>
      </section>
    </div>

    <template v-if="!live.ended && draft">
      <p class="muted">{{ t('live.help') }}</p>
      <LineupBoard
        :lineup="draft"
        :players="live.players"
        :spares="false"
        @update:lineup="draft = $event"
      />
    </template>
  </template>
</template>

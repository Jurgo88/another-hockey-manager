<script setup lang="ts">
import { bringIn, playerAt, swapSlots, type Lineup, type LineupSlot } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const { t } = useI18n()

const { data, refresh } = await useFetch<LineupPage>('/api/lineup', {
  headers: useRequestHeaders(['cookie']),
})

const draft = ref<Lineup | null>(data.value ? structuredClone(toRaw(data.value.lineup)) : null)
const picked = ref<LineupSlot | null>(null)
const dirty = ref(false)
const saved = ref(false)
const problems = ref<string[]>([])
const failure = ref<string | null>(null)

const nameOf = (id: string) => data.value?.players.find((p) => p.id === id)
const label = (id: string) => {
  const player = nameOf(id)
  return player ? `${player.name} (${player.positions.join('/')})` : id
}
const same = (a: LineupSlot | null, b: LineupSlot) => JSON.stringify(a) === JSON.stringify(b)

function pick(slot: LineupSlot) {
  if (!draft.value) return
  if (!picked.value) picked.value = slot
  else {
    if (!same(picked.value, slot)) {
      draft.value = swapSlots(draft.value, picked.value, slot)
      changed()
    }
    picked.value = null
  }
}

function bringSpare(id: string) {
  if (!draft.value || !picked.value) return
  draft.value = bringIn(draft.value, picked.value, id)
  picked.value = null
  changed()
}

function changed() {
  dirty.value = true
  saved.value = false
  problems.value = []
}

function reset() {
  if (data.value) draft.value = structuredClone(toRaw(data.value.lineup))
  picked.value = null
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

const dressed = computed(() => {
  const lineup = draft.value
  if (!lineup) return new Set<string>()
  return new Set([
    lineup.starter,
    lineup.backup,
    ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
  ])
})
const spares = computed(() => (data.value?.players ?? []).filter((p) => !dressed.value.has(p.id)))

interface Row {
  title: string
  slots: LineupSlot[]
}
const sections = computed((): { title: string; rows: Row[] }[] => {
  const lineup = draft.value
  if (!lineup) return []
  const units = (group: 'powerPlay' | 'penaltyKill', count: number, size: number): Row[] =>
    Array.from({ length: count }, (_, index) => ({
      title: String(index + 1),
      slots: Array.from({ length: size }, (_, position) => ({ group, index, position })),
    }))
  return [
    {
      title: t('lineup.lines'),
      rows: lineup.lines.map((_, index) => ({
        title: `L${index + 1}`,
        slots: (['leftWing', 'centre', 'rightWing'] as const).map((key) => ({
          group: 'line',
          index,
          key,
        })),
      })),
    },
    {
      title: t('lineup.pairings'),
      rows: lineup.pairings.map((_, index) => ({
        title: `P${index + 1}`,
        slots: (['leftDefence', 'rightDefence'] as const).map((key) => ({
          group: 'pairing',
          index,
          key,
        })),
      })),
    },
    {
      title: t('leaders.goalies'),
      rows: [
        {
          title: 'G',
          slots: [
            { group: 'goalie', key: 'starter' },
            { group: 'goalie', key: 'backup' },
          ],
        },
      ],
    },
    { title: t('lineup.powerPlay'), rows: units('powerPlay', lineup.powerPlayUnits.length, 5) },
    { title: t('lineup.penaltyKill'), rows: units('penaltyKill', lineup.penaltyKillUnits.length, 4) },
    {
      title: t('lineup.overtime'),
      rows: lineup.overtimeRotation.map((_, index) => ({
        title: String(index + 1),
        slots: [0, 1, 2].map((position) => ({ group: 'overtime', index, position })),
      })),
    },
  ]
})
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

  <template v-if="draft">
    <section v-for="section in sections" :key="section.title" class="sheet">
      <h2>{{ section.title }}</h2>
      <div class="lines">
        <div v-for="row in section.rows" :key="row.title" class="line">
          <strong>{{ row.title }}</strong>
          <button
            v-for="slot in row.slots"
            :key="JSON.stringify(slot)"
            type="button"
            class="slot"
            :class="{
              'slot-picked': same(picked, slot),
              'slot-out': nameOf(playerAt(draft, slot))?.out,
            }"
            @click="pick(slot)"
          >
            {{ label(playerAt(draft, slot)) }}
          </button>
        </div>
      </div>
    </section>
    <section class="sheet">
      <h2>{{ t('lineup.spares') }}</h2>
      <p class="muted" style="padding: 0 10px">{{ t('lineup.sparesHelp') }}</p>
      <div class="lines" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))">
        <button
          v-for="spare in spares"
          :key="spare.id"
          type="button"
          class="slot"
          :class="{ 'slot-out': spare.out }"
          :disabled="!picked"
          @click="bringSpare(spare.id)"
        >
          {{ label(spare.id) }}
        </button>
      </div>
    </section>
  </template>
</template>

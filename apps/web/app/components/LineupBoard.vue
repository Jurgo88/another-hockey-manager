<script setup lang="ts">
import { bringIn, playerAt, swapSlots, type Lineup, type LineupSlot } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const props = defineProps<{
  lineup: Lineup
  players: LineupPage['players']
  /** Only those dressed can take part at an intermission (ADR-016). */
  spares: boolean
}>()
const emit = defineEmits<{ 'update:lineup': [lineup: Lineup] }>()

const { t } = useI18n()
const picked = ref<LineupSlot | null>(null)

const asking = ref(false)
const failure = ref(false)

async function askAssistant() {
  asking.value = true
  failure.value = false
  try {
    const { lineup } = await $fetch<{ lineup: Lineup }>('/api/lineup/assistant', {
      method: 'POST',
      body: { tactics: props.lineup.tactics },
    })
    picked.value = null
    emit('update:lineup', lineup)
  } catch {
    failure.value = true
  } finally {
    asking.value = false
  }
}

const nameOf = (id: string) => props.players.find((p) => p.id === id)
const label = (id: string) => {
  const player = nameOf(id)
  return player ? `${player.name} (${player.positions.join('/')})` : id
}
const same = (a: LineupSlot | null, b: LineupSlot) => JSON.stringify(a) === JSON.stringify(b)

const SLOT_POSITION: Record<string, string> = {
  leftWing: 'LW',
  centre: 'C',
  rightWing: 'RW',
  leftDefence: 'LD',
  rightDefence: 'RD',
}
/** Injuries can leave a Skater out of position: show it rather than hide it. */
function outOfPosition(slot: LineupSlot): boolean {
  if (slot.group !== 'line' && slot.group !== 'pairing') return false
  const positions = nameOf(playerAt(props.lineup, slot))?.positions
  return positions !== undefined && !positions.includes(SLOT_POSITION[slot.key]!)
}

function pick(slot: LineupSlot) {
  if (!picked.value) {
    picked.value = slot
    return
  }
  if (!same(picked.value, slot)) emit('update:lineup', swapSlots(props.lineup, picked.value, slot))
  picked.value = null
}

function bringSpare(id: string) {
  if (!picked.value) return
  emit('update:lineup', bringIn(props.lineup, picked.value, id))
  picked.value = null
}

const dressed = computed(
  () =>
    new Set([
      props.lineup.starter,
      props.lineup.backup,
      ...props.lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
      ...props.lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
    ]),
)
const outside = computed(() => props.players.filter((p) => !dressed.value.has(p.id)))

interface Row {
  title: string
  slots: LineupSlot[]
}
const sections = computed((): { title: string; rows: Row[] }[] => {
  const { lineup } = props
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
  <section v-if="spares" class="notice notice-plain">
    <p>{{ t('lineup.assistantHelp') }}</p>
    <button type="button" class="button" :disabled="asking" @click="askAssistant">
      {{ t('lineup.assistant') }}
    </button>
    <p v-if="failure" class="error" role="alert">{{ t('errors.saveFailed') }}</p>
  </section>
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
            'slot-out': nameOf(playerAt(lineup, slot))?.out,
            'slot-wrong': outOfPosition(slot),
          }"
          @click="pick(slot)"
        >
          {{ label(playerAt(lineup, slot)) }}
          <span v-if="outOfPosition(slot)" class="slot-note">{{ t('lineup.outOfPosition') }}</span>
        </button>
      </div>
    </div>
  </section>
  <section v-if="spares" class="sheet">
    <h2>{{ t('lineup.spares') }}</h2>
    <p class="muted" style="padding: 0 10px">{{ t('lineup.sparesHelp') }}</p>
    <div class="lines" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))">
      <button
        v-for="spare in outside"
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

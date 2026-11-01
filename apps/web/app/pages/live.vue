<script setup lang="ts">
import type { Lineup } from '@ahm/sim'

const SPEEDS = [15, 30, 60, 120]
const TICK_MS = 100
/** Attempts within this much game time make up the pressure bar. */
const PRESSURE_WINDOW = 180

const { t } = useI18n()

const { data: live } = await useFetch('/api/live', { headers: useRequestHeaders(['cookie']) })
if (!live.value) await navigateTo('/')

const asLineup = (value: unknown) => structuredClone(toRaw(value)) as Lineup
const draft = ref<Lineup | null>(live.value ? asLineup(live.value.lineup) : null)
const decided = ref<string>(JSON.stringify(live.value?.lineup))

/** Game time on the broadcast. It runs behind what the server has revealed. */
const shownClock = ref(live.value?.clock ?? 0)
const playing = ref(false)
const speed = ref(60)
const busy = ref(false)
const problems = ref<string[]>([])
const failure = ref<string | null>(null)

const caughtUp = computed(() => shownClock.value >= (live.value?.clock ?? 0))
const atBreak = computed(() => live.value?.phase === 'intermission' && caughtUp.value)
const ended = computed(() => live.value?.phase === 'ended' && caughtUp.value)
const notStarted = computed(() => live.value?.phase === 'start')
const canCoach = computed(() => !ended.value && !playing.value)
const changedAny = computed(() => JSON.stringify(draft.value) !== decided.value)

const plays = computed(() =>
  (live.value?.plays ?? []).filter((play) => play.clock <= shownClock.value).reverse(),
)
const attempts = computed(() =>
  (live.value?.attempts ?? []).filter((attempt) => attempt.clock <= shownClock.value),
)
const goals = (home: boolean) => attempts.value.filter((a) => a.goal && a.home === home).length
const shots = (home: boolean) => attempts.value.filter((a) => a.onGoal && a.home === home).length

const pressure = computed(() => {
  const recent = attempts.value.filter((a) => a.clock > shownClock.value - PRESSURE_WINDOW)
  const home = recent.filter((a) => a.home).length
  return recent.length === 0 ? 50 : Math.round((100 * home) / recent.length)
})

/** Every Skater's fatigue at this point of the broadcast. */
const fatigueNow = computed(() => {
  const now = new Map(Object.entries(live.value?.openingFatigue ?? {}))
  for (const report of live.value?.fatigueReports ?? []) {
    if (report.clock > shownClock.value) break
    report.players.forEach((id, i) => now.set(id, report.fatigue[i] ?? 0))
  }
  return now
})
const onIce = (home: boolean) =>
  (live.value?.shifts ?? []).filter((s) => s.home === home && s.clock <= shownClock.value).at(-1)
    ?.players ?? []
const boardPlayers = computed(() =>
  (live.value?.players ?? []).map((player) => ({
    ...player,
    ...('fatigue' in player ? { fatigue: fatigueNow.value.get(player.id) ?? 0 } : {}),
  })),
)

/** A clock exactly on a Period's end still belongs to that Period. */
const period = computed(() => {
  const clock = shownClock.value
  return clock <= 3600 ? String(Math.max(1, Math.ceil(clock / 1200))) : 'OT'
})
const timeLeft = computed(() => {
  const clock = shownClock.value
  const length = clock > 3600 ? (live.value?.overtimeSeconds ?? 1200) : 1200
  const elapsed = clock > 3600 ? (clock - 3600) % length : clock === 0 ? 0 : ((clock - 1) % 1200) + 1
  const left = Math.max(0, length - Math.floor(elapsed))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
})

/** Asks for the next step, with any change decided since the last one. */
async function step(options: { toBreak?: boolean } = {}) {
  if (busy.value) return
  busy.value = true
  failure.value = null
  problems.value = []
  try {
    const view = await $fetch('/api/live/continue', {
      method: 'POST',
      body: { ...(changedAny.value ? { lineup: draft.value } : {}), ...options },
    })
    live.value = view as typeof live.value
    if (changedAny.value) decided.value = JSON.stringify(view.lineup)
    if (options.toBreak) shownClock.value = view.clock
  } catch (error) {
    playing.value = false
    const violations = (error as { data?: { data?: { message: string }[] } }).data?.data
    if (violations) problems.value = violations.map((violation) => violation.message)
    else failure.value = 'errors.saveFailed'
  } finally {
    busy.value = false
  }
}

let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  if (!playing.value || !live.value) return
  if (!caughtUp.value) {
    shownClock.value = Math.min(
      live.value.clock,
      shownClock.value + (speed.value * TICK_MS) / 1000,
    )
    return
  }
  if (live.value.phase === 'running' || live.value.phase === 'start') void step()
  else playing.value = false
}

function play() {
  playing.value = true
  if (atBreak.value) void step()
}

async function skipToBreak() {
  playing.value = false
  await step({ toBreak: true })
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

onMounted(() => {
  timer = setInterval(tick, TICK_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <template v-if="live">
    <header class="page-head">
      <h1>{{ live.home }} {{ goals(true) }} : {{ goals(false) }} {{ live.away }}</h1>
      <div class="broadcast-clock">
        <span v-if="ended">{{ t('live.final') }}</span>
        <template v-else>
          <span>{{ t('live.period', { period }) }}</span>
          <strong>{{ timeLeft }}</strong>
        </template>
      </div>
    </header>

    <section class="sheet broadcast">
      <div class="controls">
        <template v-if="ended">
          <button type="button" class="button button-go" :disabled="busy" @click="finish">
            {{ t('live.finish') }}
          </button>
        </template>
        <template v-else>
          <button v-if="playing" type="button" class="button" @click="playing = false">
            {{ t('live.pause') }}
          </button>
          <button v-else type="button" class="button button-go" :disabled="busy" @click="play">
            {{ t(notStarted ? 'live.start' : atBreak ? 'live.nextPeriod' : 'live.resume') }}
          </button>
          <div class="speeds" role="group" :aria-label="t('live.speed')">
            <button
              v-for="option in SPEEDS"
              :key="option"
              type="button"
              class="chip"
              :aria-pressed="speed === option"
              @click="speed = option"
            >
              {{ option }}x
            </button>
          </div>
          <button type="button" class="chip" :disabled="busy" @click="skipToBreak">
            {{ t('live.skip') }}
          </button>
        </template>
      </div>

      <div class="pressure" :aria-label="t('live.pressure')">
        <span>{{ t('live.shots', { home: shots(true), away: shots(false) }) }}</span>
        <div class="pressure-bar">
          <div class="pressure-home" :style="{ width: `${pressure}%` }" />
        </div>
        <span class="muted">{{ t('live.pressure') }}</span>
      </div>

      <div class="on-ice">
        <div v-for="side in [true, false]" :key="String(side)">
          <strong>{{ side ? live.home : live.away }}</strong>
          <div v-for="player in onIce(side)" :key="player.id" class="on-ice-row">
            <span>{{ player.name }}</span>
            <FatigueBar :value="fatigueNow.get(player.id) ?? 0" />
          </div>
        </div>
      </div>
    </section>

    <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
    <ul v-if="problems.length" class="error" role="alert">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>

    <section class="sheet plays">
      <h2>{{ t('live.plays') }}</h2>
      <PlayByPlay :plays="plays" />
    </section>

    <template v-if="canCoach && draft">
      <p class="strong">{{ t(atBreak ? 'live.atBreak' : 'live.paused') }}</p>
      <p class="muted">{{ t('live.help') }}</p>
      <p v-if="changedAny" class="strong">{{ t('live.pending') }}</p>
      <TacticsPanel
        :tactics="draft.tactics"
        :rotation="false"
        @update:tactics="draft = { ...draft!, tactics: $event }"
      />
      <LineupBoard
        :lineup="draft"
        :players="boardPlayers"
        :spares="false"
        @update:lineup="draft = $event"
      />
    </template>
  </template>
</template>

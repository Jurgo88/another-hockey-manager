<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const headers = useRequestHeaders(['cookie'])

const { data: roster } = await useFetch('/api/roster', { headers })
// Any Player the career has known, on the Roster or not, gone or not (#93).
const { data: career } = await useFetch(`/api/players/${String(route.params.id)}/career`, {
  headers,
})

const player = computed(() =>
  [...(roster.value?.skaters ?? []), ...(roster.value?.goalies ?? [])].find(
    (candidate) => candidate.id === route.params.id,
  ),
)
const attributes = computed(() => Object.entries(player.value?.attributes ?? {}))

interface Counts {
  gamesPlayed: number
  goals?: number
  assists?: number
  plusMinus?: number
  saves?: number
  shotsAgainst?: number
}
const points = (c: Counts | null) => (c ? (c.goals ?? 0) + (c.assists ?? 0) : '')
const save = (c: Counts | null) =>
  c && c.shotsAgainst ? ((c.saves ?? 0) / c.shotsAgainst).toFixed(3) : ''
</script>

<template>
  <template v-if="player || career">
    <header class="page-head">
      <h1>{{ player?.name ?? career?.name }}</h1>
      <div v-if="player">{{ t('roster.age') }} {{ player.age }}, {{ player.place ?? '-' }}</div>
    </header>
    <p v-if="player?.out" class="tag-out">{{ t('roster.out', { days: player.out }) }}</p>
    <section v-if="player" class="sheet">
      <h2>{{ t('roster.attributes') }}</h2>
      <div class="attrs">
        <div v-for="[key, value] in attributes" :key="key" class="attr">
          <span>{{ t(`attributes.${key}`) }}</span>
          <strong>{{ shown(value) }}</strong>
        </div>
      </div>
    </section>

    <section v-if="career" class="sheet">
      <h2>{{ t('career.title') }}</h2>
      <p v-if="career.lines.length === 0 && !career.current" class="muted" style="padding: 0 10px">
        {{ t('career.none') }}
      </p>
      <table v-else>
        <thead>
          <tr>
            <th>{{ t('history.season') }}</th>
            <th>{{ t('leaders.club') }}</th>
            <th>{{ t('roster.age') }}</th>
            <th>{{ t('standings.played') }}</th>
            <template v-if="career.goalie">
              <th>{{ t('leaders.savePercentage') }}</th>
              <th>{{ t('career.playoffGames') }}</th>
              <th>{{ t('career.playoffSave') }}</th>
            </template>
            <template v-else>
              <th>G</th>
              <th>A</th>
              <th>B</th>
              <th>+/-</th>
              <th>{{ t('career.playoffGames') }}</th>
              <th>{{ t('career.playoffPoints') }}</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in career.lines" :key="line.year">
            <td>
              <NuxtLink :to="`/history/${line.year}`">{{ line.year }}</NuxtLink>
            </td>
            <td>{{ line.club }}</td>
            <td>{{ line.age ?? '' }}</td>
            <td>{{ line.regular?.gamesPlayed ?? 0 }}</td>
            <template v-if="career.goalie">
              <td>{{ save(line.regular) }}</td>
              <td>{{ line.playoffs?.gamesPlayed ?? '' }}</td>
              <td>{{ save(line.playoffs) }}</td>
            </template>
            <template v-else>
              <td>{{ (line.regular as Counts | null)?.goals ?? 0 }}</td>
              <td>{{ (line.regular as Counts | null)?.assists ?? 0 }}</td>
              <td class="strong">{{ points(line.regular) || 0 }}</td>
              <td>{{ (line.regular as Counts | null)?.plusMinus ?? 0 }}</td>
              <td>{{ line.playoffs?.gamesPlayed ?? '' }}</td>
              <td>{{ points(line.playoffs) }}</td>
            </template>
          </tr>
          <tr v-if="career.current" class="muted">
            <td>{{ career.current.year }} {{ t('career.underWay') }}</td>
            <td>{{ career.current.club }}</td>
            <td />
            <td>{{ career.current.regular?.gamesPlayed ?? 0 }}</td>
            <template v-if="career.goalie">
              <td>{{ save(career.current.regular) }}</td>
              <td>{{ career.current.playoffs?.gamesPlayed ?? '' }}</td>
              <td>{{ save(career.current.playoffs) }}</td>
            </template>
            <template v-else>
              <td>{{ (career.current.regular as Counts | null)?.goals ?? 0 }}</td>
              <td>{{ (career.current.regular as Counts | null)?.assists ?? 0 }}</td>
              <td class="strong">{{ points(career.current.regular) || 0 }}</td>
              <td>{{ (career.current.regular as Counts | null)?.plusMinus ?? 0 }}</td>
              <td>{{ career.current.playoffs?.gamesPlayed ?? '' }}</td>
              <td>{{ points(career.current.playoffs) }}</td>
            </template>
          </tr>
          <tr v-if="career.lines.length > 1" class="strong">
            <td>{{ t('career.total') }}</td>
            <td />
            <td />
            <td>{{ career.totals.regular?.gamesPlayed ?? 0 }}</td>
            <template v-if="career.goalie">
              <td>{{ save(career.totals.regular) }}</td>
              <td>{{ career.totals.playoffs?.gamesPlayed ?? '' }}</td>
              <td>{{ save(career.totals.playoffs) }}</td>
            </template>
            <template v-else>
              <td>{{ (career.totals.regular as Counts | null)?.goals ?? 0 }}</td>
              <td>{{ (career.totals.regular as Counts | null)?.assists ?? 0 }}</td>
              <td>{{ points(career.totals.regular) || 0 }}</td>
              <td>{{ (career.totals.regular as Counts | null)?.plusMinus ?? 0 }}</td>
              <td>{{ career.totals.playoffs?.gamesPlayed ?? '' }}</td>
              <td>{{ points(career.totals.playoffs) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </section>
    <p>
      <NuxtLink to="/roster">{{ t('nav.roster') }}</NuxtLink>
    </p>
  </template>
  <p v-else>{{ t('roster.notOurs') }}</p>
</template>

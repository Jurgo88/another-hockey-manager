<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const club = computed(() => (typeof route.query.club === 'string' ? route.query.club : undefined))
const { data: history } = await useFetch('/api/history', {
  headers: useRequestHeaders(['cookie']),
  query: { club },
})

function choose(event: Event) {
  void navigateTo({ query: { club: (event.target as HTMLSelectElement).value } })
}

function playoffs(result: { kind: string; round?: number }) {
  return result.kind === 'lost'
    ? t('season.playoffsLost', { round: result.round ?? 0 })
    : t(`season.playoffs_${result.kind}`)
}
</script>

<template>
  <header class="page-head">
    <h1>{{ t('history.title') }}</h1>
    <select v-if="history" :value="history.clubId" :aria-label="t('history.club')" @change="choose">
      <option v-for="option in history.clubs" :key="option.id" :value="option.id">
        {{ option.name }}
      </option>
    </select>
  </header>
  <p v-if="history && history.seasons.length === 0" class="muted">{{ t('history.none') }}</p>
  <section v-else-if="history" class="sheet">
    <table>
      <thead>
        <tr>
          <th>{{ t('history.season') }}</th>
          <th>{{ t('standings.played') }}</th>
          <th>{{ t('standings.wins') }}</th>
          <th>{{ t('standings.losses') }}</th>
          <th>{{ t('standings.otLosses') }}</th>
          <th>{{ t('standings.points') }}</th>
          <th>{{ t('history.division') }}</th>
          <th>{{ t('history.league') }}</th>
          <th class="name">{{ t('nav.playoffs') }}</th>
          <th class="name">{{ t('history.champion') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="season in history.seasons" :key="season.year">
          <td>
            <NuxtLink :to="`/history/${season.year}`">{{ season.year }}</NuxtLink>
          </td>
          <td>{{ season.gamesPlayed }}</td>
          <td>{{ season.wins }}</td>
          <td>{{ season.losses }}</td>
          <td>{{ season.otLosses }}</td>
          <td class="strong">{{ season.points }}</td>
          <td>{{ season.divisionRank }}.</td>
          <td>{{ season.leagueRank }}.</td>
          <td class="name">{{ playoffs(season.playoffs) }}</td>
          <td class="name">{{ season.champion }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const { data: season } = await useFetch(`/api/history/${String(route.params.year)}`, {
  headers: useRequestHeaders(['cookie']),
})
const stage = ref<'regular' | 'playoffs'>('regular')
const board = computed(() => season.value?.leaders[stage.value])
</script>

<template>
  <template v-if="season">
    <header class="page-head">
      <h1>{{ t('history.seasonTitle', { year: season.year }) }}</h1>
      <div>{{ t('season.champion', { club: season.champion }) }}</div>
    </header>
    <p>
      <NuxtLink to="/history">{{ t('history.title') }}</NuxtLink>
    </p>

    <div class="grid">
      <section v-for="division in season.divisions" :key="division.id" class="sheet">
        <h2>{{ division.name }}</h2>
        <table>
          <thead>
            <tr>
              <th class="name">{{ t('standings.club') }}</th>
              <th>{{ t('standings.played') }}</th>
              <th>{{ t('standings.wins') }}</th>
              <th>{{ t('standings.losses') }}</th>
              <th>{{ t('standings.otLosses') }}</th>
              <th>{{ t('standings.points') }}</th>
              <th>{{ t('standings.goals') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in division.rows" :key="row.clubId" :class="{ mine: row.mine }">
              <td class="name">
                <NuxtLink :to="{ path: '/history', query: { club: row.clubId } }">
                  {{ row.name }}
                </NuxtLink>
              </td>
              <td>{{ row.gamesPlayed }}</td>
              <td>{{ row.wins }}</td>
              <td>{{ row.losses }}</td>
              <td>{{ row.otLosses }}</td>
              <td class="strong">{{ row.points }}</td>
              <td>{{ row.goalsFor }}:{{ row.goalsAgainst }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <header class="page-head">
      <h2>{{ t('nav.leaders') }}</h2>
      <div class="actions">
        <button
          type="button"
          class="button"
          :aria-pressed="stage === 'regular'"
          @click="stage = 'regular'"
        >
          {{ t('leaders.regular') }}
        </button>
        <button
          type="button"
          class="button"
          :aria-pressed="stage === 'playoffs'"
          @click="stage = 'playoffs'"
        >
          {{ t('leaders.playoffs') }}
        </button>
      </div>
    </header>
    <div v-if="board" class="grid">
      <section class="sheet">
        <h2>{{ t('leaders.points') }}</h2>
        <table>
          <tbody>
            <tr v-for="row in board.points" :key="row.id">
              <td class="name">
                <NuxtLink :to="`/players/${row.id}`">{{ row.name }}</NuxtLink>
              </td>
              <td>{{ row.club }}</td>
              <td>{{ row.gamesPlayed }}</td>
              <td>{{ row.goals }}</td>
              <td>{{ row.assists }}</td>
              <td class="strong">{{ row.points }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="sheet">
        <h2>{{ t('leaders.goalies') }}</h2>
        <table>
          <tbody>
            <tr v-for="row in board.goalies" :key="row.id">
              <td class="name">
                <NuxtLink :to="`/players/${row.id}`">{{ row.name }}</NuxtLink>
              </td>
              <td>{{ row.club }}</td>
              <td>{{ row.gamesPlayed }}</td>
              <td class="strong">{{ row.savePercentage.toFixed(3) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section v-if="season.draft.length" class="sheet">
      <h2>{{ t('history.draft') }}</h2>
      <table>
        <tbody>
          <tr v-for="pick in season.draft" :key="pick.pick" :class="{ mine: pick.mine }">
            <td>{{ pick.pick }}</td>
            <td>{{ t('draft.round', { round: pick.round }) }}</td>
            <td>{{ pick.club }}</td>
            <td class="name">
              <NuxtLink :to="`/players/${pick.playerId}`">{{ pick.name }}</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
  <p v-else>{{ t('errors.noHistory') }}</p>
</template>

<script setup lang="ts">
const { t } = useI18n()

const { data: divisions } = await useFetch('/api/standings', {
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.standings') }}</h1>
  </header>
  <div class="grid">
    <section v-for="division in divisions" :key="division.id" class="sheet">
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
            <td class="name">{{ row.name }}</td>
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
</template>

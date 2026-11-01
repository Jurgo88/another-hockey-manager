<script setup lang="ts">
const { t } = useI18n()

const { data: leaders } = await useFetch('/api/leaders', {
  headers: useRequestHeaders(['cookie']),
})
const stage = ref<'regular' | 'playoffs'>('regular')
const board = computed(() => leaders.value?.[stage.value])
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.leaders') }}</h1>
    <div class="actions">
      <button type="button" class="button" :aria-pressed="stage === 'regular'" @click="stage = 'regular'">
        {{ t('leaders.regular') }}
      </button>
      <button type="button" class="button" :aria-pressed="stage === 'playoffs'" @click="stage = 'playoffs'">
        {{ t('leaders.playoffs') }}
      </button>
    </div>
  </header>
  <div v-if="board" class="grid">
    <section class="sheet">
      <h2>{{ t('leaders.points') }}</h2>
      <table>
        <thead>
          <tr>
            <th class="name">{{ t('box.player') }}</th>
            <th>{{ t('leaders.club') }}</th>
            <th>{{ t('standings.played') }}</th>
            <th>G</th>
            <th>A</th>
            <th>B</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in board.points" :key="row.id">
            <td class="name">{{ row.name }}</td>
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
      <h2>{{ t('leaders.goals') }}</h2>
      <table>
        <thead>
          <tr>
            <th class="name">{{ t('box.player') }}</th>
            <th>{{ t('leaders.club') }}</th>
            <th>{{ t('standings.played') }}</th>
            <th>G</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in board.goals" :key="row.id">
            <td class="name">{{ row.name }}</td>
            <td>{{ row.club }}</td>
            <td>{{ row.gamesPlayed }}</td>
            <td class="strong">{{ row.goals }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section class="sheet">
      <h2>{{ t('leaders.goalies') }}</h2>
      <table>
        <thead>
          <tr>
            <th class="name">{{ t('box.player') }}</th>
            <th>{{ t('leaders.club') }}</th>
            <th>{{ t('standings.played') }}</th>
            <th>{{ t('leaders.savePercentage') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in board.goalies" :key="row.id">
            <td class="name">{{ row.name }}</td>
            <td>{{ row.club }}</td>
            <td>{{ row.gamesPlayed }}</td>
            <td class="strong">{{ row.savePercentage.toFixed(3) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

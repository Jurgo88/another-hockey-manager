<script setup lang="ts">
const { t } = useI18n()

const { data: playoffs } = await useFetch('/api/playoffs', {
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.playoffs') }}</h1>
    <div v-if="playoffs?.champion" class="strong">
      {{ t('season.champion', { club: playoffs.champion }) }}
    </div>
  </header>
  <p v-if="!playoffs" class="muted">{{ t('playoffs.notYet') }}</p>
  <div v-else class="bracket">
    <section v-for="round in playoffs.rounds" :key="round.round" class="sheet">
      <h2>{{ t(`playoffs.round${round.round}`) }}</h2>
      <div v-for="series in round.series" :key="series.id" class="series">
        <div
          v-for="side in [series.higher, series.lower]"
          :key="side.clubId"
          class="series-side"
          :class="{ strong: side.won }"
        >
          <span :class="{ mine: side.mine }">{{ side.name }}</span>
          <span>{{ side.wins }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

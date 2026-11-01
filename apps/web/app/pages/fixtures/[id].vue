<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const { data: box } = await useFetch(
  () => `/api/fixtures/${encodeURIComponent(String(route.params.id))}`,
  { headers: useRequestHeaders(['cookie']) },
)

const sides = computed(() => (box.value ? [box.value.home, box.value.away] : []))

const clock = (seconds: number) => {
  const inPeriod = seconds % 1200
  return `${Math.floor(inPeriod / 60)}:${String(inPeriod % 60).padStart(2, '0')}`
}
const iceTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
</script>

<template>
  <template v-if="box">
    <header class="page-head">
      <h1>{{ box.home.name }} {{ box.result.homeGoals }} : {{ box.result.awayGoals }} {{ box.away.name }}</h1>
      <div>{{ t(`decided.${box.result.decidedIn}`) }}</div>
    </header>

    <section class="sheet">
      <table>
        <thead>
          <tr>
            <th class="name">{{ t('box.period') }}</th>
            <th>{{ box.home.name }}</th>
            <th>{{ box.away.name }}</th>
            <th>{{ t('box.shots') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="period in box.periods" :key="period.period">
            <td class="name">{{ period.period }}</td>
            <td>{{ period.homeGoals }}</td>
            <td>{{ period.awayGoals }}</td>
            <td>{{ period.homeShots }} : {{ period.awayShots }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="sheet">
      <h2>{{ t('box.scoring') }}</h2>
      <table>
        <tbody>
          <tr v-for="(play, index) in box.scoring" :key="index">
            <td>{{ play.period }}</td>
            <td>{{ clock(play.clock) }}</td>
            <td class="name">{{ play.scorer }}</td>
            <td style="text-align: left">{{ play.assists.join(', ') }}</td>
            <td>{{ play.homeGoals }} : {{ play.awayGoals }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div class="grid">
      <section v-for="side in sides" :key="side.name" class="sheet">
        <h2>{{ side.name }}</h2>
        <table>
          <thead>
            <tr>
              <th class="name">{{ t('box.player') }}</th>
              <th>G</th>
              <th>A</th>
              <th>B</th>
              <th>+/-</th>
              <th>{{ t('box.shots') }}</th>
              <th>{{ t('box.ice') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="skater in side.skaters" :key="skater.id">
              <td class="name">{{ skater.name }}</td>
              <td>{{ skater.goals }}</td>
              <td>{{ skater.assists }}</td>
              <td class="strong">{{ skater.points }}</td>
              <td>{{ skater.plusMinus }}</td>
              <td>{{ skater.shots }}</td>
              <td>{{ iceTime(skater.seconds) }}</td>
            </tr>
          </tbody>
          <tbody>
            <tr v-for="goalie in side.goalies" :key="goalie.id">
              <td class="name">{{ goalie.name }}</td>
              <td colspan="4">{{ goalie.saves }} / {{ goalie.shotsAgainst }}</td>
              <td colspan="2">{{ goalie.savePercentage.toFixed(3) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section v-if="box.plays" class="sheet">
      <h2>{{ t('live.plays') }}</h2>
      <PlayByPlay :plays="box.plays" />
    </section>

    <section v-if="box.injuries.length" class="sheet">
      <h2>{{ t('box.injuries') }}</h2>
      <table>
        <tbody>
          <tr v-for="injury in box.injuries" :key="injury.player">
            <td class="name">{{ injury.player }}</td>
            <td>{{ t('box.injuryLength', { fixtures: injury.fixtures }) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>

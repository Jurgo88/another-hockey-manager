<script setup lang="ts">
const { t } = useI18n()

const { data: roster } = await useFetch('/api/roster', { headers: useRequestHeaders(['cookie']) })

const skaters = computed(() =>
  [...(roster.value?.skaters ?? [])].sort(
    (a, b) => b.points - a.points || (a.place ?? 'Z').localeCompare(b.place ?? 'Z'),
  ),
)
const iceTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
const strong = (value: number) => (value >= 17 ? 'strong' : value <= 10 ? 'muted' : '')
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.roster') }}</h1>
    <div>{{ roster?.clubName }}</div>
  </header>
  <section class="sheet">
    <table>
      <thead>
        <tr>
          <th class="name">{{ t('box.player') }}</th>
          <th>{{ t('roster.position') }}</th>
          <th>{{ t('roster.place') }}</th>
          <th>{{ t('roster.age') }}</th>
          <th>{{ t('attributes.shootingShort') }}</th>
          <th>{{ t('attributes.passingShort') }}</th>
          <th>{{ t('attributes.speedShort') }}</th>
          <th>{{ t('attributes.defPositioningShort') }}</th>
          <th>{{ t('attributes.staminaShort') }}</th>
          <th>{{ t('standings.played') }}</th>
          <th>G</th>
          <th>A</th>
          <th>B</th>
          <th>+/-</th>
          <th>{{ t('box.ice') }}</th>
          <th>{{ t('roster.fatigue') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="skater in skaters" :key="skater.id">
          <td class="name">
            <NuxtLink :to="`/players/${skater.id}`">{{ skater.name }}</NuxtLink>
            <span v-if="skater.out" class="tag-out"> {{ t('roster.out', { days: skater.out }) }}</span>
          </td>
          <td>{{ skater.position }}</td>
          <td>{{ skater.place ?? '-' }}</td>
          <td>{{ skater.age }}</td>
          <td :class="strong(skater.attributes.shooting)">{{ skater.attributes.shooting }}</td>
          <td :class="strong(skater.attributes.passing)">{{ skater.attributes.passing }}</td>
          <td :class="strong(skater.attributes.speed)">{{ skater.attributes.speed }}</td>
          <td :class="strong(skater.attributes.defPositioning)">{{ skater.attributes.defPositioning }}</td>
          <td :class="strong(skater.attributes.stamina)">{{ skater.attributes.stamina }}</td>
          <td>{{ skater.gamesPlayed }}</td>
          <td>{{ skater.goals }}</td>
          <td>{{ skater.assists }}</td>
          <td class="strong">{{ skater.points }}</td>
          <td>{{ skater.plusMinus }}</td>
          <td>{{ iceTime(skater.iceSeconds) }}</td>
          <td><FatigueBar :value="skater.fatigue" /></td>
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
          <th>{{ t('roster.place') }}</th>
          <th>{{ t('roster.age') }}</th>
          <th>{{ t('attributes.reflexes') }}</th>
          <th>{{ t('attributes.positioning') }}</th>
          <th>{{ t('attributes.reboundControl') }}</th>
          <th>{{ t('standings.played') }}</th>
          <th>{{ t('leaders.savePercentage') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="goalie in roster?.goalies" :key="goalie.id">
          <td class="name">
            <NuxtLink :to="`/players/${goalie.id}`">{{ goalie.name }}</NuxtLink>
            <span v-if="goalie.out" class="tag-out"> {{ t('roster.out', { days: goalie.out }) }}</span>
          </td>
          <td>{{ goalie.place ?? '-' }}</td>
          <td>{{ goalie.age }}</td>
          <td>{{ goalie.attributes.reflexes }}</td>
          <td>{{ goalie.attributes.positioning }}</td>
          <td>{{ goalie.attributes.reboundControl }}</td>
          <td>{{ goalie.gamesPlayed }}</td>
          <td>{{ goalie.savePercentage?.toFixed(3) ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

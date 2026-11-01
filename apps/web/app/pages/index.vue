<script setup lang="ts">
const { t } = useI18n()

const headers = useRequestHeaders(['cookie'])
const { data: manager } = await useFetch('/api/me', { headers })
const { data: season, refresh } = await useFetch('/api/season', { headers })
const { data: fixtures, refresh: refreshFixtures } = await useFetch('/api/fixtures', { headers })

if (!season.value) await navigateTo('/clubs')

const busy = ref(false)
const failure = ref<string | null>(null)

const recent = computed(() =>
  (fixtures.value ?? [])
    .filter((fixture) => fixture.result)
    .slice(-5)
    .reverse(),
)

async function advance(mode: 'day' | 'fixture') {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/season/advance', { method: 'POST', body: { mode } })
    await Promise.all([refresh(), refreshFixtures()])
  } catch {
    failure.value = 'errors.advanceFailed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <template v-if="season">
    <header class="page-head">
      <h1>{{ season.clubName }}</h1>
      <div>
        {{
          t('season.record', {
            fixtures: season.gamesPlayed,
            wins: season.wins,
            losses: season.losses,
            otLosses: season.otLosses,
            points: season.points,
          })
        }}
      </div>
    </header>
    <p class="muted">{{ t('season.manager', { name: manager?.name }) }}</p>

    <section v-if="season.over" class="sheet">
      <h2>{{ t('season.overTitle') }}</h2>
      <p style="padding: 0 10px">{{ t('season.champion', { club: season.champion }) }}</p>
    </section>

    <section v-else class="sheet" style="padding-bottom: 10px">
      <h2>{{ t(season.inPlayoffs ? 'season.playoffsTitle' : 'season.nextTitle') }}</h2>
      <p v-if="season.next" style="padding: 0 10px">
        {{
          t(season.next.atHome ? 'season.nextHome' : 'season.nextAway', {
            opponent: season.next.opponent,
            day: season.next.day + 1,
          })
        }}
      </p>
      <p v-else style="padding: 0 10px">{{ t('season.noFixture') }}</p>
      <p v-if="season.qualified === false" style="padding: 0 10px" class="muted">
        {{ t('season.missedPlayoffs') }}
      </p>
      <div class="actions" style="padding: 0 10px">
        <button
          type="button"
          class="button"
          :disabled="busy || season.playsNext"
          @click="advance('fixture')"
        >
          {{ t('season.toFixture') }}
        </button>
        <button type="button" class="button button-go" :disabled="busy" @click="advance('day')">
          {{ t(season.playsNext ? 'season.playFixture' : 'season.nextDay') }}
        </button>
      </div>
      <p v-if="failure" class="error" role="alert" style="padding: 0 10px">{{ t(failure) }}</p>
    </section>

    <section v-if="recent.length" class="sheet">
      <h2>{{ t('season.recent') }}</h2>
      <table>
        <tbody>
          <tr v-for="fixture in recent" :key="fixture.id">
            <td class="name">
              <NuxtLink :to="`/fixtures/${encodeURIComponent(fixture.id)}`">
                {{ fixture.atHome ? '' : '@ ' }}{{ fixture.opponent }}
              </NuxtLink>
            </td>
            <td>{{ fixture.result?.goalsFor }} : {{ fixture.result?.goalsAgainst }}</td>
            <td>{{ t(`decided.${fixture.result?.decidedIn}`) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p>
      <NuxtLink to="/clubs">{{ t('season.newSeason') }}</NuxtLink>
    </p>
  </template>
</template>

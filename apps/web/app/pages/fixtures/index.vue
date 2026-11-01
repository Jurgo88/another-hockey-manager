<script setup lang="ts">
const { t } = useI18n()

const { data: fixtures } = await useFetch('/api/fixtures', {
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <header class="page-head">
    <h1>{{ t('nav.fixtures') }}</h1>
  </header>
  <section class="sheet">
    <table>
      <thead>
        <tr>
          <th>{{ t('fixtures.day') }}</th>
          <th class="name">{{ t('fixtures.opponent') }}</th>
          <th>{{ t('fixtures.score') }}</th>
          <th>{{ t('fixtures.decided') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="fixture in fixtures" :key="fixture.id">
          <td>{{ fixture.day + 1 }}</td>
          <td class="name">
            <NuxtLink
              v-if="fixture.result"
              :to="`/fixtures/${encodeURIComponent(fixture.id)}`"
            >
              {{ fixture.atHome ? '' : '@ ' }}{{ fixture.opponent }}
            </NuxtLink>
            <template v-else>{{ fixture.atHome ? '' : '@ ' }}{{ fixture.opponent }}</template>
          </td>
          <td>
            <template v-if="fixture.result">
              {{ fixture.result.goalsFor }} : {{ fixture.result.goalsAgainst }}
            </template>
          </td>
          <td>
            <template v-if="fixture.result">{{ t(`decided.${fixture.result.decidedIn}`) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

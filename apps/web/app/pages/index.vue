<script setup lang="ts">
const { t } = useI18n()

const headers = useRequestHeaders(['cookie'])
const { data: manager } = await useFetch('/api/me', { headers })
const { data: season } = await useFetch('/api/season', { headers })

if (!season.value) await navigateTo('/clubs')

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <section v-if="season">
    <h1>{{ season.clubName }}</h1>
    <p>{{ t('season.manager', { name: manager?.name }) }}</p>
    <p>{{ t('season.record', { fixtures: season.gamesPlayed, points: season.points }) }}</p>
    <p v-if="season.next">
      {{
        t(season.next.atHome ? 'season.nextHome' : 'season.nextAway', {
          opponent: season.next.opponent,
          day: season.next.day + 1,
        })
      }}
    </p>
    <p><NuxtLink to="/clubs">{{ t('season.newSeason') }}</NuxtLink></p>
    <p>
      <button type="button" class="link" @click="signOut">{{ t('season.signOut') }}</button>
    </p>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n()

const { data: divisions } = await useFetch('/api/clubs', { headers: useRequestHeaders(['cookie']) })
const choosing = ref(false)

async function choose(clubId: string) {
  choosing.value = true
  await $fetch('/api/season', { method: 'POST', body: { clubId } })
  await navigateTo('/')
}
</script>

<template>
  <section>
    <h1>{{ t('clubs.title') }}</h1>
    <p>{{ t('clubs.intro') }}</p>
    <div class="divisions">
      <div v-for="division in divisions" :key="division.id">
        <h2>{{ division.name }}</h2>
        <ul>
          <li v-for="club in division.clubs" :key="club.id">
            <button type="button" class="link" :disabled="choosing" @click="choose(club.id)">
              {{ club.name }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'bare' })

const { t } = useI18n()

const { data } = await useFetch('/api/clubs', { headers: useRequestHeaders(['cookie']) })
const choosing = ref(false)
const failure = ref<string | null>(null)
// Generated unless the Manager picks the roster file, which the server offers only when it has one.
const source = ref<'generated' | 'file'>('generated')

async function choose(clubId: string) {
  choosing.value = true
  failure.value = null
  try {
    await $fetch('/api/season', { method: 'POST', body: { clubId, source: source.value } })
    await navigateTo('/')
  } catch {
    failure.value = 'errors.saveFailed'
    choosing.value = false
  }
}
</script>

<template>
  <section>
    <h1>{{ t('clubs.title') }}</h1>
    <p>{{ t('clubs.intro') }}</p>
    <fieldset v-if="(data?.sources.length ?? 0) > 1" class="sources">
      <legend>{{ t('clubs.source') }}</legend>
      <label v-for="option in data?.sources" :key="option">
        <input v-model="source" type="radio" name="source" :value="option" />
        {{ t(`clubs.source_${option}`) }}
      </label>
    </fieldset>
    <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
    <div class="divisions">
      <div v-for="division in data?.divisions" :key="division.id">
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

<style scoped>
.sources {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  border: 0;
  padding: 0;
  margin: 0 0 16px;
}
.sources legend {
  font-weight: 600;
  margin-bottom: 6px;
}
</style>

<script setup lang="ts">
import type { Lineup } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

const props = defineProps<{
  lineup: Lineup
  players: LineupPage['players']
}>()
const emit = defineEmits<{ 'update:lineup': [lineup: Lineup] }>()

const { t } = useI18n()
const failure = ref(false)

const hurt = computed(() => {
  const { lineup } = props
  const dressed = new Set([
    lineup.starter,
    lineup.backup,
    ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
  ])
  return props.players.filter((player) => dressed.has(player.id) && player.out > 0)
})

async function fix() {
  failure.value = false
  try {
    const { lineup } = await $fetch<{ lineup: Lineup }>('/api/lineup/auto', {
      method: 'POST',
      body: props.lineup,
    })
    emit('update:lineup', lineup)
  } catch {
    failure.value = true
  }
}
</script>

<template>
  <section v-if="hurt.length" class="notice" role="status">
    <div>
      <strong>{{ t('injuries.title', { count: hurt.length }) }}</strong>
      <ul>
        <li v-for="player in hurt" :key="player.id">
          {{ player.name }}: {{ t('injuries.out', { fixtures: player.out }) }}
        </li>
      </ul>
      <p class="muted">{{ t('injuries.help') }}</p>
      <p v-if="failure" class="error">{{ t('errors.saveFailed') }}</p>
    </div>
    <button type="button" class="button button-go" @click="fix">{{ t('injuries.fix') }}</button>
  </section>
</template>

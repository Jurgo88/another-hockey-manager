<script setup lang="ts">
defineProps<{
  notices: readonly {
    id: string
    day: number
    kind: string
    read: boolean
    player: string | null
    playerId: string | null
    fixtures: number | null
  }[]
}>()
const { t } = useI18n()
</script>

<template>
  <table>
    <tbody>
      <tr v-for="notice in notices" :key="notice.id" :class="{ 'notice-new': !notice.read }">
        <td>{{ t('fixtures.day') }} {{ notice.day + 1 }}</td>
        <td class="play-text">
          <NuxtLink v-if="notice.playerId" :to="`/players/${notice.playerId}`">{{ notice.player }}</NuxtLink>
          {{ t(notice.fixtures === 0 ? 'notices.injuryBrief' : `notices.${notice.kind}`, { fixtures: notice.fixtures ?? 0 }) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

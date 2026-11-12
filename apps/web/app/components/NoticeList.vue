<script setup lang="ts">
defineProps<{
  notices: readonly {
    id: string
    day: number
    kind: string
    read: boolean
    player: string | null
    playerId: string | null
    days: number | null
    fixtures: number | null
    round?: number | null
    pick?: number | null
  }[]
}>()
const { t } = useI18n()

/** Notices stored before #97 count Fixtures, and one that cost none has its own wording. */
function noticeText(notice: {
  kind: string
  days: number | null
  fixtures: number | null
  round?: number | null
  pick?: number | null
}) {
  if (notice.kind === 'injury' && notice.days !== null)
    return t('notices.injuryDays', { days: notice.days })
  if (notice.fixtures === 0) return t('notices.injuryBrief')
  return t(`notices.${notice.kind}`, {
    fixtures: notice.fixtures ?? 0,
    round: notice.round ?? 0,
    pick: notice.pick ?? 0,
  })
}
</script>

<template>
  <table>
    <tbody>
      <tr v-for="notice in notices" :key="notice.id" :class="{ 'notice-new': !notice.read }">
        <td>{{ t('fixtures.day') }} {{ notice.day + 1 }}</td>
        <td class="play-text">
          <NuxtLink v-if="notice.playerId" :to="`/players/${notice.playerId}`">{{
            notice.player
          }}</NuxtLink>
          {{ noticeText(notice) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

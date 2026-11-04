<script setup lang="ts">
import type { Play } from '~~/shared/types/play'

defineProps<{ plays: readonly Play[] }>()
const { t } = useI18n()

const clock = (seconds: number) => {
  const inPeriod = seconds % 1200
  return `${Math.floor(inPeriod / 60)}:${String(inPeriod % 60).padStart(2, '0')}`
}

function words(play: Play): string {
  switch (play.kind) {
    case 'goal': {
      const flags = [play.powerPlay ? t('plays.powerPlay') : '', play.emptyNet ? t('plays.emptyNet') : '']
      const extra = flags.filter(Boolean).join(', ')
      const assists = play.assists.length ? ` (${play.assists.join(', ')})` : ''
      return `${t('plays.goal', { player: play.player, club: play.club })}${assists}${extra ? `, ${extra}` : ''}`
    }
    case 'chance':
      return t('plays.chance', { player: play.player, club: play.club })
    case 'penalty':
      return t('plays.penalty', {
        player: play.player,
        club: play.club,
        kind: t(`penalties.${play.penalty}`),
        minutes: play.minutes,
      })
    case 'injury':
      return play.days !== null
        ? t('plays.injuryDays', { player: play.player, club: play.club, days: play.days })
        : t('plays.injury', { player: play.player, club: play.club, fixtures: play.fixtures })
    case 'lineup':
      return t('plays.lineup', { club: play.club })
    case 'period_end':
      return t('plays.periodEnd', { home: play.homeGoals, away: play.awayGoals })
  }
}
</script>

<template>
  <table>
    <tbody>
      <tr v-for="(play, index) in plays" :key="index" :class="{ 'play-goal': play.kind === 'goal', 'play-mark': play.kind === 'period_end' }">
        <td>{{ play.period }}</td>
        <td>{{ clock(play.clock) }}</td>
        <td class="play-text">{{ words(play) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
/** Skaters rarely pass this in a Fixture, so the bar uses its whole width. */
const FULL_BAR = 60

const props = defineProps<{ value: number }>()
const { t } = useI18n()

const width = computed(() => `${Math.min(100, (100 * props.value) / FULL_BAR)}%`)
const tone = computed(() =>
  props.value >= 40 ? 'fatigue-high' : props.value >= 20 ? 'fatigue-mid' : 'fatigue-low',
)
</script>

<template>
  <span class="fatigue" :title="t('lineup.fatigueHelp')">
    <span class="fatigue-track"><span class="fatigue-fill" :class="tone" :style="{ width }" /></span>
    <span class="fatigue-value">{{ value }}</span>
  </span>
</template>

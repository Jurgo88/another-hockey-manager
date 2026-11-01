<script setup lang="ts">
/** A Manager reads energy, which is what fatigue leaves: 100 for a rested Skater. */
const props = defineProps<{ value: number }>()
const { t } = useI18n()

const energy = computed(() => Math.round(100 - props.value))
const tone = computed(() =>
  energy.value <= 60 ? 'fatigue-high' : energy.value <= 80 ? 'fatigue-mid' : 'fatigue-low',
)
</script>

<template>
  <span class="fatigue" :title="t('lineup.fatigueHelp')">
    <span class="fatigue-track"
      ><span class="fatigue-fill" :class="tone" :style="{ width: `${energy}%` }"
    /></span>
    <span class="fatigue-value">{{ energy }}</span>
  </span>
</template>

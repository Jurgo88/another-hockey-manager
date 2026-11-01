<script setup lang="ts">
import type { MatchupPolicy, Tactics } from '@ahm/sim'

const props = defineProps<{
  tactics: Tactics
  /** Goalie rotation is decided before a Fixture, not at an intermission. */
  rotation: boolean
}>()
const emit = defineEmits<{ 'update:tactics': [tactics: Tactics] }>()

const { t } = useI18n()

type Dial = 'aggression' | 'shotVolume' | 'shiftLength'
const dials: readonly Dial[] = ['aggression', 'shotVolume', 'shiftLength']
const policies: readonly MatchupPolicy[] = ['none', 'exploit', 'shutdown']

const presets = [
  { key: 'defensive', aggression: 30, shotVolume: 40, shiftLength: 60 },
  { key: 'balanced', aggression: 50, shotVolume: 50, shiftLength: 50 },
  { key: 'attacking', aggression: 70, shotVolume: 60, shiftLength: 40 },
]

const update = (change: Partial<Tactics>) => emit('update:tactics', { ...props.tactics, ...change })
const setDial = (dial: Dial, event: Event) =>
  update({ [dial]: Number((event.target as HTMLInputElement).value) })

/** Which of the three plain-language effects a dial's value falls under. */
const band = (value: number) => (value < 40 ? 'low' : value > 60 ? 'high' : 'mid')
/** The engine's target Shift, at most 60 seconds and at least 30. */
const shiftSeconds = computed(() => Math.round(60 - (30 * props.tactics.shiftLength) / 100))

const setMaxStarts = (event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value)
  update({
    goalieRotation: {
      ...props.tactics.goalieRotation,
      maxConsecutiveStarts: value > 0 ? value : null,
    },
  })
}
const setRest = (event: Event) =>
  update({
    goalieRotation: {
      ...props.tactics.goalieRotation,
      restOnBackToBack: (event.target as HTMLInputElement).checked,
    },
  })
</script>

<template>
  <div class="tactics">
    <section class="sheet">
      <h2>{{ t('tactics.style') }}</h2>
      <div class="presets">
        <span class="muted">{{ t('tactics.presets') }}</span>
        <button
          v-for="preset in presets"
          :key="preset.key"
          type="button"
          class="chip"
          @click="
            update({
              aggression: preset.aggression,
              shotVolume: preset.shotVolume,
              shiftLength: preset.shiftLength,
            })
          "
        >
          {{ t(`tactics.${preset.key}`) }}
        </button>
      </div>
      <div v-for="dial in dials" :key="dial" class="dial-row">
        <label :for="`dial-${dial}`" class="dial-name">{{ t(`tactics.${dial}`) }}</label>
        <div class="dial-scale">
          <span class="muted">{{ t(`tactics.${dial}Low`) }}</span>
          <input
            :id="`dial-${dial}`"
            type="range"
            min="0"
            max="100"
            step="5"
            :value="tactics[dial]"
            @input="setDial(dial, $event)"
          />
          <span class="muted">{{ t(`tactics.${dial}High`) }}</span>
        </div>
        <p class="dial-effect">
          {{ t(`tactics.${dial}Effect.${band(tactics[dial])}`) }}
          <template v-if="dial === 'shiftLength'">
            {{ t('tactics.shiftSeconds', { seconds: shiftSeconds }) }}
          </template>
        </p>
      </div>
    </section>

    <section class="sheet">
      <h2>{{ t('tactics.matchup') }}</h2>
      <p class="sheet-note muted">{{ t('tactics.matchupHelp') }}</p>
      <div class="choices" role="radiogroup" :aria-label="t('tactics.matchup')">
        <button
          v-for="policy in policies"
          :key="policy"
          type="button"
          role="radio"
          class="choice"
          :class="{ 'choice-on': tactics.matchup === policy }"
          :aria-checked="tactics.matchup === policy"
          @click="update({ matchup: policy })"
        >
          <strong>{{ t(`tactics.${policy}`) }}</strong>
          <span>{{ t(`tactics.${policy}Help`) }}</span>
        </button>
      </div>
    </section>

    <section v-if="rotation" class="sheet">
      <h2>{{ t('tactics.rotation') }}</h2>
      <p class="sheet-note muted">{{ t('tactics.rotationHelp') }}</p>
      <div class="rotation">
        <label>
          <input
            type="checkbox"
            :checked="tactics.goalieRotation.restOnBackToBack"
            @change="setRest"
          />
          {{ t('tactics.restOnBackToBack') }}
        </label>
        <label>
          {{ t('tactics.maxStarts') }}
          <select :value="tactics.goalieRotation.maxConsecutiveStarts ?? 0" @change="setMaxStarts">
            <option :value="0">{{ t('tactics.noLimit') }}</option>
            <option v-for="count in 5" :key="count" :value="count">{{ count }}</option>
          </select>
        </label>
      </div>
    </section>
  </div>
</template>

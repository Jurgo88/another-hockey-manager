<script setup lang="ts">
const { t } = useI18n()

const { data: page, refresh } = await useFetch('/api/moves', {
  headers: useRequestHeaders(['cookie']),
})
if (!page.value) await navigateTo('/')

/** The Manager's own moves if he declared them, the assistant's otherwise. */
const callUps = ref(new Set<string>())
const releases = ref(new Set<string>())
const saved = ref(false)
const failure = ref<string | null>(null)
const problems = ref<string[]>([])

function load(moves: { callUps: readonly string[]; releases: readonly string[] }) {
  callUps.value = new Set(moves.callUps)
  releases.value = new Set(moves.releases)
}
if (page.value) load(page.value.declared ?? page.value.proposal)

const own = computed(() => page.value?.declared !== null)
const names = computed(
  () =>
    new Map(
      [...(page.value?.roster ?? []), ...(page.value?.prospects ?? [])].map((p) => [p.id, p.name]),
    ),
)

function toggle(set: Set<string>, id: string) {
  if (set.has(id)) set.delete(id)
  else set.add(id)
  saved.value = false
  problems.value = []
}

interface Violation {
  kind: string
  playerId?: string
  group?: string
  count?: number
  shape?: number
  payroll?: number
}

async function save(moves: { callUps: string[]; releases: string[] }) {
  failure.value = null
  problems.value = []
  try {
    await $fetch('/api/moves', { method: 'PUT', body: moves })
    await refresh()
    if (page.value) load(page.value.declared ?? page.value.proposal)
    saved.value = true
  } catch (error) {
    const data = (error as { data?: { data?: unknown } }).data?.data
    if (Array.isArray(data)) {
      problems.value = (data as Violation[]).map((v) =>
        t(`moves.violation.${v.kind}`, {
          name: v.playerId ? (names.value.get(v.playerId) ?? v.playerId) : '',
          group: v.group ? t(`moves.group.${v.group}`) : '',
          count: v.count ?? 0,
          shape: v.shape ?? 0,
          payroll: ((v.payroll ?? 0) * 100).toFixed(1),
        }),
      )
    } else {
      failure.value = 'errors.saveFailed'
    }
  }
}

const saveOwn = () => save({ callUps: [...callUps.value], releases: [...releases.value] })
const useAssistant = () =>
  page.value &&
  save({ callUps: [...page.value.proposal.callUps], releases: [...page.value.proposal.releases] })
</script>

<template>
  <template v-if="page">
    <header class="page-head">
      <h1>{{ t('moves.title', { year: page.year }) }}</h1>
      <div class="actions">
        <button type="button" class="button" @click="useAssistant">
          {{ t('moves.useAssistant') }}
        </button>
        <button type="button" class="button button-go" @click="saveOwn">
          {{ t('moves.save') }}
        </button>
      </div>
    </header>
    <p class="muted">{{ t(own ? 'moves.ownHelp' : 'moves.assistantHelp') }}</p>
    <p v-if="page.gaps.length" class="muted">
      {{ t('moves.gaps', { positions: page.gaps.join(', ') }) }}
    </p>
    <p v-if="saved" class="strong" role="status">{{ t('moves.saved') }}</p>
    <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
    <ul v-if="problems.length" class="error" role="alert">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>

    <section class="sheet">
      <h2>{{ t('moves.prospects') }}</h2>
      <table>
        <thead>
          <tr>
            <th>{{ t('moves.callUp') }}</th>
            <th class="name">{{ t('box.player') }}</th>
            <th>{{ t('roster.position') }}</th>
            <th>{{ t('roster.age') }}</th>
            <th>{{ t('draft.level') }}</th>
            <th>{{ t('draft.potential') }}</th>
            <th>{{ t('moves.drafted') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="prospect in page.prospects" :key="prospect.id">
            <td>
              <input
                type="checkbox"
                :checked="callUps.has(prospect.id)"
                :aria-label="t('moves.callUp')"
                @change="toggle(callUps, prospect.id)"
              />
            </td>
            <td class="name">{{ prospect.name }}</td>
            <td>{{ prospect.position }}</td>
            <td>{{ prospect.age }}</td>
            <td>{{ shown(prospect.level) }}</td>
            <td>{{ shown(prospect.potential) }}</td>
            <td>{{ t('moves.draftedIn', { year: prospect.draftYear, round: prospect.round }) }}</td>
            <td class="muted">{{ prospect.ready ? t('moves.ready') : '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="sheet">
      <h2>{{ t('nav.roster') }}</h2>
      <table>
        <thead>
          <tr>
            <th>{{ t('moves.release') }}</th>
            <th class="name">{{ t('box.player') }}</th>
            <th>{{ t('roster.position') }}</th>
            <th>{{ t('roster.age') }}</th>
            <th>{{ t('draft.level') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in page.roster" :key="player.id">
            <td>
              <input
                type="checkbox"
                :checked="releases.has(player.id)"
                :aria-label="t('moves.release')"
                @change="toggle(releases, player.id)"
              />
            </td>
            <td class="name">{{ player.name }}</td>
            <td>{{ player.position }}</td>
            <td>{{ player.age }}</td>
            <td>{{ shown(player.level) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>

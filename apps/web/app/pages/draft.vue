<script setup lang="ts">
const { t } = useI18n()

const { data: room, refresh } = await useFetch('/api/draft', {
  headers: useRequestHeaders(['cookie']),
})
if (!room.value) await navigateTo('/')

const busy = ref(false)
const failure = ref<string | null>(null)

/** The picks before the Manager's, then his own, then on to his next. */
async function post(path: string, body: Record<string, unknown> = {}) {
  busy.value = true
  failure.value = null
  try {
    await $fetch(path, { method: 'POST', body })
    await Promise.all([refresh(), refreshNuxtData('unread')])
  } catch {
    failure.value = 'errors.draftFailed'
  } finally {
    busy.value = false
  }
}

/** Levels compare only within a position group (ADR-028), so each has a table of its own. */
const GROUPS = ['forward', 'defence', 'goalie'] as const

const recent = computed(() => [...(room.value?.picks ?? [])].reverse())
const mine = computed(() => (room.value?.picks ?? []).filter((pick) => pick.mine))
</script>

<template>
  <template v-if="room">
    <header class="page-head">
      <h1>{{ t('draft.title', { year: room.year }) }}</h1>
      <div>{{ t('draft.myPicks', { picks: room.myPicks.join(', ') }) }}</div>
    </header>
    <p class="muted">{{ t('draft.help') }}</p>

    <section class="sheet" style="padding-bottom: 10px">
      <template v-if="room.made || !room.clock">
        <h2>{{ t('draft.madeTitle') }}</h2>
        <p style="padding: 0 10px">
          <NuxtLink to="/moves" class="button button-go button-link">{{
            t('draft.toMoves')
          }}</NuxtLink>
        </p>
      </template>
      <template v-else-if="room.clock.mine">
        <h2>{{ t('draft.yourPick', { pick: room.clock.pick, round: room.clock.round }) }}</h2>
        <div class="actions" style="padding: 0 10px">
          <button type="button" class="button" :disabled="busy" @click="post('/api/draft/auto')">
            {{ t('draft.leaveRest') }}
          </button>
        </div>
      </template>
      <template v-else>
        <h2>{{ t('draft.onTheClock', { club: room.clock.club, pick: room.clock.pick }) }}</h2>
        <div class="actions" style="padding: 0 10px">
          <button
            type="button"
            class="button button-go"
            :disabled="busy"
            @click="post('/api/draft/pick')"
          >
            {{ t('draft.toMyPick') }}
          </button>
          <button type="button" class="button" :disabled="busy" @click="post('/api/draft/auto')">
            {{ t('draft.leaveRest') }}
          </button>
        </div>
      </template>
      <p v-if="failure" class="error" role="alert" style="padding: 0 10px">{{ t(failure) }}</p>
    </section>

    <section v-if="mine.length" class="sheet">
      <h2>{{ t('draft.mine') }}</h2>
      <table>
        <tbody>
          <tr v-for="pick in mine" :key="pick.pick">
            <td>{{ pick.pick }}</td>
            <td class="name">{{ pick.name }}</td>
            <td>{{ pick.position }}</td>
            <td>{{ pick.age }}</td>
            <td>{{ pick.level ? shown(pick.level) : '' }}</td>
            <td>{{ pick.potential ? shown(pick.potential) : '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p v-if="!room.made && room.clock" class="muted">{{ t('draft.byGroup') }}</p>
    <section v-for="group in room.made || !room.clock ? [] : GROUPS" :key="group" class="sheet">
      <h2>{{ t(`draft.group.${group}`, { count: room.available[group].length }) }}</h2>
      <table>
        <thead>
          <tr>
            <th class="name">{{ t('box.player') }}</th>
            <th>{{ t('roster.position') }}</th>
            <th>{{ t('roster.age') }}</th>
            <th>{{ t('draft.level') }}</th>
            <th>{{ t('draft.potential') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="prospect in room.available[group]" :key="prospect.id">
            <td class="name">{{ prospect.name }}</td>
            <td>{{ prospect.position }}</td>
            <td>{{ prospect.age }}</td>
            <td>{{ shown(prospect.level) }}</td>
            <td>{{ shown(prospect.potential) }}</td>
            <td>
              <button
                v-if="room.clock?.mine"
                type="button"
                class="button"
                :disabled="busy"
                @click="post('/api/draft/pick', { playerId: prospect.id })"
              >
                {{ t('draft.pick') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="recent.length" class="sheet">
      <h2>{{ t('draft.picks') }}</h2>
      <table>
        <tbody>
          <tr v-for="pick in recent" :key="pick.pick" :class="{ strong: pick.mine }">
            <td>{{ pick.pick }}</td>
            <td>{{ t('draft.round', { round: pick.round }) }}</td>
            <td>{{ pick.club }}</td>
            <td class="name">{{ pick.name }}</td>
            <td>{{ pick.position }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>

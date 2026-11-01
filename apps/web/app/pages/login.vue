<script setup lang="ts">
const { t } = useI18n()

const creating = ref(false)
const email = ref('')
const password = ref('')
const name = ref('')
const failure = ref<string | null>(null)

async function submit() {
  failure.value = null
  try {
    await $fetch(creating.value ? '/api/auth/signup' : '/api/auth/login', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        ...(creating.value ? { name: name.value } : {}),
      },
    })
    await navigateTo('/')
  } catch {
    failure.value = creating.value ? 'errors.signupFailed' : 'errors.invalidLogin'
  }
}
</script>

<template>
  <section>
    <h1>{{ t(creating ? 'login.createTitle' : 'login.title') }}</h1>
    <form class="form" @submit.prevent="submit">
      <label v-if="creating">
        {{ t('login.name') }}
        <input v-model="name" required autocomplete="name" />
      </label>
      <label>
        {{ t('login.email') }}
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        {{ t('login.password') }}
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          :autocomplete="creating ? 'new-password' : 'current-password'"
        />
      </label>
      <p v-if="failure" class="error" role="alert">{{ t(failure) }}</p>
      <button type="submit">{{ t(creating ? 'login.create' : 'login.signIn') }}</button>
    </form>
    <p>
      <button type="button" class="link" @click="creating = !creating">
        {{ t(creating ? 'login.haveAccount' : 'login.needAccount') }}
      </button>
    </p>
  </section>
</template>

<script setup lang="ts">
import { SignIn } from '@clerk/vue'
</script>

<template>
  <div class="auth-screen">
    <SignIn routing="path" path="/sign-in" sign-up-url="/sign-up" fallback-redirect-url="/" />
  </div>
</template>

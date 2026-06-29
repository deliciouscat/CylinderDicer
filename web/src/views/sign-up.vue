<script setup lang="ts">
import { SignUp } from '@clerk/vue'
</script>

<template>
  <div class="auth-screen">
    <SignUp routing="path" path="/sign-up" sign-in-url="/sign-in" fallback-redirect-url="/" />
  </div>
</template>

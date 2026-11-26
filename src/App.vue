<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { loadConfig } from './state.js'

onMounted(() => loadConfig())
</script>

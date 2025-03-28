import { defineNuxtConfig } from 'nuxt/config'
import Module from '../src/module'

export default defineNuxtConfig({
  jobQueue: {

  },

  devtools: { enabled: true },

  sourcemap: {
    client: true,
  },

  modules: [Module],
  compatibilityDate: '2024-12-15',
})
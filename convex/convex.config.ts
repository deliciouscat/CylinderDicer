import { defineApp } from 'convex/server'
import { v } from 'convex/values'

export default defineApp({
  env: {
    LADDER_DEV_FIXTURES: v.optional(v.string()),
    QA_TOOLS_ENABLED: v.optional(v.string()),
    GAMEPLAY_BOTS_ENABLED: v.optional(v.string()),
  },
})

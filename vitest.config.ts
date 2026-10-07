import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'app/**/*.test.ts', 'functions/src/**/*.test.ts'],
    environment: 'node',
  },
})

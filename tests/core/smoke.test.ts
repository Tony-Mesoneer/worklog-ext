import { describe, it, expect } from 'vitest'

describe('hạ tầng test', () => {
  it('chạy được và resolve alias @/', async () => {
    // import động để test fail rõ ràng nếu alias sai
    const mod = await import('@/core/duration')
    expect(typeof mod.parseDuration).toBe('function')
  })
})

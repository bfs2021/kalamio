import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep the logger quiet and avoid its file transport during tests.
vi.mock('./logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock the Upstash client. UPSTASH_* env is set in vitest.config.js, so
// config/redis.js constructs a client — which resolves to this mock.
const { getMock, setMock, saddMock, expireMock, smembersMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
  saddMock: vi.fn(),
  expireMock: vi.fn(),
  smembersMock: vi.fn(),
  delMock: vi.fn(),
}))
// A regular function (not an arrow) so config/redis.js can call it with `new` —
// Vitest 4+ mocks keep the implementation's constructability.
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () {
    return {
      get: getMock,
      set: setMock,
      sadd: saddMock,
      expire: expireMock,
      smembers: smembersMock,
      del: delMock,
    }
  }),
}))

import { cacheGet, cacheSet, cacheAddToTag, cacheInvalidateTags, isCacheEnabled } from './redis.js'

beforeEach(() => {
  ;[getMock, setMock, saddMock, expireMock, smembersMock, delMock].forEach((m) => m.mockReset())
})

describe('redis cache helpers', () => {
  it('reports enabled when Upstash creds are present', () => {
    expect(isCacheEnabled()).toBe(true)
  })

  it('cacheGet returns the value on success', async () => {
    getMock.mockResolvedValue({ x: 1 })
    await expect(cacheGet('k')).resolves.toEqual({ x: 1 })
    expect(getMock).toHaveBeenCalledWith('k')
  })

  it('cacheGet returns null (never throws) on a Redis error', async () => {
    getMock.mockRejectedValue(new Error('upstream down'))
    await expect(cacheGet('k')).resolves.toBeNull()
  })

  it('cacheSet writes with the TTL as an EX option', async () => {
    setMock.mockResolvedValue('OK')
    await cacheSet('k', { v: 1 }, 30)
    expect(setMock).toHaveBeenCalledWith('k', { v: 1 }, { ex: 30 })
  })

  it('cacheSet swallows errors (never throws)', async () => {
    setMock.mockRejectedValue(new Error('write failed'))
    await expect(cacheSet('k', { v: 1 }, 30)).resolves.toBeUndefined()
  })

  it('cacheAddToTag registers the key in the tag set with a TTL', async () => {
    saddMock.mockResolvedValue(1)
    expireMock.mockResolvedValue(1)
    await cacheAddToTag('blogs', 'cache:POST:/feed:abc')
    expect(saddMock).toHaveBeenCalledWith('cache:tag:blogs', 'cache:POST:/feed:abc')
    expect(expireMock).toHaveBeenCalledWith('cache:tag:blogs', expect.any(Number))
  })

  it('cacheInvalidateTags deletes every tagged key and the tag set', async () => {
    smembersMock.mockResolvedValue(['cache:POST:/feed:a', 'cache:POST:/feed:b'])
    delMock.mockResolvedValue(1)
    await cacheInvalidateTags(['blogs'])
    expect(smembersMock).toHaveBeenCalledWith('cache:tag:blogs')
    expect(delMock).toHaveBeenCalledWith('cache:POST:/feed:a', 'cache:POST:/feed:b')
    expect(delMock).toHaveBeenCalledWith('cache:tag:blogs')
  })

  it('cacheInvalidateTags handles an empty tag set (only deletes the set key)', async () => {
    smembersMock.mockResolvedValue([])
    delMock.mockResolvedValue(1)
    await cacheInvalidateTags(['blogs'])
    // Only the set key is deleted; no del([]) call with zero keys.
    expect(delMock).toHaveBeenCalledTimes(1)
    expect(delMock).toHaveBeenCalledWith('cache:tag:blogs')
  })

  it('cacheInvalidateTags never throws on a Redis error', async () => {
    smembersMock.mockRejectedValue(new Error('boom'))
    await expect(cacheInvalidateTags(['blogs'])).resolves.toBeUndefined()
  })
})

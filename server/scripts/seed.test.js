import { describe, it, expect } from 'vitest'
import { inflateSync } from 'node:zlib'
import { assertLocalTarget, mongoHosts, inline, bannerPng, crc32 } from './seed-helpers.js'
import { USERS, ARTICLES, DRAFTS, TEXT_POSTS, FOLLOWS, PUBLICATION } from './seed-data.js'

const LOCAL_ENV = {
  DB_LOCATION: 'mongodb://localhost:27017/kalamio',
  S3_ENDPOINT: 'http://localhost:9000',
}

describe('mongoHosts', () => {
  it('extracts hostnames without ports, credentials or options', () => {
    expect(mongoHosts('mongodb://localhost:27017/kalamio')).toEqual(['localhost'])
    expect(mongoHosts('mongodb://user:p%40ss@db.example.com:27017/x?ssl=true')).toEqual(['db.example.com'])
    expect(mongoHosts('mongodb://a:1,b:2,c/db')).toEqual(['a', 'b', 'c'])
    expect(mongoHosts('mongodb://[::1]:27017/db')).toEqual(['::1'])
  })
})

describe('assertLocalTarget', () => {
  it('accepts the docker-compose defaults from .env.example', () => {
    expect(() => assertLocalTarget(LOCAL_ENV)).not.toThrow()
    expect(() => assertLocalTarget({ DB_LOCATION: 'mongodb://mongo:27017/k', S3_ENDPOINT: 'http://storage:9000' })).not.toThrow()
  })

  it.each([
    ['production', { ...LOCAL_ENV, NODE_ENV: 'production' }, /production/],
    ['missing DB_LOCATION', { S3_ENDPOINT: LOCAL_ENV.S3_ENDPOINT }, /DB_LOCATION is not set/],
    ['Atlas', { ...LOCAL_ENV, DB_LOCATION: 'mongodb+srv://u:p@cluster0.abc.mongodb.net/db' }, /Atlas/],
    ['a remote host', { ...LOCAL_ENV, DB_LOCATION: 'mongodb://u:p@ac-1.mongodb.net:27017,localhost:27017/db' }, /ac-1\.mongodb\.net/],
    ['real S3', { DB_LOCATION: LOCAL_ENV.DB_LOCATION }, /S3_ENDPOINT is not set/],
    ['remote storage', { ...LOCAL_ENV, S3_ENDPOINT: 'https://s3.amazonaws.com' }, /s3\.amazonaws\.com/],
  ])('refuses %s', (_, env, message) => {
    expect(() => assertLocalTarget(env)).toThrow(message)
  })
})

describe('inline', () => {
  it('turns light markdown into Tiptap text nodes with marks', () => {
    expect(inline('a **b** *c* `d` [e](https://x.y)')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'd', marks: [{ type: 'code' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'e', marks: [{ type: 'link', attrs: { href: 'https://x.y', target: '_blank' } }] },
    ])
  })

  it('leaves plain text alone', () => {
    expect(inline('plain')).toEqual([{ type: 'text', text: 'plain' }])
  })
})

describe('bannerPng', () => {
  it('computes standard CRC-32 values', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('produces a valid PNG of the requested size', () => {
    const png = bannerPng('#000000', '#ffffff', 40, 20)
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(png.toString('ascii', 12, 16)).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(40)
    expect(png.readUInt32BE(20)).toBe(20)
    // Every chunk's CRC must match, or browsers reject the image.
    let offset = 8
    let pixels
    while (offset < png.length) {
      const length = png.readUInt32BE(offset)
      const typeAndData = png.subarray(offset + 4, offset + 8 + length)
      expect(png.readUInt32BE(offset + 8 + length)).toBe(crc32(typeAndData))
      if (typeAndData.toString('ascii', 0, 4) === 'IDAT') pixels = inflateSync(typeAndData.subarray(4))
      offset += 12 + length
    }
    expect(pixels.length).toBe((40 * 3 + 1) * 20)
  })
})

describe('seed data', () => {
  const usernames = new Set(USERS.map((u) => u.username))

  it('only references seeded users', () => {
    const referenced = [
      PUBLICATION.owner,
      ...ARTICLES.flatMap((a) => [a.author, ...a.likedBy, ...a.comments.flatMap((c) => [c.by, ...(c.replies || []).map((r) => r.by)])]),
      ...DRAFTS.map((d) => d.author),
      ...TEXT_POSTS.map((t) => t.author),
      ...FOLLOWS.flat(),
    ]
    expect(referenced.filter((name) => !usernames.has(name))).toEqual([])
  })

  it('passes the same checks the publish endpoint enforces', () => {
    for (const a of ARTICLES) {
      expect(a.des.length, a.title).toBeLessThanOrEqual(200)
      expect(a.tags.length, a.title).toBeGreaterThan(0)
      expect(a.tags.length, a.title).toBeLessThanOrEqual(10)
      expect(a.tags.every((t) => t === t.toLowerCase()), a.title).toBe(true)
      expect(a.content.content.length, a.title).toBeGreaterThan(0)
    }
  })

  it('has no self-likes, duplicate likes or duplicate follows', () => {
    for (const a of ARTICLES) {
      expect(a.likedBy, a.title).not.toContain(a.author)
      expect(new Set(a.likedBy).size, a.title).toBe(a.likedBy.length)
    }
    expect(new Set(FOLLOWS.map((f) => f.join('>'))).size).toBe(FOLLOWS.length)
    expect(FOLLOWS.filter(([a, b]) => a === b)).toEqual([])
  })

  it('gives every home page category chip at least one article', () => {
    const chips = ['ai', 'money', 'self growth', 'productivity', 'technology', 'life', 'fitness']
    const tags = new Set(ARTICLES.flatMap((a) => a.tags))
    expect(chips.filter((chip) => !tags.has(chip))).toEqual([])
  })
})

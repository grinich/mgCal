import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseVersion } from '../src/data/update'

describe('parseVersion', () => {
  it('accepts a leading v and ignores prerelease suffixes', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3])
  })

  it('falls back to zeros on junk rather than throwing', () => {
    expect(parseVersion('')).toEqual([0, 0, 0])
    expect(parseVersion('not-a-version')).toEqual([0, 0, 0])
  })
})

describe('isNewerVersion', () => {
  it('compares numerically, not lexically', () => {
    // The case a string compare gets wrong: "0.10.0" < "0.9.0" as text.
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true)
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false)
  })

  it('is false for equal versions, so no banner shows on the current build', () => {
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false)
  })

  it('respects precedence across all three components', () => {
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
    expect(isNewerVersion('0.2.1', '0.2.0')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.2.1')).toBe(false)
  })

  it('treats an unparseable release tag as not newer', () => {
    expect(isNewerVersion('garbage', '0.2.0')).toBe(false)
  })
})

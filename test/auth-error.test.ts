import { describe, expect, it } from 'vitest'
import { describeAuthError } from '../src/google/auth'

// The raw strings are what chrome.identity.getAuthToken actually rejects with;
// every one of them used to reach console.error and nothing else, which is why
// a failing Reconnect button looked like a dead button.
const ID = 'abcdefghijklmnopabcdefghijklmnop'
const msg = (raw: string) => describeAuthError(raw, ID)

describe('describeAuthError', () => {
  it('names the extension ID when the OAuth client does not match this build', () => {
    const m = msg("Error: OAuth2 request failed: Service responded with error: 'bad client id: 12345.apps.googleusercontent.com'")
    expect(m).toContain(ID)
    expect(m).toContain('set-client-id')
  })

  it('handles the other spelling of the same problem', () => {
    expect(msg('Invalid OAuth2 Client ID.')).toContain(ID)
  })

  it('points a revoked or unapproved grant at the Testing-mode test-user list', () => {
    expect(msg('OAuth2 not granted or revoked.')).toMatch(/Test users/)
    expect(msg("Service responded with error: 'access_denied'")).toMatch(/Test users/)
  })

  it('treats a closed consent window as retryable rather than broken', () => {
    expect(msg('The user did not approve access.')).toMatch(/closed before Google finished/)
  })

  it('separates a network failure from a config failure', () => {
    expect(msg('Authorization page could not be loaded.')).toMatch(/connection/)
  })

  it('tells a signed-out Chrome to sign in', () => {
    expect(msg('The user turned off browser signin')).toMatch(/Sign in to Chrome/)
  })

  it('explains a concurrent request instead of blaming the user', () => {
    expect(msg('Already has a pending sign-in request.')).toMatch(/already open/)
  })

  it('falls back to the raw reason, minus the Error prefix', () => {
    expect(msg('Error: something nobody mapped')).toBe('Reconnect failed: something nobody mapped')
  })
})

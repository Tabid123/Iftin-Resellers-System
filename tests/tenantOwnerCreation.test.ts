import { describe, expect, it } from 'vitest'
import { normalizeOwnerEmail, ownerCreationFailure } from '../supabase/functions/platform-create-tenant/owner'

describe('tenant owner creation', () => {
  it('returns a conflict, not 500, for the reported registered-email error', () => {
    const failure = ownerCreationFailure({ message: 'A user with this email address has already been registered', status: 422 })
    expect(failure.status).toBe(409)
    expect(failure.body.code).toBe('owner_email_exists')
  })

  it.each(['email_exists', 'user_already_exists'])('recognizes Supabase duplicate code %s', (code) => {
    expect(ownerCreationFailure({ code, message: 'Conflict' }).status).toBe(409)
  })

  it('does not misclassify unrelated server errors as duplicate emails', () => {
    expect(ownerCreationFailure({ message: 'Database unavailable', status: 500 }).status).toBe(500)
    expect(ownerCreationFailure({ message: 'Password too short', status: 422 }).status).toBe(400)
  })

  it('normalizes email casing and surrounding whitespace', () => {
    expect(normalizeOwnerEmail('  OWNER@EXAMPLE.COM  ')).toBe('owner@example.com')
  })
})
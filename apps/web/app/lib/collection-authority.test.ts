import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { isCollectionAuthorityRevoked } from './collection-authority'

describe('isCollectionAuthorityRevoked', () => {
  it.each([401, 403])('treats HTTP %s as an immediate authority revocation', status => {
    expect(isCollectionAuthorityRevoked(new ApiError(status, 'denied'))).toBe(true)
  })

  it.each([
    new ApiError(404, 'optional resource'),
    new ApiError(409, 'conflict'),
    new ApiError(500, 'server failed'),
    new TypeError('network failed'),
    null,
  ])('retains a resolved authority for ordinary refresh outcome %#', reason => {
    expect(isCollectionAuthorityRevoked(reason)).toBe(false)
  })
})

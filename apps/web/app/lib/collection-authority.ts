import { ApiError } from './api'

export function isCollectionAuthorityRevoked(reason: unknown): boolean {
  return reason instanceof ApiError && (reason.status === 401 || reason.status === 403)
}

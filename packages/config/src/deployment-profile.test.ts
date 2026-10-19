import { describe, expect, it } from 'vitest'
import { loadDeploymentProfile } from './deployment-profile.js'

const valid = {
  WORKMESH_DEPLOYMENT_PROFILE: 'personal', WORKMESH_QUEUE_BACKEND: 'redis',
  WORKMESH_ARTIFACT_BACKEND: 's3', WORKMESH_RUNNER_PLACEMENT: 'external',
  WORKMESH_API_REPLICAS: '1', WORKMESH_WORKER_REPLICAS: '1', WORKMESH_MCP_REPLICAS: '1',
  WORKMESH_BIND_ADDRESS: '127.0.0.1', WEB_ORIGIN: 'https://workmesh.test',
  PUBLIC_MCP_ORIGIN: 'https://mcp.workmesh.test', S3_PUBLIC_ENDPOINT: 'https://s3.workmesh.test',
  SESSION_COOKIE_SECURE: 'true', AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: '172.20.0.1/32',
}
describe('deployment profiles', () => {
  it.each(['personal', 'team', 'enterprise'])('checks %s without enabling additional capabilities', profile => {
    expect(loadDeploymentProfile({ ...valid, WORKMESH_DEPLOYMENT_PROFILE: profile,
      NODE_EXTRA_CA_CERTS: '/certificates/ca.pem' })?.WORKMESH_DEPLOYMENT_PROFILE).toBe(profile)
  })
  it('rejectUnsupportedBeforeSideEffect', () => {
    for (const bad of [{ WORKMESH_DEPLOYMENT_PROFILE: 'unknown' }, { WORKMESH_QUEUE_BACKEND: 'none' },
      { WORKMESH_ARTIFACT_BACKEND: 'filesystem' }, { WORKMESH_RUNNER_PLACEMENT: 'internal' }])
      expect(() => loadDeploymentProfile({ ...valid, ...bad })).toThrow('DEPLOYMENT_PROFILE_INVALID')
  })
  it('rejectReplicaOrStoreMismatch', () => {
    expect(() => loadDeploymentProfile({ ...valid, WORKMESH_API_REPLICAS: '2' })).toThrow('DEPLOYMENT_PROFILE_INVALID')
  })
  it('rejectUntrustedProxyAndMissingCa', () => {
    for (const bad of [{ AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: '0.0.0.0/0' },
      { WORKMESH_DEPLOYMENT_PROFILE: 'enterprise' }, { NODE_EXTRA_CA_CERTS: '/certificates/../key.pem' },
      { WEB_ORIGIN: 'http://workmesh.test' }])
      expect(() => loadDeploymentProfile({ ...valid, ...bad })).toThrow('DEPLOYMENT_PROFILE_INVALID')
  })
  it('preserves legacy deployments without declaring a new supported profile', () => {
    expect(loadDeploymentProfile({})).toBeUndefined()
  })
  it('does not disclose rejected secrets in diagnostics', () => {
    expect(() => loadDeploymentProfile({ ...valid, WORKMESH_QUEUE_BACKEND: 'sensitive-material' }))
      .toThrow('DEPLOYMENT_PROFILE_INVALID:WORKMESH_QUEUE_BACKEND')
  })
})

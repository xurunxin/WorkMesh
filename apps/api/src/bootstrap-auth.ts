import crypto from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Config } from '@workmesh/config'
import { DomainError } from '@workmesh/domain'
import { normalizeIp } from './auth-rate-limit/client-ip.js'

const bootstrapHeader = 'x-workmesh-bootstrap-token'
const verificationDomain = 'workmesh:bootstrap:request-verification:v1'
const bindingDomain = 'workmesh:bootstrap:credential-binding:v1'
const invalidCandidate = 'workmesh:bootstrap:invalid-candidate:v1'
const clientAddressHeaders = new Set([
  'forwarded',
  'client-ip',
  'true-client-ip',
  'x-client-ip',
  'x-real-ip',
  'cf-connecting-ip',
  'fly-client-ip',
  'fastly-client-ip',
  'x-envoy-external-address',
  'x-appengine-user-ip',
  'x-original-remote-addr',
])

export type BootstrapAuthorization = Readonly<{
  credentialBinding: string
  mode: 'token' | 'loopback'
}>

declare module 'fastify' {
  interface FastifyInstance {
    auditBootstrapSuccess(
      request: FastifyRequest,
      mode: BootstrapAuthorization['mode'],
    ): void
  }
  interface FastifyRequest {
    bootstrapAuthorization?: BootstrapAuthorization
  }
}

function bootstrapFailure(): DomainError {
  return new DomainError('BOOTSTRAP_AUTH_FAILED', 'Bootstrap authentication failed', {
    authorizationStage: 'identity',
    policyId: 'route.installWorkspace',
    suppressAuthorizationDenial: true,
    bootstrapAuthenticationFailure: true,
  })
}

function requestHeaderValues(request: FastifyRequest): string[] {
  const values: string[] = []
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === bootstrapHeader)
      values.push(request.raw.rawHeaders[index + 1] ?? '')
  }
  return values
}

function hasClientAddressHeaders(request: FastifyRequest): boolean {
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    const name = request.raw.rawHeaders[index]?.toLowerCase() ?? ''
    if (
      clientAddressHeaders.has(name)
      || name.includes('forwarded')
      || name.includes('client-ip')
    )
      return true
  }
  return false
}

function loopbackRequestAllowed(
  request: FastifyRequest,
  config: Config,
  headerValues: readonly string[],
): boolean {
  if (
    !config.bootstrapAllowLoopback
    || config.NODE_ENV === 'production'
    || config.WORKMESH_BOOTSTRAP_TOKEN
    || config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS.length
    || (config.API_HOST !== '127.0.0.1' && config.API_HOST !== '::1')
    || headerValues.length !== 0
    || hasClientAddressHeaders(request)
  ) return false
  const peer = normalizeIp(request.socket.remoteAddress)
  return peer === '::1' || /^127(?:\.\d{1,3}){3}$/.test(peer)
}

function verificationKey(config: Config): Buffer {
  return crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(`${verificationDomain}\0key`)
    .digest()
}

function verificationMac(key: Buffer, value: string): Buffer {
  return crypto
    .createHmac('sha256', key)
    .update(`${verificationDomain}\0candidate\0`)
    .update(value)
    .digest()
}

function credentialBinding(config: Config, token: string): string {
  return crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(`${bindingDomain}\0`)
    .update(token)
    .digest('base64url')
}

export function verifyBootstrapRequest(
  request: FastifyRequest,
  config: Config,
): BootstrapAuthorization {
  const values = requestHeaderValues(request)
  if (loopbackRequestAllowed(request, config, values)) {
    return Object.freeze({
      credentialBinding: crypto
        .createHmac('sha256', config.SESSION_SECRET)
        .update(`${bindingDomain}\0loopback`)
        .digest('base64url'),
      mode: 'loopback',
    })
  }

  const expectedToken = config.WORKMESH_BOOTSTRAP_TOKEN ?? invalidCandidate
  const structurallyValid = values.length === 1
    && /^[A-Za-z0-9_-]{43,342}$/.test(values[0] ?? '')
    && !values[0]!.includes(',')
  const candidate = structurallyValid ? values[0]! : invalidCandidate
  const key = verificationKey(config)
  const expectedMac = verificationMac(key, expectedToken)
  const candidateMac = verificationMac(key, candidate)
  const equal = crypto.timingSafeEqual(expectedMac, candidateMac)
  if (!structurallyValid || !config.WORKMESH_BOOTSTRAP_TOKEN || !equal)
    throw bootstrapFailure()

  return Object.freeze({
    credentialBinding: credentialBinding(config, expectedToken),
    mode: 'token',
  })
}

export function installBootstrapAuthentication(
  app: FastifyInstance,
  config: Config,
): void {
  const logAvailableAt = new Map<string, number>()
  const audit = (
    request: FastifyRequest,
    outcome: 'accepted' | 'rejected',
    mode?: BootstrapAuthorization['mode'],
  ) => {
    const key = `${outcome}:${mode ?? 'none'}`
    const now = Date.now()
    if ((logAvailableAt.get(key) ?? 0) > now) return
    logAvailableAt.set(key, now + 60_000)
    const fields = {
      event: outcome === 'accepted'
        ? 'bootstrap.install_authorized'
        : 'bootstrap.authentication_failed',
      operationId: 'installWorkspace',
      outcome,
      ...(mode ? { mode } : {}),
    }
    if (outcome === 'accepted')
      request.log.info(fields, 'Bootstrap installation authorized')
    else
      request.log.warn(fields, 'Bootstrap authentication rejected')
  }
  app.decorate('auditBootstrapSuccess', (
    request: FastifyRequest,
    mode: BootstrapAuthorization['mode'],
  ) => audit(request, 'accepted', mode))
  app.addHook('preHandler', async request => {
    if (request.routeOptions.url !== '/api/v1/auth/install') return
    try {
      request.bootstrapAuthorization = verifyBootstrapRequest(request, config)
    } catch (error) {
      audit(request, 'rejected')
      throw error
    }
  })
  app.addHook('onClose', async () => {
    logAvailableAt.clear()
  })
}

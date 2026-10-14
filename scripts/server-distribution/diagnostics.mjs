import { hash } from './manifest.mjs'

// Emit only fixed classifications and hashes. Docker stderr/argv may contain
// credentials, rendered configuration or untrusted application output.
export function commandFailure(error) {
  const stderr = Buffer.from(error.stderr ?? '')
  const body = stderr.toString('utf8')
  const groups = {
    imageMissing: ['No such image', 'Unable to find image'],
    daemonUnavailable: ['Cannot connect to the Docker daemon'],
    apiVersionMismatch: ['client version', 'minimum supported API version'],
    mountRejected: ['invalid mount config', 'bind source path does not exist'],
    entrypointRejected: ['exec format error', 'executable file not found', 'permission denied'],
    unhealthy: ['is unhealthy', 'unhealthy container', 'dependency failed to start'],
    healthTimeout: ['timeout waiting for containers', 'timed out'],
    networkUnavailable: ['network is unreachable'],
    runtimeConfigInvalid: ['DEPLOYMENT_PROFILE_INVALID', 'RUNTIME_SECRET_', 'Invalid configuration'],
    moduleMissing: ['Cannot find module', 'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'],
    addressInUse: ['EADDRINUSE'],
    connectionRefused: ['ECONNREFUSED'],
    certificateRejected: ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID'],
  }
  return {
    exitCode: Number.isInteger(error.status) ? error.status : null,
    timedOut: error.code === 'ETIMEDOUT',
    stderrSha256: hash(stderr),
    categories: Object.entries(groups).filter(([, needles]) => needles.some(text => body.includes(text))).map(([name]) => name),
    recoveryCodes: ['RECOVERY_DATABASE_LOCKED', 'RECOVERY_DATABASE_CLIENTS_ACTIVE', 'RECOVERY_MAINTENANCE_CONFIRMATION_REQUIRED',
      'RECOVERY_ARTIFACT_OBJECT_MISSING', 'RECOVERY_ARTIFACT_CHECKSUM_MISMATCH', 'RECOVERY_ARTIFACT_SIZE_MISMATCH',
      'RECOVERY_ARTIFACT_MIME_MISMATCH', 'RECOVERY_UPLOAD_OBJECT_MISSING', 'RECOVERY_UPLOAD_CHECKSUM_MISMATCH',
      'RECOVERY_UPLOAD_SIZE_MISMATCH', 'RECOVERY_ARCHIVE_OBJECT_VERSION_MISSING', 'RECOVERY_POSTGRES_TOOL_FAILED',
      'RECOVERY_POSTGRES_TOOL_START_FAILED', 'RECOVERY_POSTGRES_TOOL_INPUT_FAILED', 'RECOVERY_POSTGRES_TOOL_OUTPUT_FAILED',
      'WORKMESH_MASTER_KEY_INVALID', 'WORKMESH_BUILD_SHA_INVALID', 'EACCES', 'ENOENT', 'EEXIST', 'ENOSPC']
      .filter(code => new RegExp(`\\b${code}\\b`).test(body)),
    providerCodes: ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'NoSuchBucket', 'NoSuchKey',
      'NoSuchVersion', 'SlowDown', 'InternalError', 'InvalidRequest', 'InvalidBucketState', 'InvalidArgument',
      'MethodNotAllowed', 'NotImplemented'].filter(code => new RegExp(`\\b${code}\\b`).test(body)),
  }
}

export function containerStatus(info) {
  const state = info.State ?? {}
  const health = state.Health
  return {
    id: info.Id,
    service: ['api', 'worker', 'mcp', 'postgres', 'redis', 'minio', 'minio-init', 'migrate'].includes(info.Config?.Labels?.['com.docker.compose.service'])
      ? info.Config.Labels['com.docker.compose.service'] : 'unknown',
    status: ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(state.Status) ? state.Status : 'unknown',
    exitCode: state.ExitCode,
    oom: state.OOMKilled === true,
    restarts: info.RestartCount,
    health: ['starting', 'healthy', 'unhealthy'].includes(health?.Status) ? health.Status : null,
    probes: (health?.Log ?? []).slice(-3).map(probe => ({ exitCode: probe.ExitCode, outputSha256: hash(Buffer.from(probe.Output ?? '')) })),
  }
}

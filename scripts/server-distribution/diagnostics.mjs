import { hash } from './manifest.mjs'

// Emit only fixed classifications and hashes. Docker stderr/argv may contain
// credentials, rendered configuration or untrusted application output.
export function commandFailure(error) {
  const stderr = Buffer.from(error.stderr ?? '')
  const stdout = Buffer.from(error.stdout ?? '')
  const body = stderr.toString('utf8') + '\n' + stdout.toString('utf8')
  // Retain only known filenames and bounded numeric locations, never the path,
  // function arguments, error message or SQL text from a stack.
  const recoveryFrames = [...body.matchAll(/@workmesh\/recovery\/dist\/(src|scripts)\/(backup|restore|postgres|s3|crypto|manifest)\.js:(\d+)(?::(\d+))?/g)]
    .map(match => ({ file: `${match[1]}/${match[2]}.js`, line: Number(match[3]), column: Number(match[4] ?? 0) }))
    .filter(frame => frame.line > 0 && frame.line < 100_000 && frame.column < 100_000)
    .slice(0, 12)
  const databaseFrames = [...body.matchAll(/node_modules\/(pg\/lib\/(?:client|connection|query)|pg-pool\/index)\.js:(\d+):(\d+)/g)]
    .map(match => ({ file: `${match[1]}.js`, line: Number(match[2]), column: Number(match[3]) }))
    .filter(frame => frame.line > 0 && frame.line < 100_000 && frame.column < 100_000)
    .slice(0, 12)
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
    heapFailure: ['JavaScript heap out of memory', 'Reached heap limit', 'FATAL ERROR'],
    unhandledErrorEvent: ["Unhandled 'error' event"],
    unsettledAwait: ['Detected unsettled top-level await'],
    connectionTerminated: ['Connection terminated unexpectedly', 'Connection terminated', 'socket hang up'],
    readOnlyFilesystem: ['read-only file system', 'EROFS'],
    postgresAuthenticationRejected: ['password authentication failed'],
    postgresReferenceMissing: ['does not exist'],
    certificateRejected: ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID'],
  }
  return {
    exitCode: Number.isInteger(error.status) ? error.status : null,
    timedOut: error.code === 'ETIMEDOUT',
    stderrSha256: hash(stderr),
    stdoutSha256: hash(stdout),
    stderrBytes: stderr.length,
    stdoutBytes: stdout.length,
    errorTypes: ['Error', 'error', 'DatabaseError', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'AggregateError']
      .filter(name => new RegExp(`(?:^|\\n)${name}(?: \\[[A-Z0-9_]+\\])?:`).test(body)),
    recoveryFrames,
    databaseFrames,
    postgresCodes: ['57P01', '57P02', '57P03', '57P05', '08000', '08003', '08006', '08001', '08004', '08007', '08P01',
      '53300', '53400', '53200', '57014', '42501', '28P01', '42P01', '42703', '42883', 'P0001', '22000', '23505', '40001', '40P01']
      .filter(code => new RegExp(`["']?code["']?\\s*:\\s*["']${code}["']`).test(body)),
    categories: Object.entries(groups).filter(([, needles]) => needles.some(text => body.includes(text))).map(([name]) => name),
    recoveryCodes: ['RECOVERY_DATABASE_LOCKED', 'RECOVERY_DATABASE_CLIENTS_ACTIVE', 'RECOVERY_MAINTENANCE_CONFIRMATION_REQUIRED',
      'RECOVERY_ARTIFACT_OBJECT_MISSING', 'RECOVERY_ARTIFACT_CHECKSUM_MISMATCH', 'RECOVERY_ARTIFACT_SIZE_MISMATCH',
      'RECOVERY_ARTIFACT_MIME_MISMATCH', 'RECOVERY_UPLOAD_OBJECT_MISSING', 'RECOVERY_UPLOAD_CHECKSUM_MISMATCH',
      'RECOVERY_UPLOAD_SIZE_MISMATCH', 'RECOVERY_ARCHIVE_OBJECT_VERSION_MISSING', 'RECOVERY_POSTGRES_TOOL_FAILED',
      'RECOVERY_POSTGRES_TOOL_START_FAILED', 'RECOVERY_POSTGRES_TOOL_INPUT_FAILED', 'RECOVERY_POSTGRES_TOOL_OUTPUT_FAILED',
      'WORKMESH_MASTER_KEY_INVALID', 'WORKMESH_BUILD_SHA_INVALID', 'DATABASE_URL_REQUIRED', 'RECOVERY_S3_CONFIGURATION_REQUIRED',
      'WORKMESH_BACKUP_ENCRYPTION_KEY_REQUIRED', 'WORKMESH_BACKUP_ENCRYPTION_KEY_INVALID',
      'EACCES', 'ENOENT', 'EEXIST', 'ENOSPC', 'EROFS', 'EINVAL', 'ENOTDIR', 'EPERM', 'EIO',
      'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH',
      'ERR_UNSUPPORTED_DIR_IMPORT', 'ERR_UNKNOWN_FILE_EXTENSION', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_DESTROYED', 'ABORT_ERR']
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

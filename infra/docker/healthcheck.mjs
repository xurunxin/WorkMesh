const target = process.argv[2]
if (!target) process.exit(2)
let request
const finish = code => {
  clearTimeout(deadline)
  request?.destroy()
  process.exit(code)
}
// A probe needs only headers. Avoid fetch/Undici cold startup and explicitly
// exit so response bodies or keep-alive sockets cannot outlive a healthy probe.
// This deadline still includes DNS, connection and response-header waiting.
const deadline = setTimeout(() => finish(1), 2_000)
try {
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) finish(1)
  const transport = await import(url.protocol === 'https:' ? 'node:https' : 'node:http')
  request = transport.request(url, { method: 'GET', agent: false }, response => {
    finish(response.statusCode >= 200 && response.statusCode < 300 ? 0 : 1)
  })
  request.on('error', () => finish(1))
  request.end()
} catch {
  finish(1)
}

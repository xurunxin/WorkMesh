const target = process.argv[2]
if (!target) process.exit(2)
try {
  const response = await fetch(target, { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) process.exit(1)
} catch {
  process.exit(1)
}

import { spawn } from 'node:child_process'
const output=process.argv[2] ?? `workmesh-${new Date().toISOString().replaceAll(':','-')}.sql`; const child=spawn('pg_dump',[process.env.DATABASE_URL ?? '', '-f', output],{stdio:'inherit'}); child.on('exit', code => process.exitCode=code ?? 1)

export interface Logger { info(fields: Record<string, unknown>, message: string): void; error(fields: Record<string, unknown>, message: string): void }
export const logger: Logger = { info: (fields, message) => console.info(JSON.stringify({ level: 'info', message, ...fields })), error: (fields, message) => console.error(JSON.stringify({ level: 'error', message, ...fields })) }

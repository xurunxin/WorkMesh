import { expect, it } from 'vitest'
import { trustedPosixDirectory, trustedWindowsDescriptor } from './path-policy.js'

function descriptor(owner = 'S-1-5-21-1', trustee = 'S-1-1-0', mask = 0x1200a9, flags = 0): Buffer {
  const sid = (text: string) => {
    const parts = text.split('-').slice(2).map(Number), bytes = Buffer.alloc(8 + (parts.length - 1) * 4)
    bytes[0] = 1; bytes[1] = parts.length - 1; bytes.writeUIntBE(parts[0]!, 2, 6)
    parts.slice(1).forEach((part, i) => bytes.writeUInt32LE(part, 8 + i * 4)); return bytes
  }
  const ownerBytes = sid(owner), aceSid = sid(trustee), ace = Buffer.alloc(8 + aceSid.length)
  ace[1] = flags; ace.writeUInt16LE(ace.length, 2); ace.writeUInt32LE(mask, 4); aceSid.copy(ace, 8)
  const header = Buffer.alloc(20), dacl = Buffer.alloc(8)
  header[0] = 1; header.writeUInt16LE(0x8004, 2); header.writeUInt32LE(20, 4); header.writeUInt32LE(20 + ownerBytes.length, 16)
  dacl[0] = 2; dacl.writeUInt16LE(8 + ace.length, 2); dacl.writeUInt16LE(1, 4)
  return Buffer.concat([header, ownerBytes, dacl, ace])
}
it('Windows 信任 owner，拒绝所有普通用户的替换权限与 NULL DACL', () => {
  const current = 'S-1-5-21-1'
  trustedWindowsDescriptor(descriptor(), current)
  trustedWindowsDescriptor(descriptor(current, 'S-1-1-0', 4), current)
  trustedWindowsDescriptor(descriptor(current, 'S-1-1-0', 0x10000000, 8), current)
  trustedWindowsDescriptor(descriptor('S-1-5-18', 'S-1-5-32-544', 0x1f01ff), current)
  for (const right of [0x40, 0x10000, 0x40000, 0x80000, 0x10000000, 0x40000000]) {
    expect(() => trustedWindowsDescriptor(descriptor(current, 'S-1-1-0', right), current)).toThrow('CONNECTOR_UNSAFE_ANCESTOR')
  }
  expect(() => trustedWindowsDescriptor(descriptor('S-1-5-21-2'), current)).toThrow('CONNECTOR_UNSAFE_OWNER')
  const nullDacl = descriptor(); nullDacl.writeUInt32LE(0, 16)
  expect(() => trustedWindowsDescriptor(nullDacl, current)).toThrow()
})
it('POSIX 逐级验证 owner、非 sticky 写权限和 sticky 子项绑定', () => {
  trustedPosixDirectory(0, 0o40755, 501); trustedPosixDirectory(501, 0o40700, 501)
  trustedPosixDirectory(0, 0o41777, 501)
  expect(() => trustedPosixDirectory(502, 0o41777, 501)).toThrow('CONNECTOR_UNSAFE_OWNER')
  expect(() => trustedPosixDirectory(501, 0o40777, 501)).toThrow('CONNECTOR_UNSAFE_ANCESTOR')
  expect(() => trustedPosixDirectory(0, 0o40775, 501)).toThrow('CONNECTOR_UNSAFE_ANCESTOR')
})

import { requireThat } from './errors.js'

// 管理员/root 能控制进程和秘密后端，属于 OS 信任边界；普通其他用户不在其中。
export function trustedWindowsDescriptor(descriptor: Buffer, currentSid: string): void {
  const trusted = new Set([currentSid, 'S-1-5-18', 'S-1-5-32-544',
    'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'])
  const sid = (offset: number, limit = descriptor.length): string => {
    requireThat(offset >= 20 && offset + 8 <= limit && descriptor[offset] === 1, 'CONNECTOR_UNSAFE_ACL')
    const count = descriptor[offset + 1]!
    requireThat(offset + 8 + count * 4 <= limit, 'CONNECTOR_UNSAFE_ACL')
    const authority = descriptor.readUIntBE(offset + 2, 6)
    return `S-1-${authority}` + Array.from({ length: count }, (_, i) => `-${descriptor.readUInt32LE(offset + 8 + i * 4)}`).join('')
  }
  requireThat(descriptor.length >= 20 && (descriptor.readUInt16LE(2) & 0x8004) === 0x8004, 'CONNECTOR_UNSAFE_ACL')
  requireThat(trusted.has(sid(descriptor.readUInt32LE(4))), 'CONNECTOR_UNSAFE_OWNER')
  const dacl = descriptor.readUInt32LE(16)
  requireThat(dacl >= 20 && dacl + 8 <= descriptor.length, 'CONNECTOR_UNSAFE_ACL') // NULL DACL 允许所有访问。
  const end = dacl + descriptor.readUInt16LE(dacl + 2)
  requireThat(end <= descriptor.length, 'CONNECTOR_UNSAFE_ACL')
  let offset = dacl + 8
  for (let i = 0; i < descriptor.readUInt16LE(dacl + 4); i++) {
    requireThat(offset + 8 <= end, 'CONNECTOR_UNSAFE_ACL')
    const type = descriptor[offset]!, flags = descriptor[offset + 1]!, size = descriptor.readUInt16LE(offset + 2)
    requireThat(size >= 8 && offset + size <= end, 'CONNECTOR_UNSAFE_ACL')
    if ((flags & 8) === 0) { // INHERIT_ONLY ACE 不授予本目录权限。
      requireThat(type === 0 || type === 1, 'CONNECTOR_UNSAFE_ACL') // 无法解释的条件/object ACE 拒绝。
      if (type === 0) {
        const mask = descriptor.readUInt32LE(offset + 4)
        // DELETE、DELETE_CHILD、改 DACL/owner、GENERIC_ALL/WRITE 可破坏路径绑定。
        // ADD_FILE/ADD_SUBDIRECTORY 单独不授予删除现有受保护子项的权限。
        requireThat(trusted.has(sid(offset + 8, offset + size)) || (mask & 0x500d0040) === 0, 'CONNECTOR_UNSAFE_ANCESTOR')
      }
    }
    offset += size
  }
}

export function trustedPosixDirectory(uid: number, mode: number, currentUid: number): void {
  requireThat(uid === 0 || uid === currentUid, 'CONNECTOR_UNSAFE_OWNER')
  // sticky 祖先仅允许目录 owner/root/子项 owner 删除子项；每一子项也须有可信 owner。
  requireThat((mode & 0o022) === 0 || (mode & 0o1000) !== 0, 'CONNECTOR_UNSAFE_ANCESTOR')
}

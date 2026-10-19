"""Project Linux ELF64 core notes without exposing memory or process addresses."""
import struct


def _read(stream, offset, size, limit):
    if offset < 0 or size < 0 or size > 16 * 1024 * 1024 or offset + size > limit:
        raise ValueError('ELF metadata bounds invalid')
    stream.seek(offset)
    value = stream.read(size)
    if len(value) != size:
        raise ValueError('ELF metadata truncated')
    return value


def _headers(stream, kinds):
    size = stream.seek(0, 2)
    header = _read(stream, 0, 64, size)
    kind, machine = struct.unpack_from('<HH', header, 16)
    if header[:7] != b'\x7fELF\x02\x01\x01' or kind not in kinds or machine not in {62, 183}:
        raise ValueError('ELF metadata format unsupported')
    offset = struct.unpack_from('<Q', header, 32)[0]
    stride, count = struct.unpack_from('<HH', header, 54)
    if stride != 56 or not 0 < count < 65535:
        raise ValueError('ELF program header format unsupported')
    table = _read(stream, offset, stride * count, size)
    return machine, size, list(struct.iter_unpack('<IIQQQQQQ', table))


def _public_position(address, mappings, segments, binary_size):
    matches = [(start, pages, name) for start, end, pages, name in mappings if start <= address < end]
    if len(matches) != 1 or matches[0][2] != b'/usr/local/bin/node':
        return None
    start, pages, _ = matches[0]
    offset = pages[0] * pages[1] + address - start
    addresses = [virtual + offset - source for kind, flags, source, virtual, _, length, _, _ in segments
                 if kind == 1 and flags & 1 and source <= offset < source + length <= binary_size]
    return addresses[0] if len(addresses) == 1 else None


def _public_frame_chain(core, size, headers, sp, fp, mappings, segments, binary_size):
    # Only conventional frame links in the captured, writable stack are read.
    # No stack scanning, arguments, registers, mapped paths or ASLR values leave
    # this function. Omitted/invalid frame pointers end this partial observation.
    frames = []
    result = {'method': 'frame-pointers', 'frames': frames, 'stopped': 'stack-unavailable'}
    stacks = [(offset, virtual, length, memory) for kind, flags, offset, virtual, _, length, memory, _ in headers
              if kind == 1 and flags & 6 == 6 and not flags & 1 and virtual <= sp < virtual + memory]
    if len(stacks) != 1:
        return result
    offset, start, length, memory = stacks[0]
    for _ in range(12):
        if not sp <= fp <= sp + 1024 * 1024 or fp % 16 or fp + 16 > start + memory:
            result['stopped'] = 'frame-link-invalid'
            return result
        if fp + 16 > start + length:
            result['stopped'] = 'stack-bytes-not-captured'
            return result
        try:
            following, return_address = struct.unpack('<QQ', _read(core, offset + fp - start, 16, size))
        except ValueError:
            result['stopped'] = 'stack-bytes-not-captured'
            return result
        if not fp + 16 <= following <= min(sp + 1024 * 1024, start + memory - 16) or following % 16:
            result['stopped'] = 'frame-link-invalid'
            return result
        # Return addresses designate the following instruction. Attribute the
        # public caller using its preceding byte, never guess a JIT/private frame.
        address = _public_position(return_address - 1, mappings, segments, binary_size)
        if address is None:
            result['stopped'] = 'caller-outside-public-node'
            return result
        frames.append({'lookupNodeElfAddress': address, 'returnSiteNodeElfAddress': address + 1})
        fp = following
    result['stopped'] = 'depth-limit'
    return result


def core_location(core, executable):
    # Linux v6.8 elfcore.h, x86 user_64.h, arm64 ptrace.h and binfmt_elf.c:
    # the dumper's NT_PRSTATUS is first; its ELF64 common prefix is 112 bytes.
    machine, size, headers = _headers(core, {4})
    pc = sp = fp = signal = signal_code = current_signal = None
    files = None
    total = 0
    for kind, _, offset, _, _, length, _, _ in headers:
        if kind != 4:
            continue
        total += length
        if total > 16 * 1024 * 1024:
            raise ValueError('ELF note budget exceeded')
        notes = _read(core, offset, length, size)
        cursor = 0
        while cursor < len(notes):
            if cursor + 12 > len(notes):
                raise ValueError('ELF note header truncated')
            names, desc_size, tag = struct.unpack_from('<III', notes, cursor)
            name_start = cursor + 12
            desc_start = name_start + ((names + 3) & ~3)
            end = desc_start + desc_size
            following = desc_start + ((desc_size + 3) & ~3)
            if names > 256 or following > len(notes):
                raise ValueError('ELF note payload truncated')
            name = notes[name_start:name_start + names].rstrip(b'\0')
            desc = notes[desc_start:end]
            cursor = following
            if name != b'CORE':
                continue
            if tag == 1 and pc is None:
                if len(desc) < (336 if machine == 62 else 392):
                    raise ValueError('ELF process status truncated')
                current_signal = struct.unpack_from('<h', desc, 12)[0]
                pc = struct.unpack_from('<Q', desc, 112 + (16 if machine == 62 else 32) * 8)[0]
                sp = struct.unpack_from('<Q', desc, 112 + (19 if machine == 62 else 31) * 8)[0]
                fp = struct.unpack_from('<Q', desc, 112 + (4 if machine == 62 else 29) * 8)[0]
            elif tag == 0x53494749 and signal is None:
                if len(desc) < 12:
                    raise ValueError('ELF signal information truncated')
                signal, _, signal_code = struct.unpack_from('<iii', desc)
            elif tag == 0x46494c45 and files is None:
                files = desc
    if pc is None or signal is None or signal != current_signal or not 1 <= signal <= 64:
        raise ValueError('ELF crash identity unavailable')
    result = {'architecture': 'amd64' if machine == 62 else 'arm64', 'signal': signal,
              'signalCode': signal_code if -128 <= signal_code <= 128 else None,
              'faultModule': 'other-or-unmapped'}
    if files is None:
        return result
    if len(files) < 16:
        raise ValueError('ELF mapped files truncated')
    count, page_size = struct.unpack_from('<QQ', files)
    table_end = 16 + 24 * count
    if count > 8192 or page_size < 4096 or page_size > 65536 or page_size & (page_size - 1) or table_end > len(files):
        raise ValueError('ELF mapped file bounds invalid')
    names = files[table_end:].split(b'\0')
    if len(names) != count + 1 or names[-1] != b'':
        raise ValueError('ELF mapped file names invalid')
    matches = [(start, page_offset, names[index]) for index, (start, end, page_offset) in
               enumerate(struct.iter_unpack('<QQQ', files[16:table_end])) if start <= pc < end]
    if len(matches) > 1:
        raise ValueError('ELF instruction mapping ambiguous')
    if not matches or matches[0][2] != b'/usr/local/bin/node':
        return result
    start, pages, _ = matches[0]
    file_offset = pages * page_size + pc - start
    binary_machine, binary_size, segments = _headers(executable, {2, 3})
    if binary_machine != machine:
        raise ValueError('ELF executable architecture mismatch')
    addresses = [virtual + file_offset - offset for kind, flags, offset, virtual, _, length, _, _ in segments
                 if kind == 1 and flags & 1 and offset <= file_offset < offset + length <= binary_size]
    result['faultModule'] = 'node'
    result['executableSegment'] = len(addresses) == 1
    if len(addresses) == 1:
        # Both numbers refer to the public, separately checksummed binary.
        # Never export the ASLR address, registers, mapped paths or note bytes.
        result.update(nodeFileOffset=file_offset, nodeElfAddress=addresses[0])
        mappings = [(begin, end, (pages, page_size), names[index]) for index, (begin, end, pages) in
                    enumerate(struct.iter_unpack('<QQQ', files[16:table_end]))]
        result['publicFrameChain'] = _public_frame_chain(core, size, headers, sp, fp, mappings, segments, binary_size)
    return result

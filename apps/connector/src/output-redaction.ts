type Part = { text: string; control: boolean }

// 独立匹配原始字节，不让 ANSI 的结束字节分类吞掉凭据前缀。
function redactRawOutput(write: (text: string) => void) {
  let pending = ''
  const prefix = /(?:w(?:m(?:[ip](?:_[A-Za-z0-9_-]{0,42})?)?)?)$/
  return {
    push(text: string) {
      pending = (pending + text).replace(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/g, '[已隐藏]')
      const suffix = prefix.exec(pending)?.[0] ?? ''
      write(pending.slice(0, pending.length - suffix.length)); pending = suffix
    },
    finish() { write(/^(?:wmi_|wmp_)/.test(pending) ? '[已隐藏]' : pending); pending = '' },
  }
}

export function redactChildOutput(write: (text: string) => void, depth = 0) {
  // 输入原字节、ANSI 可见字符、变换后的输出原字节均独立防护。
  const rawOutput = redactRawOutput(write)
  const terminal = redactTerminalOutput(text => rawOutput.push(text), depth)
  const rawInput = redactRawOutput(text => terminal.push(text))
  return {
    push(text: string) { rawInput.push(text) },
    finish() { rawInput.finish(); terminal.finish(); rawOutput.finish() },
  }
}

// ANSI 控制序列不打断可见凭据；候选字符和夹在其中的控制序列一起暂存。
// OSC/DCS 等控制载荷也独立脱敏，不能把秘密转移到终端标题或日志。
function redactTerminalOutput(write: (text: string) => void, depth: number) {
  let parts: Part[] = [], visible = '', control = '', state: 'text' | 'escape' | 'csi' | 'string' | 'string-escape' = 'text'
  let oversized = false, output = ''
  const prefix = /(?:w(?:m(?:[ip](?:_[A-Za-z0-9_-]{0,42})?)?)?)$/
  const flush = () => { if (output) write(output); output = '' }
  function accept(text: string, isControl: boolean) {
    parts.push({ text, control: isControl })
    if (!isControl) visible += text
    if (/^(?:wmi_|wmp_)[A-Za-z0-9_-]{43}$/.test(visible)) {
      output += '[已隐藏]' + parts.filter(part => part.control).map(part => part.text).join('')
      parts = []; visible = ''; return
    }
    const suffix = prefix.exec(visible)?.[0] ?? ''
    let emit = visible.length - suffix.length
    while (parts.length && (emit > 0 || !suffix)) {
      const part = parts.shift()!; output += part.text
      if (!part.control) emit--
    }
    visible = suffix
    // 连续控制序列不能令候选区无限增长；只释放控制字节，秘密字符继续保留。
    if (parts.reduce((length, part) => length + part.text.length, 0) > 4096) {
      output += parts.filter(part => part.control).map(part => part.text).join('')
      parts = parts.filter(part => !part.control)
    }
  }
  function completeControl() {
    let safe = control
    if (oversized || depth >= 8) safe = '[控制序列已隐藏]'
    else if (/^(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])/.test(control)) {
      const start = control[0] === '\x1b' ? 2 : 1
      const end = control.endsWith('\x1b\\') ? 2 : 1
      let payload = ''; const sink = redactChildOutput(text => { payload += text }, depth + 1)
      sink.push(control.slice(start, -end)); sink.finish()
      safe = control.slice(0, start) + payload + control.slice(-end)
    }
    // 控制结束字节 w 也可能是原字节凭据的起点；保留它参与后续 ANSI 跨块匹配。
    if (safe.endsWith('w')) { accept(safe.slice(0, -1), true); accept('w', false) }
    else accept(safe, true)
    control = ''; state = 'text'; oversized = false
  }
  return {
    push(text: string) {
      for (const char of text) {
        if (state === 'text') {
          if (char === '\x1b' || /[\x90\x98\x9b\x9d-\x9f]/.test(char)) {
            control = char
            state = char === '\x1b' ? 'escape' : char === '\x9b' ? 'csi' : 'string'
          } else accept(char, char === '\x07' || /[\x80-\x9f]/.test(char))
          continue
        }
        if (!oversized) control += char
        if (control.length > 4096) { oversized = true; control = '' }
        if (state === 'escape') {
          if (char === '[') state = 'csi'
          else if (']PX^_'.includes(char)) state = 'string'
          else if (/[\x30-\x7e]/.test(char)) completeControl()
        } else if (state === 'csi') {
          if (/[\x40-\x7e]/.test(char)) completeControl()
        } else if (char === '\x07' || char === '\x9c' || state === 'string-escape' && char === '\\') completeControl()
        else state = char === '\x1b' ? 'string-escape' : 'string'
      }
      flush()
    },
    finish() {
      // 未完成控制序列可能隐藏载荷；退出时不原样释放。
      if (control || oversized) output += '[控制序列已隐藏]'
      output += /^(?:wmi_|wmp_)/.test(visible) ? '[已隐藏]' + parts.filter(part => part.control).map(part => part.text).join('') : parts.map(part => part.text).join('')
      parts = []; visible = ''; control = ''; state = 'text'; oversized = false; flush()
    },
  }
}

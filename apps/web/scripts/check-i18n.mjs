import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

/** @typedef {{ kind: 'string' } | { kind: 'function' } | { kind: 'object', properties: Record<string, CopyContract> }} CopyContract */
/** @typedef {{ path: string, text: string }} SourceDescriptor */
/** @typedef {{ severity: 'error', code: string, path: string, line: number, column: number, message: string }} I18nDiagnostic */

export const PRODUCTION_LOCALE_TABLE_INVENTORY = Object.freeze([
  'messages',
  'toastCopies',
  'guidanceCopies',
  'issueCopies',
  'surfaceCopies',
  'detailCopies',
  'settingsCopies',
  'loginCopies',
  'installCopies',
  'operationsCopies',
  'connectCopies',
  'agentsCopies',
  'inboxCopies',
  'sessionDetailCopies',
  'agentWorkCopies',
  'relationsCopies',
  'evidenceCopies',
  'projectDeliveryHealthLabels',
  'workRoomCopies',
  'humanControlPlaneCopies',
])

export const PRODUCTION_PARTIAL_OMISSION_ALLOWLIST = Object.freeze([])
export const PRODUCTION_HARDCODED_COPY_ALLOWLIST = Object.freeze([
  // Stable version, unit, language-code, algorithm, provider-reference, and keyboard tokens.
  { path: 'apps/web/app/agent-session-detail.tsx', kind: 'jsx-text', literal: 'v' },
  { path: 'apps/web/app/agent-session-detail.tsx', kind: 'jsx-text', literal: 'v' },
  { path: 'apps/web/app/agents/agent-registry-card.tsx', kind: 'jsx-text', literal: 's' },
  { path: 'apps/web/app/lib/i18n.tsx', kind: 'jsx-text', literal: '中' },
  { path: 'apps/web/app/lib/i18n.tsx', kind: 'jsx-text', literal: 'EN' },
  { path: 'apps/web/app/page.tsx', kind: 'jsx-text', literal: 'v' },
  { path: 'apps/web/app/page.tsx', kind: 'jsx-text', literal: 'SHA-256' },
  { path: 'apps/web/app/project-delivery.tsx', kind: 'jsx-text', literal: 'PR #' },
  { path: 'apps/web/app/project-delivery.tsx', kind: 'jsx-text', literal: '· PR #' },
  { path: 'apps/web/app/work-room.tsx', kind: 'jsx-text', literal: '${…}s' },
  { path: 'apps/web/features/command-center/command-center.tsx', kind: 'jsx-text', literal: 'Ctrl K' },

  // Internal design sandboxes are intentionally outside the production localization scope.
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'jsx-text', literal: 'Issues 视觉与交互迭代 · Round 6' },
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'jsx-text', literal: '本页面是内部预览，看板视图演示：双向滚动 / 拖动平移 / 每列宽度可调 / Ready=蓝 In Progress=黄 In Review=绿 / Linear 风格标签溢出。生产导航中未链接。' },
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'aria-label', literal: '视图切换' },
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'jsx-text', literal: '列表' },
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'jsx-text', literal: '看板' },
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'jsx-text', literal: '1. 列表视图' },
  { path: 'apps/web/app/preview-issues/page.tsx', kind: 'jsx-text', literal: '2. 看板视图（拖动空白处平移 / 列右边把手调整宽度）' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: 'Round 2 视觉验收预览' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '本页面是内部预览，展示新设计的 Settings tabs、Team access chips、Session 卡片。生产导航中未链接。' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '1. Settings 页 tabs（工作区 / 运营与规划）' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'aria-label', literal: '设置分区' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '工作区' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '团队、工作流状态与权限' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '运营与规划' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '周期、自动化与运行历史' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '2. 智能体团队访问（chip + 视图切换）' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '已启用' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'aria-label', literal: '能力视图' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '已申请' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '已批准' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'aria-label', literal: '已批准' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '已批准 ${…}' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '已选' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '项 · 点击 chip 进行切换；点击「保存」写入授权。' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '更新授权' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '撤销' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '3. Sessions 卡片列表' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: 'Session' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: 'Issue' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '无 Issue' },
  { path: 'apps/web/app/preview-round2/page.tsx', kind: 'jsx-text', literal: '心跳' },
])

const importedCopyContractNames = Object.freeze([
  'WorkItemCopy',
  'WorkSurfaceCopy',
  'WorkItemDetailCopy',
])

const uiFacingAttributes = new Set(['aria-label', 'title', 'placeholder', 'alt'])
const ignoredProductionFilePattern = /(?:^|\/)(?:__tests__|e2e)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i
const supportedSourcePattern = /\.[cm]?[jt]sx?$/i

function posixPath(value) {
  return value.replaceAll('\\', '/')
}

function canonicalPath(value) {
  const normalized = resolve(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function normalizedDisplayPath(filePath, repoRoot) {
  const absolute = resolve(filePath)
  if (repoRoot) {
    const candidate = relative(resolve(repoRoot), absolute)
    if (candidate && candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)) {
      return posixPath(candidate)
    }
    if (candidate === '') return '.'
  }
  return posixPath(filePath)
}

function normalizeSource(input, fallbackPath, baseDir) {
  if (typeof input === 'string') {
    return { path: resolve(baseDir, fallbackPath), text: input }
  }
  if (!input || typeof input !== 'object' || typeof input.path !== 'string') {
    throw new TypeError(`Invalid source descriptor for ${fallbackPath}`)
  }
  const text = typeof input.text === 'string'
    ? input.text
    : typeof input.sourceText === 'string'
      ? input.sourceText
      : undefined
  if (text === undefined) throw new TypeError(`Source descriptor ${input.path} has no text`)
  return { path: isAbsolute(input.path) ? resolve(input.path) : resolve(baseDir, input.path), text }
}

function normalizeComponentSources(componentSources, baseDir) {
  if (Array.isArray(componentSources)) {
    return componentSources.map((source, index) => normalizeSource(source, `component-${index}.tsx`, baseDir))
  }
  if (componentSources && typeof componentSources === 'object') {
    return Object.entries(componentSources).map(([filePath, text]) => normalizeSource({ path: filePath, text }, filePath, baseDir))
  }
  throw new TypeError('componentSources must be an array or a path-to-source object')
}

function normalizeContract(contract, trail = 'contract') {
  if (contract === 'string' || contract === 'function') return { kind: contract }
  if (!contract || typeof contract !== 'object') throw new TypeError(`${trail} is not a Copy contract`)
  if (contract.kind === 'string' || contract.kind === 'function') return { kind: contract.kind }
  const rawProperties = contract.kind === 'object' ? contract.properties : contract
  if (!rawProperties || typeof rawProperties !== 'object' || Array.isArray(rawProperties)) {
    throw new TypeError(`${trail} has no object properties`)
  }
  return {
    kind: 'object',
    properties: Object.fromEntries(
      Object.entries(rawProperties).map(([key, value]) => [key, normalizeContract(value, `${trail}.${key}`)]),
    ),
  }
}

function normalizeContracts(copyContracts) {
  if (!copyContracts || typeof copyContracts !== 'object' || Array.isArray(copyContracts)) return {}
  return Object.fromEntries(
    Object.entries(copyContracts).map(([name, contract]) => [name, normalizeContract(contract, name)]),
  )
}

function createProgramForSources(sources, compilerOptions = {}) {
  const sourceByCanonicalPath = new Map(sources.map(source => [canonicalPath(source.path), source]))
  const virtualDirectories = new Set()
  for (const source of sources) {
    let current = dirname(resolve(source.path))
    while (current !== dirname(current)) {
      virtualDirectories.add(canonicalPath(current))
      current = dirname(current)
    }
    virtualDirectories.add(canonicalPath(current))
  }
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: false,
    skipLibCheck: true,
    noEmit: true,
    ...compilerOptions,
  }
  const defaultHost = ts.createCompilerHost(options, true)
  const originalFileExists = defaultHost.fileExists.bind(defaultHost)
  const originalReadFile = defaultHost.readFile.bind(defaultHost)
  const originalGetSourceFile = defaultHost.getSourceFile.bind(defaultHost)
  const originalDirectoryExists = defaultHost.directoryExists?.bind(defaultHost)
  const originalGetDirectories = defaultHost.getDirectories?.bind(defaultHost)
  defaultHost.fileExists = fileName => sourceByCanonicalPath.has(canonicalPath(fileName)) || originalFileExists(fileName)
  defaultHost.readFile = fileName => sourceByCanonicalPath.get(canonicalPath(fileName))?.text ?? originalReadFile(fileName)
  defaultHost.directoryExists = directoryName => virtualDirectories.has(canonicalPath(directoryName)) || originalDirectoryExists?.(directoryName) === true
  defaultHost.getDirectories = directoryName => {
    const diskDirectories = originalGetDirectories?.(directoryName) ?? []
    const virtualChildren = [...virtualDirectories]
      .map(directory => resolve(directory))
      .filter(directory => dirname(directory) === resolve(directoryName))
      .map(directory => directory.slice(dirname(directory).length + 1))
    return [...new Set([...diskDirectories, ...virtualChildren])]
  }
  defaultHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = sourceByCanonicalPath.get(canonicalPath(fileName))
    if (!source) return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
    return ts.createSourceFile(fileName, source.text, languageVersion, true, ts.getScriptKindFromFileName(fileName))
  }
  const program = ts.createProgram({
    rootNames: sources.map(source => source.path),
    options,
    host: defaultHost,
  })
  return { program, sourceByCanonicalPath }
}

function sourceName(node) {
  return node.getSourceFile().fileName
}

function staticPropertyName(name) {
  if (ts.isComputedPropertyName(name)) return undefined
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function typeReferenceName(node) {
  if (!ts.isTypeReferenceNode(node)) return undefined
  if (ts.isIdentifier(node.typeName)) return node.typeName.text
  return node.typeName.right.text
}

function unwrapTypeNode(node) {
  let current = node
  let partial = false
  while (ts.isTypeReferenceNode(current)) {
    const name = typeReferenceName(current)
    if (name === 'Readonly' && current.typeArguments?.length === 1) {
      current = current.typeArguments[0]
      continue
    }
    if (name === 'Partial' && current.typeArguments?.length === 1) {
      partial = true
      current = current.typeArguments[0]
      continue
    }
    break
  }
  return { node: current, partial }
}

function recordLocaleValueType(node) {
  const unwrapped = unwrapTypeNode(node).node
  if (!ts.isTypeReferenceNode(unwrapped) || typeReferenceName(unwrapped) !== 'Record' || unwrapped.typeArguments?.length !== 2) {
    return undefined
  }
  const localeType = unwrapTypeNode(unwrapped.typeArguments[0]).node
  if (!ts.isTypeReferenceNode(localeType) || typeReferenceName(localeType) !== 'Locale') return undefined
  return unwrapped.typeArguments[1]
}

function stripUndefined(checker, type) {
  if (!type.isUnion()) return type
  const retained = type.types.filter(member => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)))
  return retained.length === 1 ? retained[0] : type
}

function contractFromType(checker, type, location, seen = new Set()) {
  const normalized = stripUndefined(checker, type)
  if (normalized.flags & ts.TypeFlags.StringLike) return { kind: 'string' }
  if (normalized.isUnion() && normalized.types.every(member => Boolean(member.flags & ts.TypeFlags.StringLike))) {
    return { kind: 'string' }
  }
  if (checker.getSignaturesOfType(normalized, ts.SignatureKind.Call).length > 0) return { kind: 'function' }
  const resolvedProperties = checker.getPropertiesOfType(normalized)
  if (!(normalized.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) && resolvedProperties.length === 0) return undefined
  const typeId = normalized.id
  if (seen.has(typeId)) return undefined
  seen.add(typeId)
  const properties = {}
  for (const property of resolvedProperties) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? location
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration)
    const child = contractFromType(checker, propertyType, declaration, seen)
    if (!child) return undefined
    properties[property.getName()] = child
  }
  seen.delete(typeId)
  return { kind: 'object', properties }
}

function contractForTypeNode(checker, node, copyContracts) {
  const { node: contractNode, partial } = unwrapTypeNode(node)
  const referenceName = typeReferenceName(contractNode)
  const supplied = referenceName ? copyContracts[referenceName] : undefined
  if (supplied) return { contract: supplied, partial, referenceName }
  const type = checker.getTypeFromTypeNode(contractNode)
  return { contract: contractFromType(checker, type, contractNode), partial, referenceName }
}

function localeUnionValues(checker, sourceFile) {
  const declaration = sourceFile.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Locale')
  if (!declaration || !ts.isTypeAliasDeclaration(declaration)) return []
  const type = checker.getTypeAtLocation(declaration.name)
  const members = type.isUnion() ? type.types : [type]
  return members.flatMap(member => member.isStringLiteral() ? [member.value] : [])
}

function translationKeyValues(checker, sourceFile) {
  const declaration = sourceFile.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'TranslationKey')
  if (!declaration || !ts.isTypeAliasDeclaration(declaration)) return []
  const type = checker.getTypeAtLocation(declaration.name)
  const members = type.isUnion() ? type.types : [type]
  return members.flatMap(member => member.isStringLiteral() ? [member.value] : [])
}

function isFunctionExpression(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

function isStaticString(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function normalizedLiteral(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function literalContainsWords(value) {
  return /[\p{L}\p{Script=Han}]/u.test(value)
}

function jsxTagName(node) {
  let current = node.parent
  while (current) {
    if (ts.isJsxElement(current)) {
      return ts.isIdentifier(current.openingElement.tagName) ? current.openingElement.tagName.text.toLowerCase() : undefined
    }
    if (ts.isJsxSelfClosingElement(current)) {
      return ts.isIdentifier(current.tagName) ? current.tagName.text.toLowerCase() : undefined
    }
    if (ts.isSourceFile(current)) return undefined
    current = current.parent
  }
  return undefined
}

function isStructurallyNonCopyLiteral(value, node) {
  if (!literalContainsWords(value)) return true
  if (/^(?:https?:\/\/|mailto:|tel:|\/[^\s]*)$/i.test(value)) return true
  const tagName = jsxTagName(node)
  if (tagName === 'style' || tagName === 'script') return true
  if ((tagName === 'code' || tagName === 'pre' || tagName === 'kbd') && /^(?:[A-Za-z0-9_./:@{}[\]-]+|(?:GET|POST|PUT|PATCH|DELETE))$/.test(value)) {
    return true
  }
  return false
}

function isMachineFormatPlaceholder(node) {
  let attribute = node.parent
  while (attribute && !ts.isJsxAttribute(attribute) && !ts.isSourceFile(attribute)) attribute = attribute.parent
  if (!attribute || !ts.isJsxAttribute(attribute)) return false
  const attributes = attribute.parent
  if (!ts.isJsxAttributes(attributes)) return false
  return attributes.properties.some(property => ts.isJsxAttribute(property) && property.name.text === 'pattern')
}

function staticUiExpressionValues(node) {
  if (isStaticString(node)) return [{ node, value: node.text }]
  if (ts.isTemplateExpression(node)) {
    const rendered = `${node.head.text}${node.templateSpans.map(span => `\${…}${span.literal.text}`).join('')}`
    return [{ node, value: rendered }]
  }
  if (ts.isParenthesizedExpression(node)) return staticUiExpressionValues(node.expression)
  if (ts.isConditionalExpression(node)) {
    return [...staticUiExpressionValues(node.whenTrue), ...staticUiExpressionValues(node.whenFalse)]
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...staticUiExpressionValues(node.left), ...staticUiExpressionValues(node.right)]
  }
  return []
}

function isProductionUiSource(displayPath) {
  const normalized = posixPath(displayPath)
  return !ignoredProductionFilePattern.test(normalized)
    && supportedSourcePattern.test(normalized)
    && (normalized.includes('/app/') || normalized.startsWith('apps/web/app/') || normalized.includes('/features/') || normalized.startsWith('apps/web/features/'))
}

function translatorParameterKeys(checker, call) {
  const signature = checker.getResolvedSignature(call)
  const parameter = signature?.getParameters()[0]
  if (!parameter) return undefined
  const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? call.expression
  const type = stripUndefined(checker, checker.getTypeOfSymbolAtLocation(parameter, declaration))
  const members = type.isUnion() ? type.types : [type]
  if (!members.length || !members.every(member => member.isStringLiteral())) return undefined
  return new Set(members.map(member => member.value))
}

function parseExactAllowlist(entries, requiredKeys, label) {
  if (!Array.isArray(entries)) throw new TypeError(`${label} must be an array`)
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new TypeError(`${label}[${index}] must be an object`)
    const normalized = {}
    for (const key of requiredKeys) {
      if (typeof entry[key] !== 'string' || !entry[key]) throw new TypeError(`${label}[${index}].${key} must be a non-empty string`)
      normalized[key] = key === 'path' ? posixPath(entry[key]) : entry[key]
    }
    if (Object.keys(entry).some(key => !requiredKeys.includes(key))) throw new TypeError(`${label}[${index}] has unsupported fields`)
    return normalized
  })
}

/**
 * Pure source checker used by both fixtures and the CLI adapter.
 *
 * @param {{
 *   i18nSource: string | { path: string, text?: string, sourceText?: string },
 *   componentSources: Array<string | { path: string, text?: string, sourceText?: string }> | Record<string, string>,
 *   copyContracts?: Record<string, CopyContract | Record<string, CopyContract | string> | string>,
 *   partialOmissionAllowlist?: Array<{ table: string, key: string }>,
 *   hardcodedCopyAllowlist?: Array<{ path: string, kind: string, literal: string }>,
 *   localeTableInventory?: readonly string[],
 *   compilerOptions?: ts.CompilerOptions,
 *   repoRoot?: string,
 * }} input
 * @returns {{ ok: boolean, exitCode: 0 | 1, diagnostics: I18nDiagnostic[] }}
 */
export function checkSources(input) {
  const baseDir = input.repoRoot ? resolve(input.repoRoot) : process.cwd()
  const i18nSource = normalizeSource(input.i18nSource, 'apps/web/app/lib/i18n.tsx', baseDir)
  const componentSources = normalizeComponentSources(input.componentSources, baseDir)
    .filter(source => canonicalPath(source.path) !== canonicalPath(i18nSource.path))
  const allSources = [i18nSource, ...componentSources]
  const displayPathByCanonical = new Map(allSources.map(source => [canonicalPath(source.path), normalizedDisplayPath(source.path, input.repoRoot)]))
  const copyContracts = normalizeContracts(input.copyContracts)
  const inventory = [...(input.localeTableInventory ?? PRODUCTION_LOCALE_TABLE_INVENTORY)]
  const inventorySet = new Set(inventory)
  const partialAllowlist = parseExactAllowlist(input.partialOmissionAllowlist ?? PRODUCTION_PARTIAL_OMISSION_ALLOWLIST, ['table', 'key'], 'partialOmissionAllowlist')
  const hardcodedAllowlist = parseExactAllowlist(input.hardcodedCopyAllowlist ?? PRODUCTION_HARDCODED_COPY_ALLOWLIST, ['path', 'kind', 'literal'], 'hardcodedCopyAllowlist')
  const usedPartialAllowlist = new Set()
  const usedHardcodedAllowlist = new Set()
  const diagnostics = []
  const { program } = createProgramForSources(allSources, input.compilerOptions)
  const checker = program.getTypeChecker()
  const i18nFile = program.getSourceFile(i18nSource.path)
  if (!i18nFile) throw new Error(`Unable to create TypeScript source file for ${i18nSource.path}`)

  const addDiagnostic = (node, code, message, pathOverride) => {
    const sourceFile = node?.getSourceFile?.() ?? i18nFile
    const start = node ? node.getStart(sourceFile, false) : 0
    const position = sourceFile.getLineAndCharacterOfPosition(start)
    diagnostics.push({
      severity: 'error',
      code,
      path: pathOverride ?? displayPathByCanonical.get(canonicalPath(sourceFile.fileName)) ?? normalizedDisplayPath(sourceFile.fileName, input.repoRoot),
      line: position.line + 1,
      column: position.character + 1,
      message,
    })
  }

  for (const source of allSources) {
    const sourceFile = program.getSourceFile(source.path)
    for (const parseError of sourceFile?.parseDiagnostics ?? []) {
      const start = parseError.start ?? 0
      const position = sourceFile.getLineAndCharacterOfPosition(start)
      diagnostics.push({
        severity: 'error',
        code: 'I18N_PARSE_ERROR',
        path: displayPathByCanonical.get(canonicalPath(source.path)) ?? normalizedDisplayPath(source.path, input.repoRoot),
        line: position.line + 1,
        column: position.character + 1,
        message: ts.flattenDiagnosticMessageText(parseError.messageText, '\n'),
      })
    }
  }

  const locales = localeUnionValues(checker, i18nFile)
  if (locales.length !== 2 || !locales.includes('zh-CN') || !locales.includes('en')) {
    addDiagnostic(i18nFile, 'I18N_LOCALE_CONTRACT_INVALID', "Locale must be exactly 'zh-CN' | 'en'.")
  }
  const translationKeys = translationKeyValues(checker, i18nFile)
  if (!translationKeys.length) addDiagnostic(i18nFile, 'I18N_TRANSLATION_CONTRACT_MISSING', 'TranslationKey must be a non-empty string-literal union.')
  const translationKeySet = new Set(translationKeys)

  const parseObject = (node, context) => {
    if (!ts.isObjectLiteralExpression(node)) {
      addDiagnostic(node, 'I18N_LOCALE_SHAPE_MISMATCH', `${context} must be an object literal.`)
      return new Map()
    }
    const properties = new Map()
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        addDiagnostic(property, 'I18N_UNSUPPORTED_OBJECT_MEMBER', `${context} uses spread, shorthand, or method syntax; use an explicit property assignment.`)
        continue
      }
      if (ts.isComputedPropertyName(property.name)) {
        addDiagnostic(property.name, 'I18N_COMPUTED_KEY', `${context} uses a computed key.`)
        continue
      }
      const name = staticPropertyName(property.name)
      if (name === undefined) {
        addDiagnostic(property.name, 'I18N_UNSUPPORTED_OBJECT_MEMBER', `${context} has an unsupported property name.`)
        continue
      }
      if (properties.has(name)) {
        addDiagnostic(property.name, 'I18N_DUPLICATE_KEY', `${context} duplicates key '${name}'.`)
        continue
      }
      properties.set(name, property)
    }
    return properties
  }

  const validateLeaf = (node, contract, context) => {
    if (contract.kind === 'string') {
      if (!isStaticString(node)) {
        addDiagnostic(node, 'I18N_LOCALE_SHAPE_MISMATCH', `${context} must be a string literal, not ${ts.SyntaxKind[node.kind]}.`)
      } else if (!node.text.trim()) {
        addDiagnostic(node, 'I18N_LOCALE_VALUE_EMPTY', `${context} must be a non-whitespace string.`)
      }
      return
    }
    if (contract.kind === 'function') {
      if (!isFunctionExpression(node)) addDiagnostic(node, 'I18N_LOCALE_SHAPE_MISMATCH', `${context} must be a copy generator function.`)
      return
    }
    const actual = parseObject(node, context)
    for (const [key, property] of actual) {
      const expected = contract.properties[key]
      if (!expected) {
        addDiagnostic(property.name, 'I18N_LOCALE_KEY_EXTRA', `${context} has extra key '${key}'.`)
        continue
      }
      validateLeaf(property.initializer, expected, `${context}.${key}`)
    }
    for (const key of Object.keys(contract.properties)) {
      if (!actual.has(key)) addDiagnostic(node, 'I18N_LOCALE_KEY_MISSING', `${context} is missing key '${key}'.`)
    }
  }

  const tableDeclarations = new Map()
  for (const statement of i18nFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.type || !declaration.initializer) continue
      const valueTypeNode = recordLocaleValueType(declaration.type)
      if (!valueTypeNode) continue
      const tableName = declaration.name.text
      tableDeclarations.set(tableName, declaration)
      if (!inventorySet.has(tableName)) {
        addDiagnostic(declaration.name, 'I18N_UNKNOWN_LOCALE_TABLE', `Locale table '${tableName}' is not in the explicit inventory.`)
      }
      const root = parseObject(declaration.initializer, tableName)
      for (const locale of locales) {
        if (!root.has(locale)) addDiagnostic(declaration.initializer, 'I18N_LOCALE_KEY_MISSING', `${tableName} is missing locale '${locale}'.`)
      }
      for (const [locale, property] of root) {
        if (!locales.includes(locale)) addDiagnostic(property.name, 'I18N_LOCALE_KEY_EXTRA', `${tableName} has unsupported locale '${locale}'.`)
      }
      if (tableName === 'messages') {
        for (const locale of locales) {
          const localeProperty = root.get(locale)
          if (!localeProperty) continue
          const entries = parseObject(localeProperty.initializer, `${tableName}.${locale}`)
          for (const [key, property] of entries) {
            if (!translationKeySet.has(key)) {
              addDiagnostic(property.name, 'I18N_LOCALE_KEY_EXTRA', `${tableName}.${locale} has extra TranslationKey '${key}'.`)
            } else {
              validateLeaf(property.initializer, { kind: 'string' }, `${tableName}.${locale}.${key}`)
            }
          }
          for (const key of translationKeys) {
            if (!entries.has(key)) addDiagnostic(localeProperty.initializer, 'I18N_LOCALE_KEY_MISSING', `${tableName}.${locale} is missing TranslationKey '${key}'.`)
          }
        }
        continue
      }

      const resolvedContract = contractForTypeNode(checker, valueTypeNode, copyContracts)
      if (!resolvedContract.contract) {
        addDiagnostic(valueTypeNode, 'I18N_UNKNOWN_LOCALE_TABLE', `Locale table '${tableName}' has an unsupported or unresolved Copy contract.`)
        continue
      }
      if (resolvedContract.contract.kind !== 'object' || !resolvedContract.partial) {
        for (const locale of locales) {
          const localeProperty = root.get(locale)
          if (localeProperty) validateLeaf(localeProperty.initializer, resolvedContract.contract, `${tableName}.${locale}`)
        }
        continue
      }

      const localeEntries = new Map()
      for (const locale of locales) {
        const localeProperty = root.get(locale)
        if (!localeProperty) continue
        const entries = parseObject(localeProperty.initializer, `${tableName}.${locale}`)
        localeEntries.set(locale, entries)
        for (const [key, property] of entries) {
          const expected = resolvedContract.contract.properties[key]
          if (!expected) {
            addDiagnostic(property.name, 'I18N_LOCALE_KEY_EXTRA', `${tableName}.${locale} has extra key '${key}'.`)
          } else {
            validateLeaf(property.initializer, expected, `${tableName}.${locale}.${key}`)
          }
        }
      }
      for (const key of Object.keys(resolvedContract.contract.properties)) {
        const presentLocales = locales.filter(locale => localeEntries.get(locale)?.has(key))
        const allowlistIndex = partialAllowlist.findIndex(entry => entry.table === tableName && entry.key === key)
        if (presentLocales.length === locales.length) continue
        if (presentLocales.length === 0) {
          if (allowlistIndex >= 0) {
            usedPartialAllowlist.add(allowlistIndex)
          } else {
            addDiagnostic(declaration.initializer, 'I18N_PARTIAL_OMISSION_UNALLOWED', `${tableName} omits Partial key '${key}' from both locales without an exact allowlist entry.`)
          }
          continue
        }
        const missingLocales = locales.filter(locale => !presentLocales.includes(locale))
        addDiagnostic(declaration.initializer, 'I18N_PARTIAL_OMISSION_UNILATERAL', `${tableName}.${key} is missing only from locale(s) ${missingLocales.join(', ')}; Partial fallback must be bilateral.`)
        if (allowlistIndex >= 0) usedPartialAllowlist.add(allowlistIndex)
      }
    }
  }

  for (const tableName of inventory) {
    if (!tableDeclarations.has(tableName)) addDiagnostic(i18nFile, 'I18N_LOCALE_TABLE_MISSING', `Inventory entry '${tableName}' has no top-level Record<Locale, ...> declaration.`)
  }
  partialAllowlist.forEach((entry, index) => {
    if (!usedPartialAllowlist.has(index)) {
      addDiagnostic(i18nFile, 'I18N_PARTIAL_ALLOWLIST_STALE', `Partial omission allowlist entry '${entry.table}.${entry.key}' is stale or does not describe a bilateral omission.`)
    }
  })

  const hardcodedIndexByKey = new Map()
  hardcodedAllowlist.forEach((entry, index) => {
    const key = `${entry.path}\0${entry.kind}\0${normalizedLiteral(entry.literal)}`
    const indexes = hardcodedIndexByKey.get(key) ?? []
    indexes.push(index)
    hardcodedIndexByKey.set(key, indexes)
  })
  const recordHardcodedCandidate = (node, kind, rawValue, displayPath) => {
    const literal = normalizedLiteral(rawValue)
    if (!literal || isStructurallyNonCopyLiteral(literal, node) || (kind === 'placeholder' && isMachineFormatPlaceholder(node))) return
    const key = `${displayPath}\0${kind}\0${literal}`
    const matchingIndexes = hardcodedIndexByKey.get(key)
    const unusedIndex = matchingIndexes?.find(index => !usedHardcodedAllowlist.has(index))
    if (unusedIndex !== undefined) {
      usedHardcodedAllowlist.add(unusedIndex)
      return
    }
    addDiagnostic(node, 'I18N_HARDCODED_UI_COPY', `Hardcoded ${kind} copy '${literal}' requires localized copy or an exact allowlist entry.`, displayPath)
  }

  for (const source of allSources) {
    const displayPath = displayPathByCanonical.get(canonicalPath(source.path)) ?? normalizedDisplayPath(source.path, input.repoRoot)
    if (!isProductionUiSource(displayPath)) continue
    const sourceFile = program.getSourceFile(source.path)
    if (!sourceFile) continue
    const visit = node => {
      if (ts.isCallExpression(node)) {
        const acceptedKeys = translatorParameterKeys(checker, node)
        if (acceptedKeys && [...acceptedKeys].every(key => translationKeySet.has(key))) {
          const argument = node.arguments[0]
          if (!argument || !isStaticString(argument)) {
            addDiagnostic(argument ?? node, 'I18N_TRANSLATOR_DYNAMIC_KEY', 'Translator calls require one static TranslationKey literal.', displayPath)
          } else if (!translationKeySet.has(argument.text)) {
            addDiagnostic(argument, 'I18N_TRANSLATOR_UNKNOWN_KEY', `Translator call references unknown TranslationKey '${argument.text}'.`, displayPath)
          }
        }
      }
      if (ts.isJsxText(node)) recordHardcodedCandidate(node, 'jsx-text', node.text, displayPath)
      if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        for (const candidate of staticUiExpressionValues(node.expression)) recordHardcodedCandidate(candidate.node, 'jsx-text', candidate.value, displayPath)
      }
      if (ts.isJsxAttribute(node)) {
        const attributeName = node.name.text
        if (uiFacingAttributes.has(attributeName) && node.initializer) {
          if (ts.isStringLiteral(node.initializer)) {
            recordHardcodedCandidate(node.initializer, attributeName, node.initializer.text, displayPath)
          } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
            for (const candidate of staticUiExpressionValues(node.initializer.expression)) {
              recordHardcodedCandidate(candidate.node, attributeName, candidate.value, displayPath)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  hardcodedAllowlist.forEach((entry, index) => {
    if (!usedHardcodedAllowlist.has(index)) {
      diagnostics.push({
        severity: 'error',
        code: 'I18N_HARDCODED_ALLOWLIST_STALE',
        path: entry.path,
        line: 1,
        column: 1,
        message: `Hardcoded-copy allowlist entry '${entry.kind}: ${entry.literal}' is stale or duplicated.`,
      })
    }
  })

  diagnostics.sort((left, right) => left.path.localeCompare(right.path)
    || left.line - right.line
    || left.column - right.column
    || left.code.localeCompare(right.code))
  return { ok: diagnostics.length === 0, exitCode: diagnostics.length === 0 ? 0 : 1, diagnostics }
}

export function extractCopyContracts(program, i18nFilePath) {
  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(i18nFilePath)
  if (!sourceFile) throw new Error(`I18n source is absent from the TypeScript Program: ${i18nFilePath}`)
  const contracts = {}
  for (const name of importedCopyContractNames) {
    let importedIdentifier
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue
      const match = statement.importClause.namedBindings.elements.find(element => (element.propertyName?.text ?? element.name.text) === name)
      if (match) importedIdentifier = match.name
    }
    if (!importedIdentifier) throw new Error(`Required imported Copy contract '${name}' is not imported by ${i18nFilePath}`)
    const symbol = checker.getSymbolAtLocation(importedIdentifier)
    const target = symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol
    if (!target) throw new Error(`Required imported Copy contract '${name}' could not be resolved`)
    const declaration = target.declarations?.[0] ?? importedIdentifier
    const type = checker.getDeclaredTypeOfSymbol(target)
    const contract = contractFromType(checker, type, declaration)
    if (!contract || contract.kind !== 'object') throw new Error(`Required imported Copy contract '${name}' is not an object Copy contract`)
    contracts[name] = contract
    if (importedIdentifier.text !== name) contracts[importedIdentifier.text] = contract
  }
  return contracts
}

function loadTsconfig(tsconfigPath) {
  const loaded = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(tsconfigPath), undefined, tsconfigPath)
  if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  return parsed
}

export function runCli() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url))
  const webRoot = resolve(scriptDirectory, '..')
  const repoRoot = resolve(webRoot, '..', '..')
  const tsconfigPath = resolve(webRoot, 'tsconfig.json')
  const i18nFilePath = resolve(webRoot, 'app', 'lib', 'i18n.tsx')
  const parsed = loadTsconfig(tsconfigPath)
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
  const copyContracts = extractCopyContracts(program, i18nFilePath)
  const roots = [resolve(webRoot, 'app'), resolve(webRoot, 'features')]
  const productionSources = program.getSourceFiles()
    .filter(sourceFile => roots.some(root => {
      const candidate = relative(root, sourceFile.fileName)
      return candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)
    }))
    .filter(sourceFile => supportedSourcePattern.test(sourceFile.fileName) && !ignoredProductionFilePattern.test(posixPath(sourceFile.fileName)))
    .sort((left, right) => posixPath(left.fileName).localeCompare(posixPath(right.fileName)))
    .map(sourceFile => ({ path: sourceFile.fileName, text: sourceFile.text }))
  const i18nSource = productionSources.find(source => canonicalPath(source.path) === canonicalPath(i18nFilePath))
    ?? { path: i18nFilePath, text: readFileSync(i18nFilePath, 'utf8') }
  const result = checkSources({
    i18nSource,
    componentSources: productionSources,
    copyContracts,
    partialOmissionAllowlist: PRODUCTION_PARTIAL_OMISSION_ALLOWLIST,
    hardcodedCopyAllowlist: PRODUCTION_HARDCODED_COPY_ALLOWLIST,
    localeTableInventory: PRODUCTION_LOCALE_TABLE_INVENTORY,
    compilerOptions: parsed.options,
    repoRoot,
  })
  for (const diagnostic of result.diagnostics) {
    console.error(`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}`)
  }
  if (result.ok) console.log(`i18n check passed: ${PRODUCTION_LOCALE_TABLE_INVENTORY.length} locale tables and ${productionSources.length} production sources.`)
  process.exitCode = result.exitCode
  return result
}

const invokedPath = process.argv[1] && existsSync(process.argv[1]) ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) runCli()

/**
 * Headless smoke test for the dashboard client half.
 * Loads the browser module with stubs, registers it into a fake ctx, then
 * renders the page and every child component with real data shapes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(new URL('../client.js', import.meta.url)))

// ---------------------------------------------------------------- stubs ---

let loaded = null
globalThis.window = { __ModuleLoader__: { load: spec => { loaded = spec } } }

const styles = []
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, textContent: '' }),
  head: { appendChild: node => styles.push(node) },
}

let hookSlots = []
let hookIndex = 0

const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
  useState(init) {
    const index = hookIndex++
    if (!(index in hookSlots)) hookSlots[index] = typeof init === 'function' ? init() : init
    return [hookSlots[index], next => { hookSlots[index] = next }]
  },
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
  useRef(init) {
    const index = hookIndex++
    if (!(index in hookSlots)) hookSlots[index] = { current: init }
    return hookSlots[index]
  },
  useEffect() {},
}

const requireStub = id => {
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
}

const source = fs.readFileSync(path.join(DIR, 'client.js'), 'utf8')
new Function('window', 'require', source)(globalThis.window, requireStub)
if (loaded === null) throw new Error('module loader was not called')
if (loaded.id !== '@carloskey/dsh-automation-dashboard') throw new Error('bad module id: ' + loaded.id)

// ------------------------------------------------------------ fake data ---

const now = Date.parse('2026-11-24T17:10:00+08:00')
const iso = ms => new Date(ms).toISOString()

const tasks = [
  {
    id: 'deploy-check', kind: 'cron', title: '部署巡检',
    expression: '*/15 9-17 * * 1-5', timeZone: 'Asia/Shanghai',
    scheduledAt: iso(now + 4 * 60 * 1000),
    status: 'active', executionActive: true,
    lastDelivery: { scheduledAt: iso(now - 60 * 60 * 1000), deliveredAt: iso(now - 60 * 60 * 1000 + 420), messageId: 'm1', targetSessionId: 's1' },
  },
  {
    id: 'weekly-report', kind: 'weekly', title: '周报汇总',
    time: '09:00', timeZone: 'Asia/Shanghai', weekdays: [1],
    scheduledAt: iso(now + 3 * 3600 * 1000),
    status: 'active',
  },
  {
    id: 'paused-one', kind: 'every', title: '每 30 分钟的日志快照与归档任务，名字很长用来测试截断',
    everySeconds: 1800,
    scheduledAt: iso(now - 5000),
    status: 'paused',
  },
  {
    id: 'ended-one', kind: 'at', title: '一次性提醒',
    scheduledAt: iso(now - 86400000),
    status: 'ended',
    lastDelivery: { scheduledAt: iso(now - 86400000), deliveredAt: iso(now - 86400000 + 130000), messageId: 'm4', targetSessionId: 's4' },
  },
]

const histories = {
  'deploy-check': [
    { scheduledAt: iso(now - 60 * 60 * 1000), deliveredAt: iso(now - 60 * 60 * 1000 + 420), messageId: 'm1', targetSessionId: 's1' },
    { scheduledAt: iso(now - 90 * 60 * 1000), deliveredAt: iso(now - 90 * 60 * 1000 + 1200), messageId: 'm2', targetSessionId: 's1' },
  ],
  'ended-one': [
    { scheduledAt: iso(now - 86400000), deliveredAt: iso(now - 86400000 + 130000), messageId: 'm4', targetSessionId: 's4' },
  ],
}

const calls = []
const remote = {
  $on: (name, listener) => { calls.push(['$on', name]); return () => calls.push(['$off', name]) },
  schedule: {
    async catalog() { calls.push(['catalog']); return { ok: true, value: tasks } },
    async history(request) {
      calls.push(['history', request.id, request.limit])
      return { ok: true, value: { id: request.id, records: histories[request.id] || [], earlierRecordsUnavailable: false, earlierRecordsPruned: false, retention: { days: 30, records: 200 } } }
    },
  },
}

// ------------------------------------------------------------- fake ctx ---

const registered = []
const ctx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  on: (name, listener) => { calls.push(['on', name]); return () => {} },
  locale: {
    register: (ns, dicts) => {
      registered.push(['locale', ns, Object.keys(dicts)])
      return () => {}
    },
    bind: ns => key => {
      const dict = ns === 'automation.dashboard' ? moduleDicts[0] : {}
      return dict[key] === undefined ? '<<' + key + '>>' : dict[key]
    },
  },
  slots: {
    inject: (owner, callback) => {
      registered.push(['inject', owner])
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register: (options, component) => {
      registered.push(['register', options.name, options.key || options.id, options.order])
      return () => {}
    },
  },
  remoteAccess: { whenAccess: (action, callback) => { registered.push(['whenAccess', action]); for (const dispose of callback()) { /* keep */ } } },
  remote,
}

let moduleDicts = []
const originalRegister = ctx.locale.register
ctx.locale.register = (ns, dicts) => {
  moduleDicts = [dicts.zh, dicts.en]
  return originalRegister(ns, dicts)
}

const plugin = loaded.factory(requireStub)
console.log('inject:', JSON.stringify(plugin.inject))
plugin.apply(ctx)

console.log('\nregistrations:')
for (const row of registered) console.log(' ', JSON.stringify(row))

const mainRegistration = registered.find(row => row[0] === 'register' && row[1] === 'main')
const panelRegistration = registered.find(row => row[0] === 'register' && row[1] === 'sidebar.panellist')
if (!mainRegistration) throw new Error('no main panel registered')
if (!panelRegistration) throw new Error('no sidebar entry registered')
if (mainRegistration[2] !== 'automation-dashboard') throw new Error('unexpected main key')
if (panelRegistration[2] !== 'automation-dashboard') throw new Error('unexpected panel id')
if (panelRegistration[3] !== 20) throw new Error('unexpected order')
console.log('\nOK: main key + sidebar entry registered, order', panelRegistration[3])

// ---------------------------------------------------------- data loading ---

const snapshot = await (async () => {
  const injected = registered
  void injected
  // Reach loadSnapshot through the injected object the page receives.
  let injectedObject = null
  ctx.slots.register = (options, component) => {
    if (options.name === 'main') injectedObject = options.inject()
    return () => {}
  }
  plugin.apply({ ...ctx, remoteAccess: null })
  return injectedObject
})()

if (!snapshot || typeof snapshot.load !== 'function') throw new Error('injected load missing')
const snap = await snapshot.load()
console.log('\nsnapshot:', JSON.stringify({
  tasks: snap.tasks.length,
  records: snap.records.length,
  loadedAt: typeof snap.loadedAt,
}))
if (snap.tasks.length !== 4) throw new Error('expected 4 tasks')
if (snap.records.length !== 3) throw new Error('expected 3 receipts, got ' + snap.records.length)
if (!(snap.records[0].deliveredAt >= snap.records[1].deliveredAt)) throw new Error('records not newest-first')
console.log('history requests:', calls.filter(call => call[0] === 'history').length, 'limit', calls.find(call => call[0] === 'history')[2])

// -------------------------------------------------------------- render ----

function flatten(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) { for (const child of node) flatten(child, out); return out }
  if (typeof node === 'object' && node.type !== undefined) {
    if (typeof node.type === 'function') {
      const rendered = node.type(node.props)
      return flatten(rendered, out)
    }
    out.push(node)
    for (const child of node.children) flatten(child, out)
    return out
  }
  out.push(String(node))
  return out
}

function renderComponent(component, props, seed) {
  hookSlots = seed || []
  hookIndex = 0
  return flatten(component(props))
}

// The page needs its state slots pre-seeded: snapshot, error, now, ref, ref.
const pageProps = { t: snapshot.t, load: snapshot.load, subscribe: snapshot.subscribe }
const pageTree = renderComponent(
  findPage(),
  pageProps,
  [snap, null, false, now, { current: true }, { current: 0 }, { current: null }, false, { current: null }],
)

function findPage() {
  let page = null
  ctx.slots.register = (options, component) => {
    if (options.name === 'main') page = component
    return () => {}
  }
  plugin.apply({ ...ctx, remoteAccess: null })
  if (page === null) throw new Error('page component not captured')
  return page
}

const text = pageTree.map(node => (node.type === undefined ? node : '')).filter(Boolean).join(' ')
console.log('\nrendered text fragments:', text.replace(/\s+/g, ' ').slice(0, 400))
const nodes = pageTree.filter(node => node.type !== undefined)
const classNames = nodes.map(node => node.props.className).filter(Boolean)
console.log('nodes:', nodes.length)
console.log('has stats:', classNames.includes('ds-stats'))
console.log('has cards:', classNames.includes('ds-cards'))
console.log('lanes:', classNames.filter(c => c === 'tl-lane').length,
  'scans:', classNames.filter(c => c === 'tl-scan').length,
  'groups:', classNames.filter(c => c === 'tl-group').length)

if (!classNames.includes('ds-stats')) throw new Error('stats bar missing')
if (!classNames.includes('ds-cards')) throw new Error('cards grid missing')
if (!classNames.includes('tl-lane')) throw new Error('timeline lanes missing')
if (classNames.filter(c => c === 'tl-lane').length !== 4) throw new Error('expected 4 lanes')
if (classNames.filter(c => c === 'tl-group').length !== 3) throw new Error('expected 3 groups')

const allText = pageTree.map(node => (node.type === undefined ? node : (typeof node.children?.[0] === 'string' ? node.children[0] : ''))).join('|')
if (/<<[a-zA-Z]+>>/.test(JSON.stringify(pageTree.map(n => n.children)))) throw new Error('missing locale key in render')

// Cards: statuses and rules.
const cardNodes = nodes.filter(node => node.props.className === 'ds-card')
console.log('\ncards:', cardNodes.map(node => node.props['data-status']).join(', '))
if (cardNodes.length !== 4) throw new Error('expected 4 cards, got ' + cardNodes.length)
if (cardNodes[0].props['data-status'] !== 'running') throw new Error('running task should sort first')
if (!cardNodes.some(node => node.props['data-status'] === 'paused')) throw new Error('paused card missing')
if (!cardNodes.some(node => node.props['data-status'] === 'ended')) throw new Error('ended card missing')

// Timeline points: every state must come from real or derived data.
const pointNodes = nodes.filter(node => node.props.className === 'tl-pt')
const states = pointNodes.map(node => node.props['data-s'])
const counts = states.reduce((acc, state) => { acc[state] = (acc[state] || 0) + 1; return acc }, {})
console.log('timeline points:', pointNodes.length, JSON.stringify(counts))
if (pointNodes.length < 20) throw new Error('too few timeline points')
if (!counts.delivered) throw new Error('no delivered point (receipts not matched)')
if (!counts.future) throw new Error('no future point (rule not expanded)')
const lefts = pointNodes.map(node => parseFloat(node.props.style.left))
if (lefts.some(v => !Number.isFinite(v) || v < 0 || v > 100)) throw new Error('point outside its window')
const scan = nodes.find(node => node.props.className === 'tl-scan')
if (!scan || !/calc\(176px/.test(scan.props.style.left)) throw new Error('scan line missing')
console.log('scan line:', scan.props.style.left)

// Stat readouts.
const nums = nodes.filter(node => node.props.className && node.props.className.startsWith('ds-num'))
console.log('stat values:', nums.map(node => node.children.join('')).join(' | '))

// ------------------------------------------------------- empty + error ----

const emptyTree = renderComponent(findPage(), {
  t: snapshot.t,
  load: async () => ({ tasks: [], records: [], loadedAt: Date.now() }),
  subscribe: () => () => {},
}, [{ tasks: [], records: [], loadedAt: Date.now() }, null, false, now, { current: true }, { current: 0 }, { current: null }, false, { current: null }])
const emptyText = flatten(emptyTree).filter(node => node.type === undefined).join(' ')
if (!emptyText.includes('官方任务目录为空')) throw new Error('empty task placeholder missing')
if (!emptyText.includes('暂无送达记录')) throw new Error('empty record placeholder missing')
console.log('\nOK: empty placeholders render')

// First load must not claim an empty catalog, and a failed first read must not either.
const loadingTree = renderComponent(findPage(), pageProps, [null, null, true, now, { current: true }, { current: 0 }, { current: null }, false, { current: null }])
const loadingText = flatten(loadingTree).filter(node => node.type === undefined).join(' ')
if (!loadingText.includes('正在通过官方 schedule RPC 读取任务')) throw new Error('loading block missing')
if (loadingText.includes('官方任务目录为空')) throw new Error('loading state wrongly claims an empty catalog')
console.log('OK: first-load block renders without an empty-catalog claim')

const failedTree = renderComponent(findPage(), pageProps, [null, 'schedule/denied', false, now, { current: true }, { current: 0 }, { current: null }, false, { current: null }])
const failedText = flatten(failedTree).filter(node => node.type === undefined).join(' ')
if (!failedText.includes('读取官方任务数据失败')) throw new Error('failure block missing')
if (!failedText.includes('schedule/denied')) throw new Error('failure reason missing')
if (failedText.includes('官方任务目录为空')) throw new Error('failure state wrongly claims an empty catalog')
console.log('OK: failed first read shows the failure block, not an empty catalog')

const staleTree = renderComponent(findPage(), pageProps, [snap, 'schedule/denied', false, now, { current: true }, { current: 0 }, { current: null }, false, { current: null }])
const staleText = flatten(staleTree).filter(node => node.type === undefined).join(' ')
if (!staleText.includes('下面是上一次成功读取的数据')) throw new Error('stale notice missing')
if (!staleText.includes('部署巡检')) throw new Error('stale read should keep the last data')
console.log('OK: failed refresh keeps the last data with a stale notice')

// Icon component at both sidebar sizes.
for (const size of [16, 20, 24]) {
  const icon = flatten(findIcon()({ size, active: size === 24 }))
  const svg = icon.find(node => node.type === 'svg')
  if (!svg) throw new Error('icon did not render an svg')
  if (svg.props.width !== size || svg.props.height !== size) throw new Error('icon size not honored')
}
console.log('OK: sidebar icon honors size/active')

function findIcon() {
  let icon = null
  ctx.slots.register = (options, component) => {
    if (options.name === 'sidebar.panellist') icon = component
    return () => {}
  }
  plugin.apply({ ...ctx, remoteAccess: null })
  if (icon === null) throw new Error('icon component not captured')
  return icon
}

// --------------------------------------------------------------- locale ---

const zhDict = moduleDicts[0]
const enDict = moduleDicts[1]
const zhKeys = Object.keys(zhDict).sort()
const enKeys = Object.keys(enDict).sort()
if (zhKeys.join() !== enKeys.join()) throw new Error('zh/en key mismatch')
console.log('\nlocale keys:', zhKeys.length, 'balanced across zh/en')
console.log('style tags injected:', styles.length)
console.log('\nALL CHECKS PASSED')

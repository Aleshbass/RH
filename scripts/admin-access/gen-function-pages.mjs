#!/usr/bin/env node
/**
 * Admin access (owner 2026-11-17): a full admin ticks which admin pages each admin can open. The
 * console hides the rest, and Convex refuses the rest too. This script works out, from the code,
 * which admin pages use each admin-only Convex function, and writes that map to
 * convex/helpers/adminFunctionPages.ts.
 *
 * It also tags each admin check with its function's name, so the check knows what is being called:
 *   ensureUserRole(ctx, ["admin"])  →  ensureUserRole(ctx, ["admin"], "payouts:approvePayout")
 *   requireAdmin(ctx)               →  requireAdmin(ctx, "marketing:listCampaigns")
 * (checks in shared helpers get "module:*": any page that uses that module).
 *
 * Run it after adding or changing an admin page or an admin-only function:
 *   node scripts/admin-access/gen-function-pages.mjs
 * Full admins are never affected; a function no admin page uses is refused to restricted admins.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const ADMIN_HOME = '/dashboard/admin'
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

/** Only full admins (people and access, whatever pages they have). */
const FULL_ONLY = [
  'users:setUserRole',
  'users:adminDeleteUser',
  'users:adminCloseAccount',
  'teamAccess:adminGrantTeamRole',
  'teamAccess:adminInviteLink',
  'teamAccess:adminRemoveTeamAccess',
  'learnAdmins:add',
  'learnAdmins:addMany',
  'learnAdmins:remove',
  'learnAdmins:cancelInvite',
  // Signs in as someone else: full admins only
  'adminViewAs:createViewAsLink',
  // Money routing decides which bank account Rehabify's revenue is paid to: full admins only
  // (adminRoutingAccess is the check inside the account look-up and save actions)
  'paystackRouting:adminGetRouting',
  'paystackRouting:adminRoutingAccess',
  'paystackRouting:adminSetRouting',
]
/** Shell functions that still need a page: the ⌘K people search needs a people page. */
const PAGE_OVERRIDES = {
  'adminConsole:searchPeople': ['/users', '/users?role=patient', '/physiotherapists', '/clinics'].map((p) => ADMIN_HOME + p),
}

// ── 1. The admin pages (nav items) ───────────────────────────────────────────
const navSrc = read('components/admin/shell/adminNav.ts')
const pages = []
for (const m of navSrc.matchAll(/href:\s*(?:a\('([^']+)'\)|ADMIN_HOME\b)/g)) {
  const href = m[1] ? ADMIN_HOME + m[1] : ADMIN_HOME
  if (!pages.includes(href)) pages.push(href)
}
const pathOf = (href) => href.split('?')[0]

/** The nav items a route belongs to: the longest matching path (Home only matches itself). */
function navFor(route) {
  let best = []
  let bestLen = -1
  for (const href of pages) {
    const p = pathOf(href)
    const match = p === ADMIN_HOME ? route === ADMIN_HOME : route === p || route.startsWith(p + '/')
    if (!match) continue
    if (p.length > bestLen) {
      best = [href]
      bestLen = p.length
    } else if (p.length === bestLen) best.push(href)
  }
  return best
}

// ── 2. App files, imports and the Convex functions they use ───────────────────
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p)
  }
  return out
}
const appFiles = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(root, d)))
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
function resolveImport(spec, from) {
  let base
  if (spec.startsWith('@/')) base = path.join(root, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  if (base.startsWith(path.join(root, 'convex'))) return null
  for (const ext of EXTS) {
    const f = base + ext
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f
  }
  return null
}

const nameOf = (parts) => (parts.length >= 2 ? `${parts.slice(0, -1).join('/')}:${parts[parts.length - 1]}` : null)
const split = (dotted) => dotted.split('.').filter(Boolean)

/** Convex functions a file names: api.x.y, (api as …).x.y, aliases of api, and 'x:y' strings. */
function refsOf(src, { internal = false } = {}) {
  const out = new Set()
  const roots = internal ? ['api', 'internal'] : ['api']
  for (const r of roots) {
    for (const m of src.matchAll(new RegExp(`(?<![\\w.$])${r}((?:\\.\\w+){2,})`, 'g'))) {
      const n = nameOf(split(m[1]))
      if (n) out.add(n)
    }
    for (const m of src.matchAll(new RegExp(`\\(\\s*${r}\\s+as\\s+[^)]*\\)((?:\\.\\w+){2,})`, 'g'))) {
      const n = nameOf(split(m[1]))
      if (n) out.add(n)
    }
    // const xApi = api.payouts / (api as any).awadoc / (api as unknown as {…}).admin / api as unknown as …
    for (const m of src.matchAll(new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*\\(?\\s*${r}(?:\\s+as\\s+[^\\n;]*?\\))?((?:\\.\\w+)*)`, 'g'))) {
      const [, alias, base] = m
      for (const u of src.matchAll(new RegExp(`(?<![\\w.$])${alias}((?:\\.\\w+)+)`, 'g'))) {
        const n = nameOf([...split(base), ...split(u[1])])
        if (n) out.add(n)
      }
    }
  }
  for (const m of src.matchAll(/['"`]([A-Za-z][\w/]*):([A-Za-z]\w*)['"`]/g)) out.add(`${m[1]}:${m[2]}`)
  // Builders like (name) => makeFunctionReference(`homeVisitSafety:${name}`) used as q('adminBoard')
  for (const t of src.matchAll(/`([A-Za-z][\w/]*):\$\{\w+\}`/g)) {
    for (const w of src.matchAll(/['"]([A-Za-z]\w*)['"]/g)) out.add(`${t[1]}:${w[1]}`)
  }
  return out
}

const imports = new Map()
const refs = new Map()
for (const f of appFiles) {
  const src = fs.readFileSync(f, 'utf8')
  const deps = new Set()
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    const r = resolveImport(m[1], f)
    if (r) deps.add(r)
  }
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const r = resolveImport(m[1], f)
    if (r) deps.add(r)
  }
  imports.set(f, deps)
  refs.set(f, refsOf(src))
}
function closureRefs(start) {
  const seen = new Set()
  const out = new Set()
  const stack = [start]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const r of refs.get(f) ?? []) out.add(r)
    for (const d of imports.get(f) ?? []) stack.push(d)
  }
  return out
}

// ── 3. Which pages use which functions ───────────────────────────────────────
const adminDir = path.join(root, 'app/dashboard/admin')
const fnPages = new Map() // name → Set(href) | 'any'
const addPage = (name, href) => {
  const cur = fnPages.get(name)
  if (cur === 'any') return
  if (!cur) fnPages.set(name, new Set([href]))
  else cur.add(href)
}
// The console frame (AdminShell) calls these admin-only functions on every page. Anything else it
// could reach is only rendered for admins who have that page (AdminShell checks), so it isn't here.
const SHELL_ANY = ['adminConsole:getNavBadges']
for (const name of SHELL_ANY) fnPages.set(name, 'any')
const shellRefs = closureRefs(path.join(adminDir, 'layout.tsx'))
const pageFiles = walk(adminDir).filter((f) => /[\\/]page\.tsx$/.test(f))
for (const file of pageFiles) {
  const dir = path.dirname(file)
  const route = '/' + path.relative(path.join(root, 'app'), dir).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/')
  const owners = navFor(route)
  if (owners.length === 0) continue // not in the menu: full admins only
  const used = closureRefs(file)
  // Layouts between the console root and the page
  for (let d = dir; d.startsWith(adminDir) && d !== adminDir; d = path.dirname(d)) {
    const layout = path.join(d, 'layout.tsx')
    if (fs.existsSync(layout)) for (const r of closureRefs(layout)) used.add(r)
  }
  for (const r of used) for (const href of owners) addPage(r, href)
}

// ── 4. Convex: tag the admin checks, and follow functions that call functions ─
const convexDir = path.join(root, 'convex')
const convexFiles = walk(convexDir).filter((f) => !f.includes(`${path.sep}_generated${path.sep}`) && !f.includes(`${path.sep}helpers${path.sep}`))
const gated = new Set()
const moduleRefs = new Map()
let rewritten = 0
for (const file of convexFiles) {
  const mod = path.relative(convexDir, file).replace(/\\/g, '/').replace(/\.ts$/, '')
  let src = fs.readFileSync(file, 'utf8')
  moduleRefs.set(mod, refsOf(src, { internal: true }))
  const partnerRequireAdmin = /import\s*\{[^}]*\brequireAdmin\b[^}]*\}\s*from\s*["'](?:\.\/|\.\.\/)+helpers\/partnerAccess["']/.test(src)
  const lines = src.split('\n')
  let current = null
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const decl = /^(?:export\s+)?(?:const|let|async\s+function|function)\s+(\w+)/.exec(line)
    if (decl) current = /^export\s+const\s+\w+\s*=\s*\w+\(/.test(line) ? `${mod}:${decl[1]}` : `${mod}:*`
    if (!current) continue
    let next = line.replace(/ensureUserRole\((ctx(?: as any)?), \["admin"\]\)/g, (_, c) => `ensureUserRole(${c}, ["admin"], "${current}")`)
    if (partnerRequireAdmin) next = next.replace(/\brequireAdmin\(ctx\)/g, `requireAdmin(ctx, "${current}")`)
    for (const m of next.matchAll(/(?:ensureUserRole\(ctx(?: as any)?, \["admin"\]|requireAdmin\(ctx), "([^"]+)"\)/g)) gated.add(m[1])
    if (next !== line) {
      lines[i] = next
      changed = true
    }
  }
  if (changed) {
    fs.writeFileSync(file, lines.join('\n'))
    rewritten++
  }
}

// A function called from another Convex module serves the pages of that module
const moduleUnion = (mod) => {
  const out = new Set()
  for (const [name, v] of fnPages) {
    if (!name.startsWith(mod + ':')) continue
    if (v === 'any') return 'any'
    for (const h of v) out.add(h)
  }
  return out
}
for (let pass = 0; pass < 2; pass++) {
  for (const [mod, used] of moduleRefs) {
    const union = moduleUnion(mod)
    // (same-module calls too: an action on the Payouts page runs payouts' own steps)
    for (const name of used) {
      if (union === 'any') fnPages.set(name, 'any')
      else for (const h of union) addPage(name, h)
    }
  }
}

// ── 5. Write the map ─────────────────────────────────────────────────────────
const entries = []
for (const name of [...gated].sort()) {
  let rule
  if (FULL_ONLY.includes(name)) rule = '"full"'
  else if (PAGE_OVERRIDES[name]) rule = `[${PAGE_OVERRIDES[name].map((h) => pages.indexOf(h)).filter((i) => i >= 0).join(', ')}]`
  else {
    const v = name.endsWith(':*') ? moduleUnion(name.slice(0, -2)) : fnPages.get(name)
    if (v === 'any') rule = '"any"'
    else if (v && v.size) rule = `[${[...v].map((h) => pages.indexOf(h)).filter((i) => i >= 0).sort((a, b) => a - b).join(', ')}]`
    else rule = '[]'
  }
  entries.push(`  ${JSON.stringify(name)}: ${rule},`)
}
const out = `/**
 * Generated by scripts/admin-access/gen-function-pages.mjs from the admin pages and the Convex code.
 * Do not edit by hand: run the script after adding an admin page or an admin-only function.
 *
 * Which admin pages use each admin-only function. A restricted admin (adminAccess, not "everything")
 * may call a function only when one of its pages is ticked for them. "any": every admin (the console
 * shell); "full": full admins only; []: no page uses it, so full admins only.
 */
export const ADMIN_PAGES: readonly string[] = ${JSON.stringify(pages, null, 2)};

export const ADMIN_FUNCTION_PAGES: Readonly<Record<string, readonly number[] | "any" | "full">> = {
${entries.join('\n')}
};
`
fs.writeFileSync(path.join(convexDir, 'helpers/adminFunctionPages.ts'), out)
const restricted = entries.filter((e) => /\[\]/.test(e)).length
console.log(`admin access: ${pages.length} pages, ${gated.size} gated functions (${restricted} used by no page), ${rewritten} Convex files tagged`)
// For review: admin-only functions the console frame's code can reach. Each must be in SHELL_ANY or
// only rendered by AdminShell for admins who have its page.
const reach = [...gated].filter((n) => shellRefs.has(n) && !SHELL_ANY.includes(n))
if (reach.length) console.log(`shell can reach (check AdminShell guards): ${reach.join(', ')}`)

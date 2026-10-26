import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', '@babel', 'runtime')
const dest = path.join(root, 'miniprogram', 'miniprogram_npm', '@babel', 'runtime')

if (!fs.existsSync(src)) {
  console.warn('[sync-babel-runtime] skip: @babel/runtime not installed')
  process.exit(0)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.cpSync(src, dest, { recursive: true, force: true })
console.log('[sync-babel-runtime] copied to miniprogram/miniprogram_npm/@babel/runtime')

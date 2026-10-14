#!/usr/bin/env node
/** 将 dev-manifest/*.json 合成 bootstrap.ts（小程序不能 require json） */
import fs from 'fs'
import path from 'path'

const root = path.resolve('miniprogram/dev-manifest')
const meta = JSON.parse(fs.readFileSync(`${root}/meta.json`, 'utf8'))
const list = JSON.parse(fs.readFileSync(`${root}/list.json`, 'utf8'))
const details = JSON.parse(fs.readFileSync(`${root}/details-bundle.json`, 'utf8'))

const out = `${root}/bootstrap.ts`
const body = `/** 由 scripts/build-dev-manifest-ts.mjs 生成，勿手改 */
import type { ManifestMeta, TemplateDetail, TemplateListItem } from '../types/template'

export const DEV_META: ManifestMeta = ${JSON.stringify(meta, null, 2)}

export const DEV_LIST: { tag: string; page: number; total: number; items: TemplateListItem[] } = ${JSON.stringify(list, null, 2)}

export const DEV_DETAILS: Record<string, TemplateDetail> = ${JSON.stringify(details, null, 2)}
`
fs.writeFileSync(out, body)
console.log('wrote', out)

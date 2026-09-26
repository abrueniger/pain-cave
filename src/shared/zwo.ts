// Zwift workout (.zwo) parser. Tiny tag/attribute regexes: main has no DOMParser and the format is flat.
import type { Block, WorkoutCategory, WorkoutInput } from './types'

const CATEGORIES: WorkoutCategory[] = ['Recovery', 'Endurance', 'Tempo', 'Sweet spot', 'Threshold', 'VO2max', 'Anaerobic', 'Test']

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e]!).trim()

const text = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? unescape(m[1]) : ''
}

export function parseZwo(xml: string, fileName: string): WorkoutInput {
  xml = xml.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '')
  if (!xml.trim()) throw new Error('File is empty')
  const body = xml.match(/<workout_file\b[\s\S]*?<workout\b[^>]*>([\s\S]*?)<\/workout>/i)?.[1]
  if (body === undefined) throw new Error('Not a Zwift workout (.zwo) file')

  const blocks: Block[] = []
  for (const [, tag, attrs] of body.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const a: Record<string, number> = {}
    for (const [, k, , v1, v2] of attrs.matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) a[k.toLowerCase()] = Number(v1 ?? v2)
    const num = (k: string) => {
      if (!Number.isFinite(a[k])) throw new Error(`<${tag}> is missing a valid ${k} attribute`)
      return a[k]
    }
    const pct = (k: string) => Math.round(num(k) * 100)
    const dur = () => Math.round(num('duration'))
    switch (tag.toLowerCase()) {
      case 'steadystate':
        blocks.push({
          type: 'steady', durationS: dur(),
          watts: 'power' in a ? pct('power') : Math.round(((num('powerlow') + num('powerhigh')) / 2) * 100)
        })
        break
      case 'warmup':
      case 'ramp':
        blocks.push({ type: 'ramp', durationS: dur(), startWatts: pct('powerlow'), endWatts: pct('powerhigh') })
        break
      case 'cooldown': // files disagree on the order of PowerLow/PowerHigh; a cool-down always goes down
        blocks.push({
          type: 'ramp', durationS: dur(),
          startWatts: Math.max(pct('powerlow'), pct('powerhigh')), endWatts: Math.min(pct('powerlow'), pct('powerhigh'))
        })
        break
      case 'intervalst':
        blocks.push({
          type: 'intervals', repeat: Math.round(num('repeat')),
          onS: Math.round(num('onduration')), onWatts: pct('onpower'),
          offS: Math.round(num('offduration')), offWatts: pct('offpower')
        })
        break
      case 'freeride':
        blocks.push({ type: 'steady', durationS: dur(), watts: 55 })
        break
      case 'maxeffort':
        blocks.push({ type: 'steady', durationS: dur(), watts: 150 })
        break
    }
  }
  if (!blocks.length) throw new Error('Workout has no blocks')

  const cat = text(xml, 'category').toLowerCase()
  return {
    name: text(xml, 'name') || fileName.replace(/\.zwo$/i, ''),
    unit: 'ftp',
    category: CATEGORIES.find(c => c.toLowerCase() === cat) ?? null,
    blocks
  }
}

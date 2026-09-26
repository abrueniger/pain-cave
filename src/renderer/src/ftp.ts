// The rider's FTP (settings 'ftp'), cached app-wide. Components re-render when it changes.
import { useEffect, useState } from 'react'
import { ftpRecord } from '../../shared/gamification'
import { DEFAULT_FTP, type FtpRecordEntry } from '../../shared/types'
import { api } from './api'

let current: number | null = null
const subs = new Set<(ftp: number) => void>()

export async function loadFtp(): Promise<number> {
  current ??= Number(await api.settings.get('ftp')) || DEFAULT_FTP
  return current
}

export async function setFtp(watts: number) {
  current = watts
  // Raised above every earlier FTP (baseline: FTP at the first ride, else the default) → one more record
  const [stored, raw, rides] = await Promise.all([api.settings.get('ftp'), api.settings.get('ftpRecords'), api.rides.list()])
  const records: FtpRecordEntry[] = JSON.parse(raw ?? '[]')
  const first = rides.filter(r => r.ftp != null).at(-1)?.ftp ?? DEFAULT_FTP // list is newest first
  const record = ftpRecord(records, [first, Number(stored) || 0], watts, new Date().toISOString())
  if (record) await api.settings.set('ftpRecords', JSON.stringify([...records, record]))
  await api.settings.set('ftp', String(watts))
  subs.forEach((cb) => cb(watts))
}

export function useFtp(): number {
  const [ftp, set] = useState(current ?? DEFAULT_FTP)
  useEffect(() => {
    loadFtp().then(set)
    subs.add(set)
    return () => void subs.delete(set)
  }, [])
  return ftp
}

import type { Api } from '../../shared/types'
import { mockApi } from './mockApi'

declare global {
  interface Window {
    api?: Api
  }
}

/** Real IPC API in Electron; in-memory mock when the renderer runs in a plain browser (UI preview). */
export const api: Api = window.api ?? mockApi

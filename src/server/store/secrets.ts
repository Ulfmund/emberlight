import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { findPreset } from '@shared/presets'

/** Encrypts and decrypts strings. In the desktop app this is Electron's safeStorage (Windows DPAPI). */
export type Cipher = {
  available: boolean
  encrypt(plain: string): Promise<Buffer>
  decrypt(data: Buffer): Promise<string>
}

/**
 * API keys, one per preset. Stored encrypted in the app's user-data folder, never in the
 * project folder, and never sent back to the UI (the UI only learns whether a key exists).
 *
 * During development a key can also come from an environment variable (see .env.example).
 */
export class SecretStore {
  private file: string
  private keys: Record<string, string>

  constructor(dataDir: string, private cipher: Cipher) {
    this.file = join(dataDir, 'secrets.json')
    this.keys = this.load()
  }

  private load(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')).keys ?? {}
    } catch {
      return {}
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, keys: this.keys }, null, 2))
    renameSync(tmp, this.file)
  }

  get secure(): boolean {
    return this.cipher.available
  }

  async set(presetId: string, key: string) {
    const trimmed = key.trim()
    if (!trimmed) return this.delete(presetId)
    if (!this.cipher.available) {
      throw new Error('Secure key storage is not available on this system, so the key was not saved.')
    }
    this.keys[presetId] = (await this.cipher.encrypt(trimmed)).toString('base64')
    this.save()
  }

  /** Moves a saved key to another preset, unless that one already has its own. */
  move(from: string, to: string) {
    if (!this.keys[from] || this.keys[to]) return
    this.keys[to] = this.keys[from]
    delete this.keys[from]
    this.save()
  }

  delete(presetId: string) {
    delete this.keys[presetId]
    this.save()
  }

  /** The key for a preset: saved key first, then the development environment variable. */
  async get(presetId: string): Promise<string | undefined> {
    const stored = this.keys[presetId]
    if (stored && this.cipher.available) {
      try {
        return await this.cipher.decrypt(Buffer.from(stored, 'base64'))
      } catch {
        // Fall through to the environment (e.g. data copied from another PC can't be decrypted).
      }
    }
    const envName = findPreset(presetId)?.envKey
    return envName ? process.env[envName] || undefined : undefined
  }

  async has(presetId: string): Promise<boolean> {
    return Boolean(await this.get(presetId))
  }
}

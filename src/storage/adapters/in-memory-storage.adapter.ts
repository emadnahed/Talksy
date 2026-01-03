import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Session } from '@/session/interfaces/session.interface';
import { SessionStorage } from '../interfaces/session-storage.interface';

interface StoredSession {
  session: Session;
  expiresAt: number | null;
  timer: NodeJS.Timeout | null;
}

@Injectable()
export class InMemoryStorageAdapter
  implements SessionStorage, OnModuleDestroy
{
  private readonly logger = new Logger(InMemoryStorageAdapter.name);
  private readonly store: Map<string, StoredSession> = new Map();

  async get(key: string): Promise<Session | null> {
    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }

    // Check if expired
    if (stored.expiresAt !== null && Date.now() > stored.expiresAt) {
      await this.delete(key);
      return null;
    }

    return stored.session;
  }

  async set(key: string, value: Session, ttlMs?: number): Promise<void> {
    // Clear existing timer if any
    const existing = this.store.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    let timer: NodeJS.Timeout | null = null;

    if (ttlMs) {
      timer = setTimeout(() => {
        this.store.delete(key);
        this.logger.debug(`Session ${key} expired and removed from storage`);
      }, ttlMs);
    }

    this.store.set(key, {
      session: value,
      expiresAt,
      timer,
    });
  }

  async delete(key: string): Promise<boolean> {
    const stored = this.store.get(key);
    if (!stored) {
      return false;
    }

    if (stored.timer) {
      clearTimeout(stored.timer);
    }

    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const stored = this.store.get(key);
    if (!stored) {
      return false;
    }

    // Check if expired
    if (stored.expiresAt !== null && Date.now() > stored.expiresAt) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async keys(): Promise<string[]> {
    const validKeys: string[] = [];
    const now = Date.now();

    for (const [key, stored] of this.store.entries()) {
      if (stored.expiresAt === null || stored.expiresAt > now) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  async clear(): Promise<void> {
    // Clear all timers
    for (const stored of this.store.values()) {
      if (stored.timer) {
        clearTimeout(stored.timer);
      }
    }

    this.store.clear();
    this.logger.debug('All sessions cleared from storage');
  }

  async count(): Promise<number> {
    const validKeys = await this.keys();
    return validKeys.length;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  getType(): string {
    return 'in-memory';
  }

  onModuleDestroy(): void {
    // Clear all timers on shutdown
    for (const stored of this.store.values()) {
      if (stored.timer) {
        clearTimeout(stored.timer);
      }
    }
    this.store.clear();
    this.logger.log('InMemoryStorageAdapter destroyed, all timers cleared');
  }
}

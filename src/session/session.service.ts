import { Injectable, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Session,
  InternalSession,
  SessionStore,
} from './interfaces/session.interface';
import { SessionConfig } from './interfaces/session-config.interface';
import { SessionMessageDto, MessageRole } from './dto/session-message.dto';
import { SessionInfoDto } from './dto/session-info.dto';
import { SESSION_DEFAULTS } from './constants/session.constants';
import { CircularBuffer } from './utils/circular-buffer';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly store: SessionStore = {
    sessions: new Map<string, InternalSession>(),
    expirationTimers: new Map<string, NodeJS.Timeout>(),
    disconnectTimers: new Map<string, NodeJS.Timeout>(),
  };
  private readonly config: SessionConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.config = this.loadConfig();
    this.startCleanupInterval();
  }

  onModuleDestroy(): void {
    this.stopCleanupInterval();
    this.clearAllTimers();
  }

  private loadConfig(): SessionConfig {
    return {
      ttlMs:
        this.configService?.get<number>('SESSION_TTL_MS') ??
        SESSION_DEFAULTS.TTL_MS,
      maxHistoryLength:
        this.configService?.get<number>('SESSION_MAX_HISTORY') ??
        SESSION_DEFAULTS.MAX_HISTORY_LENGTH,
      cleanupIntervalMs:
        this.configService?.get<number>('SESSION_CLEANUP_INTERVAL_MS') ??
        SESSION_DEFAULTS.CLEANUP_INTERVAL_MS,
      disconnectGraceMs:
        this.configService?.get<number>('SESSION_DISCONNECT_GRACE_MS') ??
        SESSION_DEFAULTS.DISCONNECT_GRACE_MS,
    };
  }

  createSession(clientId: string): Session {
    const existingSession = this.store.sessions.get(clientId);
    if (existingSession && existingSession.status === 'active') {
      this.logger.warn(`Session already exists for client: ${clientId}`);
      return this.toExternalSession(existingSession);
    }

    const now = new Date();
    // Use CircularBuffer for O(1) message operations instead of O(n) Array.shift()
    const internalSession: InternalSession = {
      id: clientId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + this.config.ttlMs),
      status: 'active',
      conversationBuffer: new CircularBuffer<SessionMessageDto>(
        this.config.maxHistoryLength,
      ),
    };

    this.store.sessions.set(clientId, internalSession);
    this.setExpirationTimer(clientId);

    this.logger.log(`Session created: ${clientId}`);
    return this.toExternalSession(internalSession);
  }

  /**
   * Convert internal session (with CircularBuffer) to external session (with array)
   */
  private toExternalSession(internal: InternalSession): Session {
    return {
      id: internal.id,
      createdAt: internal.createdAt,
      lastActivityAt: internal.lastActivityAt,
      expiresAt: internal.expiresAt,
      status: internal.status,
      disconnectedAt: internal.disconnectedAt,
      conversationHistory: internal.conversationBuffer.toArray(),
      metadata: internal.metadata,
    };
  }

  getSession(clientId: string): Session | null {
    const internalSession = this.store.sessions.get(clientId);
    if (!internalSession) {
      return null;
    }

    if (this.isSessionExpired(internalSession)) {
      this.destroySession(clientId);
      return null;
    }

    return this.toExternalSession(internalSession);
  }

  /**
   * Get internal session (for internal use only)
   */
  private getInternalSession(clientId: string): InternalSession | null {
    const session = this.store.sessions.get(clientId);
    if (!session) {
      return null;
    }

    if (this.isSessionExpired(session)) {
      this.destroySession(clientId);
      return null;
    }

    return session;
  }

  destroySession(clientId: string): boolean {
    const session = this.store.sessions.get(clientId);
    if (!session) {
      return false;
    }

    this.clearExpirationTimer(clientId);
    this.clearDisconnectTimer(clientId);
    this.store.sessions.delete(clientId);

    this.logger.log(`Session destroyed: ${clientId}`);
    return true;
  }

  markDisconnected(clientId: string): boolean {
    const session = this.store.sessions.get(clientId);
    if (!session || session.status === 'disconnected') {
      return false;
    }

    session.status = 'disconnected';
    session.disconnectedAt = new Date();

    this.clearExpirationTimer(clientId);
    this.setDisconnectTimer(clientId);

    this.logger.log(`Session marked as disconnected: ${clientId}`);
    return true;
  }

  reconnectSession(clientId: string): Session | null {
    const session = this.store.sessions.get(clientId);
    if (!session || session.status !== 'disconnected') {
      return null;
    }

    this.clearDisconnectTimer(clientId);

    const now = new Date();
    session.status = 'active';
    session.lastActivityAt = now;
    session.expiresAt = new Date(now.getTime() + this.config.ttlMs);
    session.disconnectedAt = undefined;

    this.setExpirationTimer(clientId);

    this.logger.log(`Session reconnected: ${clientId}`);
    return this.toExternalSession(session);
  }

  hasSession(clientId: string): boolean {
    const session = this.store.sessions.get(clientId);
    if (!session) {
      return false;
    }
    if (this.isSessionExpired(session)) {
      return false;
    }
    return session.status === 'active';
  }

  hasDisconnectedSession(clientId: string): boolean {
    const session = this.store.sessions.get(clientId);
    if (!session) {
      return false;
    }
    return session.status === 'disconnected';
  }

  addMessage(
    clientId: string,
    role: MessageRole,
    content: string,
  ): SessionMessageDto | null {
    const session = this.getInternalSession(clientId);
    if (!session || session.status !== 'active') {
      this.logger.warn(`Cannot add message: session not found for ${clientId}`);
      return null;
    }

    const message = new SessionMessageDto(role, content);
    // O(1) push with automatic oldest-entry eviction (no more O(n) Array.shift())
    session.conversationBuffer.push(message);

    this.touchSession(clientId);

    return message;
  }

  getConversationHistory(clientId: string): SessionMessageDto[] {
    const session = this.getInternalSession(clientId);
    return session?.conversationBuffer.toArray() ?? [];
  }

  getSessionInfo(clientId: string): SessionInfoDto | null {
    const session = this.getInternalSession(clientId);
    if (!session) {
      return null;
    }

    return new SessionInfoDto(
      session.id,
      session.status,
      session.createdAt,
      session.lastActivityAt,
      session.expiresAt,
      session.conversationBuffer.length(),
      session.disconnectedAt,
    );
  }

  touchSession(clientId: string): boolean {
    const session = this.store.sessions.get(clientId);
    if (!session || session.status !== 'active') {
      return false;
    }

    const now = new Date();
    session.lastActivityAt = now;
    session.expiresAt = new Date(now.getTime() + this.config.ttlMs);

    this.setExpirationTimer(clientId);

    return true;
  }

  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.store.sessions.values()) {
      if (session.status === 'active' && !this.isSessionExpired(session)) {
        count++;
      }
    }
    return count;
  }

  getDisconnectedSessionCount(): number {
    let count = 0;
    for (const session of this.store.sessions.values()) {
      if (session.status === 'disconnected') {
        count++;
      }
    }
    return count;
  }

  clearAllSessions(): void {
    this.clearAllTimers();
    this.store.sessions.clear();
    this.logger.log('All sessions cleared');
  }

  getConfig(): SessionConfig {
    return { ...this.config };
  }

  /**
   * Force-expire a session (for testing purposes)
   * Sets the session's expiration time to the past
   */
  forceExpireSession(clientId: string): boolean {
    const session = this.store.sessions.get(clientId);
    if (!session) {
      return false;
    }
    session.expiresAt = new Date(Date.now() - 1000);
    return true;
  }

  private isSessionExpired(session: InternalSession): boolean {
    return new Date() > session.expiresAt;
  }

  private setExpirationTimer(clientId: string): void {
    this.clearExpirationTimer(clientId);

    const session = this.store.sessions.get(clientId);
    if (!session) return;

    const timeToExpire = session.expiresAt.getTime() - Date.now();

    const timer = setTimeout(
      () => {
        this.handleSessionExpiration(clientId);
      },
      Math.max(0, timeToExpire),
    );

    this.store.expirationTimers.set(clientId, timer);
  }

  private clearExpirationTimer(clientId: string): void {
    const timer = this.store.expirationTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.store.expirationTimers.delete(clientId);
    }
  }

  private setDisconnectTimer(clientId: string): void {
    this.clearDisconnectTimer(clientId);

    const timer = setTimeout(() => {
      this.handleDisconnectTimeout(clientId);
    }, this.config.disconnectGraceMs);

    this.store.disconnectTimers.set(clientId, timer);
  }

  private clearDisconnectTimer(clientId: string): void {
    const timer = this.store.disconnectTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.store.disconnectTimers.delete(clientId);
    }
  }

  private handleSessionExpiration(clientId: string): void {
    this.logger.log(`Session expired: ${clientId}`);
    this.destroySession(clientId);
  }

  private handleDisconnectTimeout(clientId: string): void {
    this.logger.log(`Disconnect grace period expired: ${clientId}`);
    this.destroySession(clientId);
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupIntervalMs);
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [clientId, session] of this.store.sessions) {
      if (now > session.expiresAt && session.status === 'active') {
        this.destroySession(clientId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  private clearAllTimers(): void {
    for (const timer of this.store.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.store.expirationTimers.clear();

    for (const timer of this.store.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.store.disconnectTimers.clear();
  }
}

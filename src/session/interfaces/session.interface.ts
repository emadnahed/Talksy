import { SessionMessageDto } from '../dto/session-message.dto';

export type SessionStatus = 'active' | 'disconnected';

export interface Session {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  status: SessionStatus;
  disconnectedAt?: Date;
  conversationHistory: SessionMessageDto[];
  metadata?: Record<string, unknown>;
}

export interface SessionStore {
  sessions: Map<string, Session>;
  expirationTimers: Map<string, NodeJS.Timeout>;
  disconnectTimers: Map<string, NodeJS.Timeout>;
}

import { SessionMessageDto } from '../dto/session-message.dto';
import { CircularBuffer } from '../utils/circular-buffer';

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

/**
 * Internal session with CircularBuffer for O(1) message operations
 */
export interface InternalSession extends Omit<Session, 'conversationHistory'> {
  conversationBuffer: CircularBuffer<SessionMessageDto>;
}

export interface SessionStore {
  sessions: Map<string, InternalSession>;
  expirationTimers: Map<string, NodeJS.Timeout>;
  disconnectTimers: Map<string, NodeJS.Timeout>;
}

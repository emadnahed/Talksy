import { SessionStatus } from '../interfaces/session.interface';

export class SessionInfoDto {
  sessionId: string;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  disconnectedAt?: string;
  messageCount: number;

  constructor(
    sessionId: string,
    status: SessionStatus,
    createdAt: Date,
    lastActivityAt: Date,
    expiresAt: Date,
    messageCount: number,
    disconnectedAt?: Date,
  ) {
    this.sessionId = sessionId;
    this.status = status;
    this.createdAt = createdAt.toISOString();
    this.lastActivityAt = lastActivityAt.toISOString();
    this.expiresAt = expiresAt.toISOString();
    this.messageCount = messageCount;
    if (disconnectedAt) {
      this.disconnectedAt = disconnectedAt.toISOString();
    }
  }
}

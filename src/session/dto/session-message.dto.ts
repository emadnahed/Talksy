export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export class SessionMessageDto {
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;

  constructor(role: MessageRole, content: string, timestamp?: number) {
    this.role = role;
    this.content = content;
    this.timestamp = timestamp ?? Date.now();
  }
}

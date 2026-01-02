export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export class SessionMessageDto {
  role: MessageRole;
  content: string;
  timestamp: number;

  constructor(role: MessageRole, content: string, timestamp?: number) {
    this.role = role;
    this.content = content;
    this.timestamp = timestamp ?? Date.now();
  }
}

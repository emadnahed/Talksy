import { MessageRole } from '../../session/dto/session-message.dto';

export class AIMessageDto {
  readonly role: MessageRole;
  readonly content: string;

  constructor(role: MessageRole, content: string) {
    this.role = role;
    this.content = content;
  }
}

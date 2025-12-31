import { IsString, IsNotEmpty } from 'class-validator';

export class UserMessageDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}

export interface AssistantResponseDto {
  text: string;
  timestamp: number;
}

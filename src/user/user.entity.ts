import { IUser, IUserPublic } from './interfaces/user.interface';

export class User implements IUser {
  id!: string;
  email!: string;
  passwordHash!: string;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<IUser>) {
    Object.assign(this, partial);
  }

  toPublic(): IUserPublic {
    return {
      id: this.id,
      email: this.email,
      createdAt: this.createdAt,
    };
  }
}

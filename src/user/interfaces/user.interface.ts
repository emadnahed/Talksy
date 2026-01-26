export interface IUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPublic {
  id: string;
  email: string;
  createdAt: Date;
}

export interface ICreateUser {
  email: string;
  password: string;
}

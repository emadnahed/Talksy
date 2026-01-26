import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IAuthUser } from '../interfaces/auth-user.interface';

export const CurrentUser = createParamDecorator(
  (data: keyof IAuthUser | undefined, ctx: ExecutionContext): IAuthUser | string => {
    const request = ctx.switchToHttp().getRequest();
    const user: IAuthUser = request.user;

    if (data) {
      return user[data];
    }

    return user;
  },
);

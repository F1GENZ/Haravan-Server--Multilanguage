import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ShopAuth = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const token = request.token;
    return token;
  }
);

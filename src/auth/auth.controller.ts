import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, AuthResponse, AuthTokens } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { IAuthUser } from './interfaces/auth-user.interface';
import { UserService } from '@/user/user.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<{ success: boolean }> {
    await this.authService.logout(refreshTokenDto.refreshToken);
    return { success: true };
  }

  @Get('me')
  async me(@Req() req: Request): Promise<{ id: string; email: string; createdAt?: Date }> {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authentication token provided');
    }

    const token = authHeader.split(' ')[1];
    const authUser = await this.authService.validateAccessToken(token);

    if (!authUser) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.userService.findById(authUser.userId);
    if (!user) {
      return { id: authUser.userId, email: authUser.email };
    }
    return user.toPublic();
  }
}

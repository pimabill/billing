import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, TokenPair } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { AcceptInvitationDto, AcceptSandboxLinkDto, CreateOrganisationDto, LoginDto, SwitchOrganisationDto } from './dto/login.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../common/auth/permissions';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import {
  RegisterResponse,
  LoginResponse,
  TokenPairResponse,
  MessageResponse,
  SessionResponse,
  InvitationInfoResponse,
  SandboxLinkResponse,
} from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new tenant',
    description:
      'Create a new tenant account with a company name. ' +
      'This provisions an isolated database, generates an API key, and returns JWT tokens.',
  })
  @ApiResponse({ status: 201, description: 'Tenant registered successfully.', type: RegisterResponse })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login as tenant',
    description: 'Authenticate with email and password. Returns an access token and refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Login successful.', type: LoginResponse })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Get('session')
  @ApiOperation({ summary: 'The signed-in person, their role in this organisation, and the organisations they belong to' })
  @ApiResponse({ status: 200, description: 'The session', type: SessionResponse })
  session(@Req() req: RequestWithTenant) {
    return this.authService.currentSession(req.tenant.id, this.member(req).userId);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('switch')
  @RequirePermission('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch to another organisation you belong to; returns new tokens' })
  @ApiResponse({ status: 200, description: 'Signed in to the other organisation', type: LoginResponse })
  switch(@Req() req: RequestWithTenant, @Body() dto: SwitchOrganisationDto) {
    return this.authService.switchOrganisation(this.member(req).userId, dto.tenantId);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('sandbox/link')
  @RequirePermission('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Live only: a short-lived link that opens your account, in this organisation, on the sandbox' })
  @ApiResponse({ status: 200, description: 'The link token, valid for two minutes', type: SandboxLinkResponse })
  sandboxLink(@Req() req: RequestWithTenant) {
    return this.authService.sandboxLink(req.tenant.id, this.member(req).userId);
  }

  @Public()
  @Post('sandbox/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sandbox only: open the account a live link vouches for; returns sandbox tokens' })
  @ApiResponse({ status: 200, description: 'Signed in to the sandbox', type: LoginResponse })
  @ApiResponse({ status: 401, description: 'The link is invalid or has expired' })
  acceptSandboxLink(@Body() dto: AcceptSandboxLinkDto) {
    return this.authService.acceptSandboxLink(dto.token);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('organisations')
  @RequirePermission('read')
  @ApiOperation({ summary: 'Create another organisation, owned by you; returns tokens for it' })
  @ApiResponse({ status: 201, description: 'The new organisation, signed in', type: RegisterResponse })
  createOrganisation(@Req() req: RequestWithTenant, @Body() dto: CreateOrganisationDto) {
    return this.authService.createAnotherOrganisation(this.member(req).userId, dto.companyName);
  }

  @Public()
  @Get('invitations/:token')
  @ApiOperation({ summary: 'What an invitation is for, before accepting it' })
  @ApiResponse({ status: 200, description: 'The invitation', type: InvitationInfoResponse })
  describeInvitation(@Param('token') token: string) {
    return this.authService.describeInvitation(token);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation; returns tokens for that organisation' })
  @ApiResponse({ status: 200, description: 'Joined and signed in', type: LoginResponse })
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto.token, dto.password, dto.name, dto.mfaCode);
  }

  /** Only dashboard sessions belong to a person. */
  private member(req: RequestWithTenant) {
    if (!req.member) throw new ForbiddenException('This needs a signed-in person, not an API key');
    return req.member;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchange a valid refresh token for a new access/refresh token pair.',
  })
  @ApiResponse({ status: 200, description: 'New token pair issued', type: TokenPairResponse })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshTokens(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Send a password reset email to the specified address. ' +
      'Always returns success to prevent email enumeration.',
  })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists', type: MessageResponse })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If an account exists with this email, a reset link has been sent' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Set a new password using the token received via email.',
  })
  @ApiResponse({ status: 200, description: 'Password reset successful', type: MessageResponse })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset successfully' };
  }
}

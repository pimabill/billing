import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../common/auth/permissions';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { MfaCodeDto, MfaDisableDto, MfaRequirementDto, MfaSignInDto } from './dto/login.dto';
import { LoginResponse } from './dto/auth-response.dto';

/** Two-step sign-in with an authenticator app. */
@ApiTags('Auth')
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
  ) {}

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish signing in with a code from your authenticator app, or a recovery code' })
  @ApiResponse({ status: 200, description: 'Signed in', type: LoginResponse })
  @ApiResponse({ status: 401, description: 'Wrong code, or the sign-in took more than five minutes' })
  verify(@Body() dto: MfaSignInDto) {
    return this.auth.completeMfaSignIn(dto.mfaToken, dto.code);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Get()
  @RequirePermission('read')
  @ApiOperation({ summary: 'Whether you use two-step sign-in, and how many recovery codes are left' })
  status(@Req() req: RequestWithTenant) {
    return this.mfa.status(this.member(req));
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('setup')
  @RequirePermission('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start: a secret and an otpauth:// link (for a QR code) to add to your authenticator app' })
  setup(@Req() req: RequestWithTenant) {
    return this.mfa.setup(this.member(req));
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('enable')
  @RequirePermission('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn it on with a code from the app; returns recovery codes, shown once' })
  enable(@Req() req: RequestWithTenant, @Body() dto: MfaCodeDto) {
    return this.mfa.enable(this.member(req), dto.code);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('disable')
  @RequirePermission('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Turn it off, with your password and a code' })
  async disable(@Req() req: RequestWithTenant, @Body() dto: MfaDisableDto) {
    await this.mfa.disable(this.member(req), dto.password, dto.code);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Post('recovery-codes')
  @RequirePermission('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'New recovery codes, replacing the old ones' })
  recoveryCodes(@Req() req: RequestWithTenant, @Body() dto: MfaCodeDto) {
    return this.mfa.regenerateRecoveryCodes(this.member(req), dto.code);
  }

  @Public()
  @UseGuards(TenantGuard)
  @Put('organisation')
  @RequirePermission('org.manage')
  @ApiOperation({ summary: 'Require two-step sign-in for everyone in this organisation' })
  require(@Req() req: RequestWithTenant, @Body() dto: MfaRequirementDto) {
    return this.mfa.setOrganisationRequirement(req.tenant.id, this.member(req), dto.required);
  }

  /** Only a signed-in person has a second step; an API key does not. */
  private member(req: RequestWithTenant): string {
    if (!req.member) throw new ForbiddenException('This needs a signed-in person, not an API key');
    return req.member.userId;
  }
}

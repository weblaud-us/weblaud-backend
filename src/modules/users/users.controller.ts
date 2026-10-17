import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  DefaultValuePipe,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from '@weblaud/upload-pro';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateEmailPreferencesDto } from './dto/update-email-preferences.dto';
import { Role } from 'src/common/enum/user.role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private readonly uploadService: UploadService,
  ) {}

  // Placed before POST '/' and ':id' routes only matters for path params,
  // not for these — kept together since both are the invite surface.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('invite')
  async invite(@Body() dto: InviteUserDto, @Req() req) {
    return await this.usersService.invite(dto, req.user._id.toString());
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/resend-invite')
  async resendInvite(@Param('id') id: string) {
    return await this.usersService.resendInvite(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return await this.usersService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBoolean =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return await this.usersService.findAll(page, limit, role, isActiveBoolean);
  }

  @Get('me')
  async getMe(@GetUser() user: User) {
    return await user;
  }

  /**
   * Staff picker for a PM assigning teammates to a project — must come
   * before ':id' below or "staff" would be parsed as a user id. Manager, not
   * just admin: a PM building their own team needs this without going
   * through an admin-only path.
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('staff')
  async findStaff() {
    return await this.usersService.findStaff();
  }

  /**
   * Self-service profile edit — any authenticated user, own record only
   * (there's no :id here on purpose; GetUser() is the only source of whose
   * record gets written). See UpdateProfileDto for why this is deliberately
   * narrower than the admin-only PATCH /users/:id below.
   */
  @Patch('me')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateMe(
    @GetUser() user: User,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    // A native <form encType="multipart/form-data"> submits an empty
    // file part for an <input type="file"> even when nothing was picked
    // (per the FormData-from-form spec) — Multer hands that through as a
    // truthy zero-byte file, not undefined. Without the size check, every
    // profile save with no new photo would "helpfully" overwrite the
    // avatar with an empty upload.
    if (avatar && avatar.size > 0) {
      const uploaded = await this.uploadService.upload(avatar, {
        folder: 'avatars',
      });
      dto.avatar = uploaded.url ?? uploaded.path ?? '';
    }
    return await this.usersService.updateProfile(user._id.toString(), dto);
  }

  /**
   * Self-service email-notification opt-outs. JSON body, unlike PATCH
   * /users/me above — that one's multipart because it also carries an
   * avatar upload; this one never does, so there's no reason to make the
   * frontend build a FormData for five booleans.
   */
  @Patch('me/email-preferences')
  async updateMyEmailPreferences(
    @GetUser() user: User,
    @Body() dto: UpdateEmailPreferencesDto,
  ) {
    return await this.usersService.updateEmailPreferences(
      user._id.toString(),
      dto,
    );
  }

  /**
   * The landing action behind every "Unsubscribe" link NotificationService
   * puts in a transactional email footer. Public: the whole point of an
   * unsubscribe link is that it works without asking the recipient to log
   * in first. uid + a signed token (not a session) prove who it's for — see
   * email-preference-token.util.ts.
   *
   * POST, not GET: corporate mail scanners (Outlook Safe Links, Mimecast, …)
   * fetch every link in an incoming email, so a GET that changes state
   * unsubscribed recipients who never clicked anything. The emailed link opens
   * a confirmation page on the website, whose button makes this call.
   */
  @Public()
  @Post('email-preferences/unsubscribe')
  async unsubscribe(
    @Query('uid') uid: string,
    @Query('token') token: string,
    @Query('category') category = 'all',
  ) {
    return await this.usersService.unsubscribeByToken(uid, token, category);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req,
  ) {
    return await this.usersService.adminUpdate(
      id,
      dto,
      req.user._id.toString(),
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return await this.usersService.remove(id, req.user._id.toString());
  }
}

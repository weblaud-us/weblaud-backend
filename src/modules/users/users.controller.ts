import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, DefaultValuePipe, ParseIntPipe
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBoolean =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return this.usersService.findAll(page, limit, role, isActiveBoolean);
  }

  @Get('me')
  getMe(@GetUser() user: User) {
    return user;
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: User) {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.MANAGER &&
      user._id.toString() !== id
    ) {
      return user;
    }

    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @GetUser() user: User,
  ) {
    if (user.role !== UserRole.ADMIN && user._id.toString() !== id) {
      return { message: 'Unauthorized' };
    }

    if (user.role !== UserRole.ADMIN && dto.role) {
      delete dto.role;
    }

    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}

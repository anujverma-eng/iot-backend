import { SetMetadata } from '@nestjs/common';
/** Skip all auth guards */
export const Public = () => SetMetadata('isPublic', true);
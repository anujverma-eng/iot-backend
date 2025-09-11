import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService, private usersSvc: UsersService) {
    const region = cfg.get<string>('cognito.region');
    const poolId = cfg.get<string>('cognito.userPoolId');
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;

    super({
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        jwksUri: `${issuer}/.well-known/jwks.json`,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  /* This runs on every request after JWT is verified */
  async validate(payload: any) {
    const user = await this.usersSvc.findOrCreateFromToken({
      sub: payload.sub,
      email: payload.email,
    }) as any;
    
    /* Return minimal user info - org context will be resolved by OrgContextGuard */
    return {
      userId: user._id.toString(),   
      sub: payload.sub,
      email: payload.email,
      role: user?.role,
      orgId: user?.orgId,
    };
  }
}

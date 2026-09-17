import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import env from '../../config/env';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export class AuthService {
  generateToken(id: any): string {
    return jwt.sign({ id }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });
  }

  async verifyGoogleToken(idToken: string) {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  }
}

export const authService = new AuthService();
export default authService;

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { decryptValue, encryptValue } from './crypto';
import { apiKeyPrefix } from '../config/sandbox';

@Injectable()
export class EncryptionService {
  private readonly keyHex: string;

  constructor(private readonly configService: ConfigService) {
    const keyHex = this.configService.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    this.keyHex = keyHex;
  }

  encrypt(text: string): string {
    return encryptValue(text, this.keyHex);
  }

  decrypt(encrypted: string): string {
    return decryptValue(encrypted, this.keyHex);
  }

  generateApiKey(): string {
    const randomPart: string = randomBytes(32).toString('hex');
    return `${apiKeyPrefix()}${randomPart}`;
  }

  generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }
}

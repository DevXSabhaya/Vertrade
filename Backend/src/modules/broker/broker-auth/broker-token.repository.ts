import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ConfigService } from '@core/config/config.service';
import { BrokerSession } from './entities/broker-session.entity';
import { BrokerToken } from './value-objects/broker-token.vo';
import type { IBrokerTokenRepository } from './interfaces/broker-token-repository.interface';
import {
  BrokerTokenDocumentSchema,
  type BrokerTokenDocument,
} from './broker-token.schema';
import { decrypt, encrypt } from './utils/encryption.util';

interface StoredTokenPayload {
  clientCode: string;
  accessToken: string;
  issuedAt: string;
}

@Injectable()
export class BrokerTokenRepository implements IBrokerTokenRepository {
  constructor(
    @InjectModel(BrokerTokenDocumentSchema.name)
    private readonly model: Model<BrokerTokenDocument>,
    private readonly configService: ConfigService,
  ) {}

  async save(
    userId: string,
    broker: string,
    session: BrokerSession,
  ): Promise<void> {
    const payload: StoredTokenPayload = {
      clientCode: session.clientCode,
      accessToken: session.token.getAccessToken(),
      issuedAt: session.issuedAt.toISOString(),
    };

    const encryptedPayload = encrypt(
      JSON.stringify(payload),
      this.configService.tokenEncryptionKey,
    );

    await this.model
      .findOneAndUpdate(
        { userId, broker },
        { $set: { encryptedPayload, expiresAt: session.expiresAt } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async find(userId: string, broker: string): Promise<BrokerSession | null> {
    const doc = await this.model.findOne({ userId, broker }).exec();
    if (!doc) {
      return null;
    }

    const decrypted = decrypt(
      doc.encryptedPayload,
      this.configService.tokenEncryptionKey,
    );
    const payload = JSON.parse(decrypted) as StoredTokenPayload;

    return new BrokerSession(
      payload.clientCode,
      new BrokerToken(payload.accessToken),
      new Date(payload.issuedAt),
      doc.expiresAt,
    );
  }

  async clear(userId: string, broker: string): Promise<void> {
    await this.model.deleteOne({ userId, broker }).exec();
  }
}

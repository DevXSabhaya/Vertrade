import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ConfigService } from '@core/config/config.service';
import {
  decrypt,
  encrypt,
} from '@modules/broker/broker-auth/utils/encryption.util';
import { BrokerId } from '../../registry/models/broker-id.enum';
import type { IBrokerAccountRepository } from './broker-account-repository.interface';
import type {
  BrokerAccount,
  BrokerAccountCredentials,
} from '../models/broker-account.model';
import {
  BrokerAccountDocumentSchema,
  type BrokerAccountDocument,
} from '../broker-account.schema';
import { BrokerAccountNotFoundException } from '../exceptions/broker-account-not-found.exception';

@Injectable()
export class BrokerAccountRepository implements IBrokerAccountRepository {
  constructor(
    @InjectModel(BrokerAccountDocumentSchema.name)
    private readonly model: Model<BrokerAccountDocument>,
    private readonly configService: ConfigService,
  ) {}

  async create(
    account: BrokerAccount,
    credentials: BrokerAccountCredentials,
  ): Promise<void> {
    const encryptedCredentials = encrypt(
      JSON.stringify(credentials),
      this.configService.tokenEncryptionKey,
    );
    await this.model.create({
      accountId: account.accountId,
      userId: account.userId,
      brokerId: account.brokerId,
      displayName: account.displayName,
      encryptedCredentials,
      isActive: account.isActive,
      lastConnectedAt: account.lastConnectedAt,
      lastError: account.lastError,
    });
  }

  async findAllByUser(userId: string): Promise<BrokerAccount[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((doc) => this.toDomain(doc));
  }

  async findById(
    userId: string,
    accountId: string,
  ): Promise<BrokerAccount | null> {
    const doc = await this.model.findOne({ userId, accountId }).exec();
    return doc ? this.toDomain(doc) : null;
  }

  async getCredentials(
    userId: string,
    accountId: string,
  ): Promise<BrokerAccountCredentials> {
    const doc = await this.model.findOne({ userId, accountId }).exec();
    if (!doc) {
      throw new BrokerAccountNotFoundException(accountId);
    }
    const decrypted = decrypt(
      doc.encryptedCredentials,
      this.configService.tokenEncryptionKey,
    );
    return JSON.parse(decrypted) as BrokerAccountCredentials;
  }

  async deactivateAllForUser(userId: string): Promise<void> {
    await this.model
      .updateMany({ userId, isActive: true }, { $set: { isActive: false } })
      .exec();
  }

  async markActive(userId: string, accountId: string): Promise<BrokerAccount> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId, accountId },
        {
          $set: {
            isActive: true,
            lastConnectedAt: new Date(),
            lastError: null,
          },
        },
        { new: true },
      )
      .exec();
    if (!doc) {
      throw new BrokerAccountNotFoundException(accountId);
    }
    return this.toDomain(doc);
  }

  async recordConnectionOutcome(
    userId: string,
    accountId: string,
    error: string | null,
  ): Promise<void> {
    await this.model
      .updateOne({ userId, accountId }, { $set: { lastError: error } })
      .exec();
  }

  async delete(userId: string, accountId: string): Promise<void> {
    await this.model.deleteOne({ userId, accountId }).exec();
  }

  private toDomain(doc: BrokerAccountDocument): BrokerAccount {
    return {
      accountId: doc.accountId,
      userId: doc.userId,
      brokerId: doc.brokerId as BrokerId,
      displayName: doc.displayName,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      lastConnectedAt: doc.lastConnectedAt,
      lastError: doc.lastError,
    };
  }
}

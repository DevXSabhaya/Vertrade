import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IPasswordResetRepository } from '../interfaces/password-reset-repository.interface';
import type { PasswordResetToken } from '../interfaces/password-reset-token.model';
import {
  PasswordResetTokenDocumentSchema,
  type PasswordResetTokenDocument,
} from '../schema/password-reset-token.schema';
import {
  PasswordResetRequestDocumentSchema,
  type PasswordResetRequestDocument,
} from '../schema/password-reset-request.schema';

@Injectable()
export class PasswordResetRepository implements IPasswordResetRepository {
  constructor(
    @InjectModel(PasswordResetTokenDocumentSchema.name)
    private readonly tokenModel: Model<PasswordResetTokenDocument>,
    @InjectModel(PasswordResetRequestDocumentSchema.name)
    private readonly requestModel: Model<PasswordResetRequestDocument>,
  ) {}

  async create(entry: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<PasswordResetToken> {
    const doc = await this.tokenModel.create({
      ...entry,
      attempts: 0,
      usedAt: null,
      verifiedAt: null,
      sessionTokenHash: null,
      sessionExpiresAt: null,
    });
    return this.toToken(doc);
  }

  async findLatestUnusedByUserId(
    userId: string,
  ): Promise<PasswordResetToken | null> {
    const doc = await this.tokenModel
      .findOne({ userId, usedAt: null })
      .sort({ createdAt: -1 })
      .exec();
    return doc ? this.toToken(doc) : null;
  }

  async findLatestVerifiedByUserId(
    userId: string,
  ): Promise<PasswordResetToken | null> {
    const doc = await this.tokenModel
      .findOne({ userId, usedAt: null, verifiedAt: { $ne: null } })
      .sort({ createdAt: -1 })
      .exec();
    return doc ? this.toToken(doc) : null;
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.tokenModel
      .updateOne({ _id: id }, { $inc: { attempts: 1 } })
      .exec();
  }

  async markUsed(id: string): Promise<void> {
    await this.tokenModel
      .updateOne({ _id: id }, { $set: { usedAt: new Date().toISOString() } })
      .exec();
  }

  async markVerified(
    id: string,
    sessionTokenHash: string,
    sessionExpiresAt: string,
  ): Promise<void> {
    await this.tokenModel
      .updateOne(
        { _id: id },
        {
          $set: {
            verifiedAt: new Date().toISOString(),
            sessionTokenHash,
            sessionExpiresAt,
          },
        },
      )
      .exec();
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.tokenModel.deleteMany({ userId }).exec();
  }

  async recordRequestAttempt(
    email: string,
    requestedAt: string,
  ): Promise<void> {
    await this.requestModel.create({ email, requestedAt });
  }

  async countRequestAttemptsSince(
    email: string,
    sinceIso: string,
  ): Promise<number> {
    return this.requestModel
      .countDocuments({ email, requestedAt: { $gte: sinceIso } })
      .exec();
  }

  async findLastRequestAt(email: string): Promise<string | null> {
    const doc = await this.requestModel
      .findOne({ email })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();
    return doc ? doc.requestedAt : null;
  }

  private toToken(doc: PasswordResetTokenDocument): PasswordResetToken {
    return {
      id: String(doc._id),
      userId: doc.userId,
      email: doc.email,
      codeHash: doc.codeHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt,
      attempts: doc.attempts,
      createdAt: doc.createdAt,
      verifiedAt: doc.verifiedAt,
      sessionTokenHash: doc.sessionTokenHash,
      sessionExpiresAt: doc.sessionExpiresAt,
    };
  }
}

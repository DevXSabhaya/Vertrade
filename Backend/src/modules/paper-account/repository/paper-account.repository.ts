import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IPaperAccountRepository } from '../interfaces/paper-account-repository.interface';
import type { PaperAccount } from '../models/paper-account.model';
import { PaperAccountStatus } from '../models/paper-account-status.enum';
import {
  PaperAccountDocumentSchema,
  type PaperAccountDocument,
} from '../schema/paper-account.schema';

@Injectable()
export class PaperAccountRepository implements IPaperAccountRepository {
  constructor(
    @InjectModel(PaperAccountDocumentSchema.name)
    private readonly model: Model<PaperAccountDocument>,
  ) {}

  async createIfMissing(
    userId: string,
    initialBalance: number,
    now: string,
  ): Promise<PaperAccount> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            userId,
            initialBalance,
            availableBalance: initialBalance,
            reservedMargin: 0,
            realizedPnl: 0,
            status: PaperAccountStatus.ACTIVE,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    return this.toAccount(doc);
  }

  async findByUserId(userId: string): Promise<PaperAccount | null> {
    const doc = await this.model.findOne({ userId }).exec();
    return doc ? this.toAccount(doc) : null;
  }

  async reserveMargin(
    userId: string,
    amount: number,
    now: string,
  ): Promise<PaperAccount | null> {
    const doc = await this.model
      .findOneAndUpdate(
        {
          userId,
          status: PaperAccountStatus.ACTIVE,
          availableBalance: { $gte: amount },
        },
        {
          $inc: { availableBalance: -amount, reservedMargin: amount },
          $set: { updatedAt: now },
        },
        { new: true },
      )
      .exec();
    return doc ? this.toAccount(doc) : null;
  }

  async releaseMargin(
    userId: string,
    amount: number,
    realizedPnlDelta: number,
    now: string,
  ): Promise<PaperAccount | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        {
          $inc: {
            availableBalance: amount + realizedPnlDelta,
            reservedMargin: -amount,
            realizedPnl: realizedPnlDelta,
          },
          $set: { updatedAt: now },
        },
        { new: true },
      )
      .exec();
    return doc ? this.toAccount(doc) : null;
  }

  async resetBalance(
    userId: string,
    initialBalance: number,
    now: string,
  ): Promise<PaperAccount | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            initialBalance,
            availableBalance: initialBalance,
            reservedMargin: 0,
            realizedPnl: 0,
            updatedAt: now,
          },
        },
        { new: true },
      )
      .exec();
    return doc ? this.toAccount(doc) : null;
  }

  private toAccount(doc: PaperAccountDocument): PaperAccount {
    return {
      userId: doc.userId,
      initialBalance: doc.initialBalance,
      availableBalance: doc.availableBalance,
      reservedMargin: doc.reservedMargin,
      realizedPnl: doc.realizedPnl,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

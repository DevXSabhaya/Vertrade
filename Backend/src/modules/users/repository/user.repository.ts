import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IUserRepository } from '../interfaces/user-repository.interface';
import type { User } from '../models/user.model';
import { UserDocumentSchema, type UserDocument } from '../schema/user.schema';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectModel(UserDocumentSchema.name)
    private readonly model: Model<UserDocument>,
  ) {}

  async save(user: User): Promise<void> {
    await this.model
      .updateOne(
        { userId: user.id },
        {
          $set: {
            userId: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            displayName: user.displayName,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLoginAt: user.lastLoginAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.model
      .findOne({ email: email.trim().toLowerCase() })
      .exec();
    return doc ? this.toUser(doc) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const doc = await this.model.findOne({ userId }).exec();
    return doc ? this.toUser(doc) : null;
  }

  private toUser(doc: UserDocument): User {
    return {
      id: doc.userId,
      email: doc.email,
      passwordHash: doc.passwordHash,
      displayName: doc.displayName,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      lastLoginAt: doc.lastLoginAt,
    };
  }
}

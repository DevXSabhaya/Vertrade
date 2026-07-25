import type { User } from '../models/user.model';

export interface IUserRepository {
  save(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
}

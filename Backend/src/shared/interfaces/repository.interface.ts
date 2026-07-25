export interface IRepository<TEntity> {
  findAll(): Promise<TEntity[]>;
}

import type { EntityManager } from "@mikro-orm/postgresql";
export async function rows<T>(
  em: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await em.execute(sql, params as never[])) as T[];
}
export async function one<T>(
  em: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await rows<T>(em, sql, params))[0];
}

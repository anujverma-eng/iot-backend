// src/common/utils/pagination.ts
export interface PageQuery { page?: string | number; limit?: string | number }
export interface PaginationMeta {
  total: number; page: number; limit: number; totalPages: number;
}

export const normPage = (q: PageQuery, def = 1)   =>
  Math.max(parseInt(String(q.page  ?? def),  10), 1);
export const normLimit = (q: PageQuery, def = 20) =>
  Math.min(Math.max(parseInt(String(q.limit ?? def), 10), 1), 100);

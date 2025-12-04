export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export function parsePagination(query: any): PaginationParams {
  const limit = Math.min(parseInt(query.limit || '20', 10), 100); // Max 100 items
  const offset = Math.max(parseInt(query.offset || '0', 10), 0);
  return { limit, offset };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total,
      hasMore: params.offset + data.length < total,
    },
  };
}


import { monday, logger } from '../core';

/**
 * monday API layer — implements the `Monday-api-service` contract (standard #4).
 * Single funnel: every GraphQL call goes through `query()`; components/hooks never
 * call the SDK directly. Auto-retries on rate limits; errors bubble up as MondayApiError.
 * Uses the shared monday SDK + logger from `core` (@axis/app-core).
 */

export class MondayApiError extends Error {
  code?: string;
  response?: unknown;
  constructor(message: string, opts: { code?: string; response?: unknown } = {}) {
    super(message);
    this.name = 'MondayApiError';
    this.code = opts.code;
    this.response = opts.response;
  }
}

export type ColumnValues = Record<string, unknown>;

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function query<T = unknown>(graphql: string, variables?: Record<string, unknown>): Promise<T> {
  let attempt = 0;
  for (;;) {
    const t0 = performance.now();
    logger.api('query', graphql, variables);
    try {
      const res = (await monday.api(graphql, { variables })) as { data?: T; errors?: unknown[] };
      logger.apiResponse('query', performance.now() - t0);
      if (res.errors?.length) {
        throw new MondayApiError('GraphQL errors', { response: res.errors });
      }
      return res.data as T;
    } catch (err) {
      const code = (err as { errorCode?: string })?.errorCode;
      const rateLimited = code === 'COMPLEXITY_BUDGET_EXHAUSTED' || code === 'RATE_LIMIT_EXCEEDED';
      if (rateLimited && attempt < MAX_RETRIES) {
        const backoff = 2 ** attempt * 500;
        logger.warn('mondayApi', `rate limited, retrying in ${backoff}ms`, { attempt });
        attempt += 1;
        await sleep(backoff);
        continue;
      }
      logger.apiError('query', err);
      throw err instanceof MondayApiError ? err : new MondayApiError(String((err as Error)?.message ?? err), { code });
    }
  }
}

export const mondayApi = {
  raw: monday,
  query,

  getBoard: (boardId: string | number) =>
    query(`query ($id: [ID!]) { boards(ids: $id) { id name columns { id title type settings } groups { id title } } }`, {
      id: [String(boardId)],
    }),

  /** Owner user ids of a board — used to grant settings access to board owners. */
  async getBoardOwners(boardId: string | number): Promise<{ id: string }[]> {
    const data = (await query(`query ($id: [ID!]) { boards(ids: $id) { owners { id } } }`, {
      id: [String(boardId)],
    })) as { boards?: { owners?: { id: string | number }[] }[] };
    return (data.boards?.[0]?.owners ?? []).map((o) => ({ id: String(o.id) }));
  },

  async getAllItems(boardId: string | number, columnIds?: string[]): Promise<unknown[]> {
    const items: unknown[] = [];
    let cursor: string | null = null;
    do {
      const data = (await query(
        `query ($id: [ID!], $cursor: String) {
           boards(ids: $id) {
             items_page(limit: 100, cursor: $cursor) {
               cursor
               items { id name column_values${columnIds ? `(ids: ${JSON.stringify(columnIds)})` : ''} { id type text value } }
             }
           }
         }`,
        { id: [String(boardId)], cursor },
      )) as { boards: { items_page: { cursor: string | null; items: unknown[] } }[] };
      const page = data.boards?.[0]?.items_page;
      if (page?.items) items.push(...page.items);
      cursor = page?.cursor ?? null;
    } while (cursor);
    return items;
  },

  createItem: (boardId: string | number, name: string, columnValues: ColumnValues = {}, groupId?: string) =>
    query(
      `mutation ($boardId: ID!, $name: String!, $cols: JSON, $groupId: String) {
         create_item(board_id: $boardId, item_name: $name, column_values: $cols, group_id: $groupId) { id }
       }`,
      { boardId: String(boardId), name, cols: JSON.stringify(columnValues), groupId },
    ),

  updateMultipleColumnValues: (boardId: string | number, itemId: string | number, columnValues: ColumnValues) =>
    query(
      `mutation ($boardId: ID!, $itemId: ID!, $cols: JSON!) {
         change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $cols) { id }
       }`,
      { boardId: String(boardId), itemId: String(itemId), cols: JSON.stringify(columnValues) },
    ),

  deleteItem: (itemId: string | number) =>
    query(`mutation ($id: ID!) { delete_item(item_id: $id) { id } }`, { id: String(itemId) }),

  // Global storage keyed by instanceId (matches the Axis convention — see SettingsContext).
  storageGet: (key: string) => monday.storage.getItem(key),
  storageSet: (key: string, value: string) => monday.storage.setItem(key, value),
};

export default mondayApi;

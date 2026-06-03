/**
 * usersService — resolves monday user ids into the app's `Employee` shape.
 * Single API funnel via `mondayApi.query`. `initials` and accent `color` are
 * derived locally (color is a deterministic, id-hashed pick from PALETTE).
 */
import { mondayApi } from './mondayApi';
import { logger } from '../core';
import type { Employee } from '../domain/types';

/** Accent palette — mirrors the prototype EMPLOYEE colors (data.jsx). */
const PALETTE = ['#0073ea', '#a25ddc', '#ff642e', '#00c875', '#579bfc', '#e2445c'] as const;

interface MondayUser {
  id: string | number;
  name?: string | null;
  title?: string | null;
  photo_thumb_small?: string | null;
}

/** First letters of up to 2 name words. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

/** Deterministic palette pick by hashing the id. */
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const USERS_QUERY = `query ($ids: [ID!]) {
  users(ids: $ids) { id name title photo_thumb_small }
}`;

export async function resolveUsers(ids: string[]): Promise<Employee[]> {
  if (!ids.length) return [];
  try {
    const data = await mondayApi.query<{ users: MondayUser[] | null }>(USERS_QUERY, {
      ids: ids.map((id) => String(id)),
    });
    const users = data.users ?? [];
    return users.map((u): Employee => {
      const id = String(u.id);
      const name = u.name ?? '';
      return {
        id,
        name,
        title: u.title ?? undefined,
        initials: initialsOf(name),
        color: colorFor(id),
        photoUrl: u.photo_thumb_small ?? undefined,
      };
    });
  } catch (err) {
    logger.error('usersService', 'resolveUsers failed', err);
    throw err;
  }
}

// Collection definitions: $jsonSchema validators, B-tree indexes and vector search indexes.
import { config, COLLECTIONS, INDEXES } from './config.js';

const id = { bsonType: ['int', 'long'] };
const ids = { bsonType: 'array', items: id };
const embedding = {
  bsonType: 'array', minItems: config.model.dims, maxItems: config.model.dims,
  items: { bsonType: ['double', 'int'] },
  description: `${config.model.dims}-dim normalised sentence embedding`,
};
const common = {
  embedding,
  source_text: { bsonType: 'string', minLength: 1 },
  source_hash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
  model: {
    bsonType: 'object', required: ['name', 'dims'],
    properties: { name: { bsonType: 'string' }, dims: { bsonType: 'int' } },
  },
  embedded_at: { bsonType: 'date' },
  updated_at: { bsonType: 'date' },
  language_codes: { bsonType: 'array', items: { bsonType: 'string', pattern: '^[a-z]{2}$' } },
  tag_ids: ids,
  region_id: { bsonType: ['int', 'long', 'null'] },
};
const required = ['_id', 'embedding', 'source_text', 'source_hash', 'model', 'embedded_at', 'updated_at', 'status'];

export const DEFINITIONS = [
  {
    name: COLLECTIONS.players,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [...required, 'user_id', 'username', 'game_ids', 'language_codes'],
        properties: {
          _id: id, user_id: id, username: { bsonType: 'string' },
          status: { enum: ['active', 'suspended'] },           // banned players are deleted
          game_ids: ids, platform_ids: ids,
          avg_rating: { bsonType: ['double', 'int', 'null'], minimum: 1, maximum: 5 },
          ...common,
        },
      },
    },
    indexes: [
      { key: { status: 1, game_ids: 1 }, name: 'ix_status_games' },
      { key: { updated_at: -1 }, name: 'ix_updated_at' },
    ],
    vectorIndex: {
      name: INDEXES.players,
      filters: ['_id', 'status', 'game_ids', 'platform_ids', 'language_codes', 'tag_ids', 'region_id', 'avg_rating'],
    },
  },
  {
    name: COLLECTIONS.sessions,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [...required, 'session_id', 'host_id', 'game_id', 'visibility', 'language_codes'],
        properties: {
          _id: id, session_id: id, host_id: id, game_id: id, mode_id: id, platform_id: id,
          status: { enum: ['open', 'full', 'in_progress'] },  // completed / cancelled sessions are deleted
          visibility: { enum: ['public', 'friends', 'invite'] },
          region_locked: { bsonType: 'bool' },
          needed_role_ids: ids,
          ...common,
        },
      },
    },
    indexes: [
      { key: { status: 1, game_id: 1 }, name: 'ix_status_game' },
      { key: { host_id: 1 }, name: 'ix_host' },
      { key: { updated_at: -1 }, name: 'ix_updated_at' },
    ],
    vectorIndex: {
      name: INDEXES.sessions,
      filters: ['_id', 'status', 'visibility', 'game_id', 'mode_id', 'platform_id', 'region_id', 'region_locked',
                'language_codes', 'tag_ids', 'needed_role_ids'],
    },
  },
];

export function vectorIndexDefinition(filters) {
  return {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: config.model.dims, similarity: 'cosine' },
      ...filters.map((path) => ({ type: 'filter', path })),
    ],
  };
}

// Database-level RBAC, mirroring the MySQL roles: the API reads, only the worker writes.
export const ROLES = [
  {
    role: 'pdVecReader',
    privileges: Object.values(COLLECTIONS).map((collection) => ({
      resource: { db: config.mongoDb, collection }, actions: ['find', 'listIndexes', 'listSearchIndexes'],
    })),
  },
  {
    role: 'pdVecWriter',
    privileges: Object.values(COLLECTIONS).map((collection) => ({
      resource: { db: config.mongoDb, collection },
      actions: ['find', 'insert', 'update', 'remove', 'listIndexes', 'listSearchIndexes'],
    })),
  },
];

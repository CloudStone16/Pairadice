// Runtime settings, all from environment variables. Credentials are never written to files.
const env = process.env;

export const config = {
  mongoUri: env.MONGO_URI ?? 'mongodb://localhost:27018/?directConnection=true',
  mongoDb: env.MONGO_DB ?? 'pairadice_vec',
  mysql: {
    host: env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(env.MYSQL_PORT ?? 3306),
    user: env.MYSQL_USER ?? 'root',
    password: env.MYSQL_PWD ?? env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE ?? 'pairadice',
  },
  // atlas = $vectorSearch index (Atlas / Atlas Local); brute = cosine in Node over the candidate docs
  vectorMode: env.VECTOR_MODE ?? 'atlas',
  model: { name: 'Xenova/all-MiniLM-L6-v2', dims: 384 },
  // phase B blend: final = vectorWeight * similarity + (1 - vectorWeight) * SQL rule score
  vectorWeight: Number(env.VECTOR_WEIGHT ?? 0.6),
};

export const COLLECTIONS = { players: 'player_embeddings', sessions: 'session_embeddings' };
export const INDEXES = { players: 'player_vec_idx', sessions: 'session_vec_idx' };

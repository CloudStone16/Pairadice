// Sentence embeddings with all-MiniLM-L6-v2 (384 dims, mean pooled, L2-normalised), run locally.
// The model is downloaded from Hugging Face on first use and cached under node_modules.
import { pipeline } from '@huggingface/transformers';
import { config } from './config.js';

let extractor;

async function getExtractor() {
  extractor ??= pipeline('feature-extraction', config.model.name, { dtype: 'fp32' });
  return extractor;
}

/** Embed one string or a batch; returns number[] or number[][]. */
export async function embed(texts) {
  const batch = Array.isArray(texts) ? texts : [texts];
  const fe = await getExtractor();
  const out = (await fe(batch, { pooling: 'mean', normalize: true })).tolist();
  return Array.isArray(texts) ? out : out[0];
}

/** Cosine similarity; vectors are already normalised, so this is the dot product. */
export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

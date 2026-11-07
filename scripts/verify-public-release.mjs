// Keep the existing identity, WASM, source ZIP and contract gates intact, then
// require affirmative scope approval. No publication or deployment is performed.
process.env.WEBCAD_DISTRIBUTION_SCOPE=process.argv[3]||'public-web';
await import('./verify-release.mjs');

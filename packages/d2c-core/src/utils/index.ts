/**
 * Cross-cutting utilities consumed by multiple d2c-core layers (preview,
 * semantic, future contract). Anything here must remain free of layer
 * dependencies — utils may not import from ir/, preview/, semantic/, etc.
 */
export * from './stable-json';

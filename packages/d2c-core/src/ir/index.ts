/**
 * Stable design IR layer. Keep provider-specific acquisition details out of
 * this barrel so Sketch, MasterGo, and future providers normalize into the same
 * schema and validation surface.
 */
export * from './version';
export * from './visual';
export * from './semantic';
export * from './schema';
export * from './views';
export * from './validate';

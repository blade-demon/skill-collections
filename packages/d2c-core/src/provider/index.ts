/**
 * Provider boundary helpers. Concrete providers live under `skills/*`; this
 * layer defines the shared port they use to turn raw artifacts into validated
 * design IR.
 */
export * from './port';
export * from './normalize-and-validate';

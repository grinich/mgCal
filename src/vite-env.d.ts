/// <reference types="vite/client" />

/**
 * Dev-only seed data, supplied by the `mgcal-dev-events` plugin in
 * vite.config.ts from the path in MGCAL_DEV_EVENTS. Always null in builds.
 */
declare module 'virtual:mgcal-dev-events' {
  const data: import('./dev/setup').RealData | null
  export default data
}

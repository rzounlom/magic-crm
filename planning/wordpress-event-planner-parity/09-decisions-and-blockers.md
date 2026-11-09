# 9. Decisions and blockers

1. Thank-you only after public submit; private calc for staff; no public packages.
2. WP calculator lands behind a tenant-scoped adapter; do not silently keep contradictory MagicCRM rules once WP-parity mode is enabled for a venue.
3. Generations is reference config only — no runtime tenant special-case by name/slug.
4. Production catalog prices and env vars are untouched.
5. Staff WP timer / autosave form is deferred.
6. No Prisma migration in the first slice.
7. Company and phone are required on the WP path (matching the plugin), even though the legacy wizard treats them as optional.

# Apply First

Copy these files into your latest original project, preserving paths. This is a modified-files-only package.

Recommended order:

1. Backup your current project.
2. Copy all files from this zip into the project root.
3. Rebuild/restart backend, python-worker, and mega-panel containers.
4. Run migrations/schema update if your workflow does not auto-apply `apps/backend/src/database/schema.sql`.
5. Run Python and backend tests if possible.
6. Trigger GICS Import from Mega Panel.

Do not delete existing project files except if a delete list is explicitly provided. This package has no required deleted files.

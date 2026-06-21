# Remove Obsolete CSE JavaScript/Mongoose Files

Your uploaded project still had the older JavaScript/Mongoose package copied under `apps/backend/src/modules/cse/` and `apps/backend/tests/cse/`.

Those files are not suitable for this real backend because this backend is TypeScript + PostgreSQL and does not use Mongoose.

## Fast cleanup

Run from project root:

```bash
node scripts/remove-obsolete-cse-js-files.mjs
```

## Manual cleanup

Delete every path listed in:

```text
docs/OBSOLETE_CSE_FILE_DELETE_MANIFEST.txt
```

## Final expected CSE module files

After cleanup, CSE implementation files should be TypeScript files under:

```text
apps/backend/src/modules/cse/*.ts
apps/backend/src/modules/cse/*.test.ts
```

There should be no old CSE `.js` files or old `apps/backend/tests/cse/*.js` tests.

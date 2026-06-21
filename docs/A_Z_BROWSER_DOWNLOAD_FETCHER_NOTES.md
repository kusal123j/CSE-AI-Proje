# CSE ALPHABETICAL Python HTTP Importer Notes

## Confirmed source rule

The importer uses only:

```text
https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
```

It must not fetch or open CSE tabs such as Gainers, Losers, Turnover, Trade Volume, Share Volume, Date Listed, or Type of Issue.

## Confirmed fetch rule

The importer uses Python HTTP requests only:

1. Fetch the CSE ALPHABETICAL listed-company directory page.
2. Parse HTML tables or embedded page data with BeautifulSoup/lxml.
3. Normalize listed-company rows.
4. Validate required company name and symbol fields.
5. Deduplicate by symbol.
6. Return normalized JSON to the Node backend.
7. Let the backend save companies, securities, snapshots, raw audit JSON, and fetch-run metadata.

No browser automation or browser fallback is included.

## Raw storage

The backend writes normalized audit output under:

```text
storage/raw/cse/alphabetical/YYYY-MM-DD/RUN_ID/merged-normalized.json
```

## Runtime requirements

Install backend and Python worker dependencies:

```bash
npm install
pip install -r apps/python-worker/requirements.txt
```

# CSE Data Source Rules

## Allowed source

```text
https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
```

## Forbidden sources

The importer must not fetch these CSE tabs/pages:

```text
DATE LISTED
TYPE OF ISSUE
TURNOVER
TRADE VOLUME
SHARE VOLUME
GAINERS
LOSERS
```

## Analytics rule

The system calculates internally:

```text
Gainers
Losers
Top turnover
Top trade volume
Top share volume
```

No separate ranking tabs are fetched.

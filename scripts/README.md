# ThatSoundLikeMe feedback analysis

`download-feedback` downloads feedback metadata from Vercel Blob, keeps the latest submission for each audio query, and produces analysis-ready data and a readable report. Audio can be downloaded too, but is skipped for ordinary statistical analysis.

## Run it

From the frontend repository root:

```bash
export BLOB_READ_WRITE_TOKEN="your-token"
uv run --project scripts download-feedback --metadata-only
```

The token should be the `BLOB_READ_WRITE_TOKEN` from the backend Vercel project. Prefer the environment variable over `--token`, because command arguments may be retained in shell history.

Options:

```text
--output-dir PATH  Output directory (default: ./feedback_data)
--metadata-only    Do not download participant audio
--force            Replace files already downloaded locally
--token TOKEN      Token override; the environment variable is safer
```

`feedback_data/` is excluded from Git because it contains participant data. Treat exports as research data and store or share them according to the project consent and data-management arrangements.

## Outputs

The `consolidated/` directory contains:

- `feedback_consolidated.json`: full, deduplicated query metadata.
- `feedback_consolidated.csv`: one row per unique audio query.
- `feedback_results.csv`: one row per returned result, including rating, route, rank, index ID, and index label.
- `stats.json`: machine-readable overall, per-index, per-rank, per-route, and daily statistics.
- `report.md`: a compact human-readable summary and index comparison table.

The analysis reports:

- unique queries and metadata updates;
- total rated/unrated results, likes, dislikes, rating coverage, and like rate;
- per-index query counts and rating outcomes;
- outcomes by result rank and route;
- daily query and rating counts;
- how many results do or do not have explicit index attribution.

Index comparisons use only stored `result_contexts.indexId` values. Pilot/dev-mode submissions include these values. Older and ordinary production submissions may not, so they remain unattributed rather than being assigned to the current default index retrospectively.

## Re-running

The downloader skips existing local files by default but always regenerates the consolidated outputs. Use `--force` if a blob with the same name must be downloaded again. Feedback updates have separate blob names and are discovered normally.

To include participant audio as well as metadata, omit `--metadata-only`:

```bash
uv run --project scripts download-feedback
```

## Tests

From the frontend repository root:

```bash
uv run --project scripts python -m unittest discover -s scripts/tests -v
```

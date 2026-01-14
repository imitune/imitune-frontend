# ImiTune Feedback Downloader

Download and consolidate feedback data from Vercel Blob Storage for the ImiTune project.

This script handles the complexity of downloading all feedback submissions, automatically deduplicating entries (keeping only the most recent version when users update their ratings), and generating consolidated outputs for analysis.

## Features

- ✅ Downloads all feedback metadata and audio files from Vercel Blob Storage
- 🔄 Automatically deduplicates entries by `audioId`, keeping only the most recent version
- 💾 Generates consolidated JSON and CSV outputs for easy analysis
- ⚡ Skips already-downloaded files by default (use `--force` to re-download)
- 📊 Provides statistics on likes, dislikes, and updates

## Quick Start

### Using uvx (Recommended)

The easiest way to run the script without installing anything:

```bash
# Set your Vercel Blob token
export BLOB_READ_WRITE_TOKEN="your_token_here"

# Run directly with uvx
uvx --from ./scripts download-feedback

# Or with custom output directory
uvx --from ./scripts download-feedback --output-dir ./my_feedback
```

### Using Python directly

```bash
# Install dependencies
cd scripts
pip install -r requirements.txt

# Run the script
export BLOB_READ_WRITE_TOKEN="your_token_here"
python download_feedback.py
```

## Usage

```bash
download-feedback [OPTIONS]

Options:
  --output-dir PATH    Output directory for downloaded files (default: ./feedback_data)
  --token TOKEN        Vercel Blob token (if not set via environment variable)
  --force              Force re-download even if files exist locally
  -h, --help           Show help message
```

## Environment Variables

- `BLOB_READ_WRITE_TOKEN` (required): Your Vercel Blob storage token

## Output Structure

The script creates the following directory structure:

```
feedback_data/
├── audio/                          # All query audio files
│   ├── feedback-audio-xxx.webm
│   └── ...
├── metadata/                       # All metadata JSON files
│   ├── feedback-meta-xxx.json
│   └── ...
└── consolidated/                   # Deduplicated & consolidated outputs
    ├── feedback_consolidated.json  # Full metadata in JSON format
    ├── feedback_consolidated.csv   # Easy-to-analyze CSV format
    └── stats.json                  # Summary statistics
```

## How Deduplication Works

When users update their ratings (like/dislike changes), the backend creates new metadata entries with the same `audioId` but more recent timestamps. This script:

1. Downloads all metadata files
2. Groups them by `audioId`
3. For each group, keeps only the entry with the most recent `createdAt` timestamp
4. Discards older versions

This ensures you always have the user's final decision without duplicate entries cluttering your dataset.

## CSV Output Format

The consolidated CSV file has the following columns:

| Column | Description |
|--------|-------------|
| `audioId` | Unique identifier for the query audio |
| `createdAt` | Timestamp of the (most recent) submission |
| `isUpdate` | Whether this was an update (true) or initial submission (false) |
| `url_1`, `url_2`, `url_3` | Freesound URLs for the 3 results |
| `rating_1`, `rating_2`, `rating_3` | Ratings (like/dislike/null) |
| `audioUrl` | URL to the query audio file in Vercel Blob Storage |

## Examples

### Basic usage
```bash
export BLOB_READ_WRITE_TOKEN="vercel_blob_xxx"
uvx --from ./scripts download-feedback
```

### Custom output directory
```bash
uvx --from ./scripts download-feedback --output-dir ~/Desktop/imitune_data
```

### Force re-download everything
```bash
uvx --from ./scripts download-feedback --force
```

### Pass token as argument
```bash
uvx --from ./scripts download-feedback --token "vercel_blob_xxx"
```

## Troubleshooting

### "Vercel Blob token not found"
Make sure you've set the `BLOB_READ_WRITE_TOKEN` environment variable or passed it via `--token`.

### "No blobs found"
- Verify your token has read permissions
- Check that feedback has been submitted to the app
- Ensure you're using the correct token for your Vercel project

## Development

The script is a single Python file (`download_feedback.py`) with minimal dependencies:
- `requests` - for HTTP requests
- `tqdm` - for progress bars

To modify the script, simply edit `download_feedback.py` and re-run it.

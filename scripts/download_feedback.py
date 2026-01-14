#!/usr/bin/env python3
"""
Download and consolidate feedback data from Vercel Blob Storage.

This script downloads all feedback metadata and audio files from Vercel Blob Storage,
automatically deduplicates by keeping only the most recent version for each unique audioId.

Usage:
    uvx --from imitune-feedback-downloader download-feedback [--output-dir ./feedback_data]
    
Or directly:
    python download_feedback.py [--output-dir ./feedback_data]
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from collections import defaultdict
import requests
from tqdm import tqdm


class FeedbackDownloader:
    """Download and consolidate feedback from Vercel Blob Storage."""
    
    def __init__(self, output_dir: Path, blob_token: Optional[str] = None):
        self.output_dir = output_dir
        self.blob_token = blob_token or os.getenv("BLOB_READ_WRITE_TOKEN")
        
        if not self.blob_token:
            raise ValueError(
                "Vercel Blob token not found. Set BLOB_READ_WRITE_TOKEN environment variable "
                "or pass it via --token argument."
            )
        
        # Create output directories
        self.audio_dir = output_dir / "audio"
        self.metadata_dir = output_dir / "metadata"
        self.consolidated_dir = output_dir / "consolidated"
        
        for dir_path in [self.audio_dir, self.metadata_dir, self.consolidated_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
    
    def list_blobs(self) -> List[Dict]:
        """List all blobs in Vercel Blob Storage."""
        print("📋 Fetching blob list from Vercel...")
        
        # Vercel Blob API endpoint for listing
        api_url = "https://blob.vercel-storage.com/"
        
        headers = {
            "Authorization": f"Bearer {self.blob_token}",
        }
        
        all_blobs = []
        cursor = None
        
        while True:
            params = {"limit": 1000}
            if cursor:
                params["cursor"] = cursor
            
            response = requests.get(api_url, headers=headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            blobs = data.get("blobs", [])
            all_blobs.extend(blobs)
            
            cursor = data.get("cursor")
            if not cursor:
                break
            
            print(f"   Retrieved {len(all_blobs)} blobs so far...")
        
        print(f"✅ Found {len(all_blobs)} total blobs")
        return all_blobs
    
    def download_file(self, url: str, output_path: Path, skip_existing: bool = True) -> bool:
        """Download a file from URL to output_path."""
        if skip_existing and output_path.exists():
            return False  # Skipped
        
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return True  # Downloaded
    
    def process_metadata(self, metadata_files: List[Path]) -> Dict[str, Dict]:
        """Process metadata files and group by audioId, keeping most recent."""
        print("\n📊 Processing metadata and deduplicating...")
        
        # Group by audioId
        by_audio_id = defaultdict(list)
        
        for meta_file in metadata_files:
            try:
                with open(meta_file, 'r') as f:
                    metadata = json.load(f)
                
                audio_id = metadata.get("audioId")
                if not audio_id:
                    print(f"⚠️  Warning: No audioId in {meta_file.name}, skipping")
                    continue
                
                # Parse timestamp
                created_at = metadata.get("createdAt")
                if created_at:
                    metadata["_timestamp"] = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    metadata["_timestamp"] = datetime.min
                
                metadata["_source_file"] = meta_file.name
                by_audio_id[audio_id].append(metadata)
                
            except Exception as e:
                print(f"⚠️  Error processing {meta_file.name}: {e}")
                continue
        
        # Keep only the most recent version for each audioId
        consolidated = {}
        duplicate_count = 0
        
        for audio_id, versions in by_audio_id.items():
            # Sort by timestamp (most recent first)
            versions.sort(key=lambda x: x["_timestamp"], reverse=True)
            most_recent = versions[0]
            consolidated[audio_id] = most_recent
            
            if len(versions) > 1:
                duplicate_count += len(versions) - 1
                print(f"   📝 {audio_id}: Found {len(versions)} versions, keeping most recent from {most_recent['createdAt']}")
        
        print(f"\n✅ Consolidated {len(metadata_files)} metadata files into {len(consolidated)} unique queries")
        if duplicate_count > 0:
            print(f"   🔄 Removed {duplicate_count} duplicate/outdated entries")
        
        return consolidated
    
    def generate_consolidated_output(self, consolidated: Dict[str, Dict]):
        """Generate consolidated JSON and CSV outputs."""
        print("\n💾 Generating consolidated output files...")
        
        # JSON output with full metadata
        json_output = self.consolidated_dir / "feedback_consolidated.json"
        with open(json_output, 'w') as f:
            json.dump(list(consolidated.values()), f, indent=2, default=str)
        print(f"   ✅ {json_output}")
        
        # CSV output for easy analysis
        csv_output = self.consolidated_dir / "feedback_consolidated.csv"
        with open(csv_output, 'w') as f:
            # Header
            f.write("audioId,createdAt,isUpdate,url_1,url_2,url_3,rating_1,rating_2,rating_3,audioUrl\n")
            
            # Rows
            for metadata in consolidated.values():
                audio_id = metadata.get("audioId", "")
                created_at = metadata.get("createdAt", "")
                is_update = metadata.get("isUpdate", False)
                urls = metadata.get("freesound_urls", [None, None, None])
                ratings = metadata.get("ratings", [None, None, None])
                audio_url = metadata.get("audioUrl", "")
                
                # Ensure we have exactly 3 entries
                urls = (urls + [None, None, None])[:3]
                ratings = (ratings + [None, None, None])[:3]
                
                # Escape and format
                row = [
                    audio_id,
                    created_at,
                    str(is_update),
                    urls[0] or "",
                    urls[1] or "",
                    urls[2] or "",
                    ratings[0] or "",
                    ratings[1] or "",
                    ratings[2] or "",
                    audio_url
                ]
                f.write(",".join(f'"{item}"' for item in row) + "\n")
        
        print(f"   ✅ {csv_output}")
        
        # Summary statistics
        stats = {
            "total_queries": len(consolidated),
            "with_likes": sum(1 for m in consolidated.values() if "like" in m.get("ratings", [])),
            "with_dislikes": sum(1 for m in consolidated.values() if "dislike" in m.get("ratings", [])),
            "updated_queries": sum(1 for m in consolidated.values() if m.get("isUpdate")),
            "timestamp": datetime.now().isoformat()
        }
        
        stats_output = self.consolidated_dir / "stats.json"
        with open(stats_output, 'w') as f:
            json.dump(stats, f, indent=2)
        print(f"   ✅ {stats_output}")
        
        print("\n📈 Statistics:")
        print(f"   Total unique queries: {stats['total_queries']}")
        print(f"   Queries with likes: {stats['with_likes']}")
        print(f"   Queries with dislikes: {stats['with_dislikes']}")
        print(f"   Updated queries: {stats['updated_queries']}")
    
    def run(self, skip_existing: bool = True):
        """Main execution flow."""
        print("🚀 Starting Vercel Blob feedback download...\n")
        
        # Step 1: List all blobs
        blobs = self.list_blobs()
        
        # Separate metadata and audio blobs
        metadata_blobs = [b for b in blobs if b["pathname"].startswith("feedback-meta-")]
        audio_blobs = [b for b in blobs if b["pathname"].startswith("feedback-audio-")]
        
        print(f"\n📦 Found {len(metadata_blobs)} metadata files and {len(audio_blobs)} audio files")
        
        # Step 2: Download metadata files
        print("\n⬇️  Downloading metadata files...")
        metadata_files = []
        downloaded = 0
        
        for blob in tqdm(metadata_blobs, desc="Metadata"):
            filename = Path(blob["pathname"]).name
            output_path = self.metadata_dir / filename
            
            if self.download_file(blob["url"], output_path, skip_existing):
                downloaded += 1
            
            metadata_files.append(output_path)
        
        if skip_existing:
            print(f"   ⬇️  Downloaded {downloaded} new files, skipped {len(metadata_blobs) - downloaded} existing")
        
        # Step 3: Download audio files
        print("\n⬇️  Downloading audio files...")
        downloaded = 0
        
        for blob in tqdm(audio_blobs, desc="Audio"):
            filename = Path(blob["pathname"]).name
            output_path = self.audio_dir / filename
            
            if self.download_file(blob["url"], output_path, skip_existing):
                downloaded += 1
        
        if skip_existing:
            print(f"   ⬇️  Downloaded {downloaded} new files, skipped {len(audio_blobs) - downloaded} existing")
        
        # Step 4: Process and consolidate metadata
        consolidated = self.process_metadata(metadata_files)
        
        # Step 5: Generate consolidated outputs
        self.generate_consolidated_output(consolidated)
        
        print(f"\n✅ All done! Output saved to: {self.output_dir.absolute()}")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Download and consolidate feedback data from Vercel Blob Storage",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Environment Variables:
  BLOB_READ_WRITE_TOKEN    Vercel Blob storage token (required)

Examples:
  # Download to default directory
  python download_feedback.py
  
  # Download to custom directory
  python download_feedback.py --output-dir ./my_feedback
  
  # Force re-download existing files
  python download_feedback.py --force
  
  # Using uvx
  uvx --from imitune-feedback-downloader download-feedback
        """
    )
    
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./feedback_data"),
        help="Output directory for downloaded files (default: ./feedback_data)"
    )
    
    parser.add_argument(
        "--token",
        type=str,
        help="Vercel Blob token (if not set in BLOB_READ_WRITE_TOKEN env var)"
    )
    
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-download even if files exist locally"
    )
    
    args = parser.parse_args()
    
    try:
        downloader = FeedbackDownloader(
            output_dir=args.output_dir,
            blob_token=args.token
        )
        downloader.run(skip_existing=not args.force)
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

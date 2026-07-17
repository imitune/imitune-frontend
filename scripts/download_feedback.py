#!/usr/bin/env python3
"""Download, consolidate, and analyse ThatSoundLikeMe feedback."""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

import requests
from tqdm import tqdm


def parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp, returning None for malformed values."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def new_metrics() -> Dict[str, int]:
    return {"results": 0, "rated": 0, "likes": 0, "dislikes": 0, "unrated": 0}


def add_rating(metrics: Dict[str, int], rating: Any) -> None:
    metrics["results"] += 1
    if rating == "like":
        metrics["rated"] += 1
        metrics["likes"] += 1
    elif rating == "dislike":
        metrics["rated"] += 1
        metrics["dislikes"] += 1
    else:
        metrics["unrated"] += 1


def finalise_metrics(metrics: Dict[str, int]) -> Dict[str, Any]:
    result: Dict[str, Any] = dict(metrics)
    result["rating_coverage"] = round(metrics["rated"] / metrics["results"], 4) if metrics["results"] else None
    result["like_rate"] = round(metrics["likes"] / metrics["rated"], 4) if metrics["rated"] else None
    return result


def public_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Remove downloader-only fields before writing consolidated participant data."""
    output = {key: value for key, value in metadata.items() if not key.startswith("_")}
    output["versionCount"] = metadata.get("_version_count", 1)
    return output


def iter_result_rows(consolidated: Dict[str, Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    """Yield one normalised row per returned search result."""
    for audio_id, metadata in consolidated.items():
        urls = metadata.get("freesound_urls") if isinstance(metadata.get("freesound_urls"), list) else []
        ratings = metadata.get("ratings") if isinstance(metadata.get("ratings"), list) else []
        contexts = metadata.get("result_contexts") if isinstance(metadata.get("result_contexts"), list) else []
        result_count = max(len(urls), len(ratings), len(contexts))

        for position in range(result_count):
            context = contexts[position] if position < len(contexts) and isinstance(contexts[position], dict) else {}
            rank = context.get("rank")
            if not isinstance(rank, int) or isinstance(rank, bool) or rank < 1:
                rank = position + 1

            yield {
                "audioId": audio_id,
                "createdAt": metadata.get("createdAt", ""),
                "isUpdate": bool(metadata.get("isUpdate")),
                "versionCount": metadata.get("_version_count", 1),
                "position": position + 1,
                "rank": rank,
                "route": context.get("route") if isinstance(context.get("route"), str) else "unknown",
                "indexId": context.get("indexId") if isinstance(context.get("indexId"), str) else "",
                "indexLabel": context.get("indexLabel") if isinstance(context.get("indexLabel"), str) else "",
                "freesoundUrl": urls[position] if position < len(urls) and isinstance(urls[position], str) else "",
                "rating": ratings[position] if position < len(ratings) and ratings[position] in ("like", "dislike") else "",
                "audioUrl": metadata.get("audioUrl", ""),
            }


def build_statistics(consolidated: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Build overall, rank, route, date, and explicitly attributed index statistics."""
    result_rows = list(iter_result_rows(consolidated))
    overall = new_metrics()
    by_rank: Dict[int, Dict[str, int]] = defaultdict(new_metrics)
    by_route: Dict[str, Dict[str, int]] = defaultdict(new_metrics)
    by_index: Dict[str, Dict[str, int]] = defaultdict(new_metrics)
    by_day: Dict[str, Dict[str, int]] = defaultdict(new_metrics)
    route_queries: Dict[str, Set[str]] = defaultdict(set)
    index_queries: Dict[str, Set[str]] = defaultdict(set)
    index_rated_queries: Dict[str, Set[str]] = defaultdict(set)
    index_like_queries: Dict[str, Set[str]] = defaultdict(set)
    index_dislike_queries: Dict[str, Set[str]] = defaultdict(set)
    index_labels: Dict[str, Set[str]] = defaultdict(set)
    index_routes: Dict[str, Set[str]] = defaultdict(set)
    explicit_index_results = 0
    context_results = 0

    for row in result_rows:
        rating = row["rating"]
        add_rating(overall, rating)
        add_rating(by_rank[row["rank"]], rating)
        add_rating(by_route[row["route"]], rating)
        route_queries[row["route"]].add(row["audioId"])

        day = str(row["createdAt"])[:10]
        if len(day) == 10:
            add_rating(by_day[day], rating)

        if row["route"] != "unknown" or row["indexId"]:
            context_results += 1
        if row["indexId"]:
            explicit_index_results += 1
            index_id = row["indexId"]
            add_rating(by_index[index_id], rating)
            index_queries[index_id].add(row["audioId"])
            if rating:
                index_rated_queries[index_id].add(row["audioId"])
            if rating == "like":
                index_like_queries[index_id].add(row["audioId"])
            elif rating == "dislike":
                index_dislike_queries[index_id].add(row["audioId"])
            index_routes[index_id].add(row["route"])
            if row["indexLabel"]:
                index_labels[index_id].add(row["indexLabel"])

    query_days: Dict[str, int] = defaultdict(int)
    timestamps: List[datetime] = []
    with_likes = 0
    with_dislikes = 0
    with_any_rating = 0
    explicit_index_query_ids: Set[str] = set()
    for audio_id, metadata in consolidated.items():
        ratings = metadata.get("ratings") if isinstance(metadata.get("ratings"), list) else []
        if "like" in ratings:
            with_likes += 1
        if "dislike" in ratings:
            with_dislikes += 1
        if "like" in ratings or "dislike" in ratings:
            with_any_rating += 1
        timestamp = parse_timestamp(metadata.get("createdAt"))
        if timestamp:
            timestamps.append(timestamp)
            query_days[timestamp.date().isoformat()] += 1
        contexts = metadata.get("result_contexts")
        if isinstance(contexts, list) and any(isinstance(item, dict) and isinstance(item.get("indexId"), str) and item.get("indexId") for item in contexts):
            explicit_index_query_ids.add(audio_id)

    index_output = {}
    for index_id in sorted(by_index):
        entry = finalise_metrics(by_index[index_id])
        entry.update({
            "label": sorted(index_labels[index_id])[0] if index_labels[index_id] else index_id,
            "labels_seen": sorted(index_labels[index_id]),
            "routes": sorted(index_routes[index_id]),
            "queries": len(index_queries[index_id]),
            "queries_with_rating": len(index_rated_queries[index_id]),
            "queries_with_like": len(index_like_queries[index_id]),
            "queries_with_dislike": len(index_dislike_queries[index_id]),
        })
        index_output[index_id] = entry

    day_output = {}
    for day in sorted(set(query_days) | set(by_day)):
        entry = finalise_metrics(by_day[day])
        entry["queries"] = query_days[day]
        day_output[day] = entry

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": 2,
        "generated_at": generated_at,
        "total_queries": len(consolidated),
        "total_metadata_versions": sum(int(item.get("_version_count", 1)) for item in consolidated.values()),
        "updated_queries": sum(1 for item in consolidated.values() if int(item.get("_version_count", 1)) > 1),
        "date_range": {
            "first": min(timestamps).isoformat() if timestamps else None,
            "last": max(timestamps).isoformat() if timestamps else None,
        },
        "queries": {
            "with_any_rating": with_any_rating,
            "with_likes": with_likes,
            "with_dislikes": with_dislikes,
            "with_explicit_index": len(explicit_index_query_ids),
        },
        "results": finalise_metrics(overall),
        "attribution": {
            "with_result_context": context_results,
            "with_explicit_index": explicit_index_results,
            "without_explicit_index": len(result_rows) - explicit_index_results,
        },
        "by_index": index_output,
        "by_rank": {str(rank): finalise_metrics(by_rank[rank]) for rank in sorted(by_rank)},
        "by_route": {
            route: {**finalise_metrics(by_route[route]), "queries": len(route_queries[route])}
            for route in sorted(by_route)
        },
        "by_day": day_output,
    }


def format_rate(value: Any) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def build_markdown_report(stats: Dict[str, Any]) -> str:
    results = stats["results"]
    attribution = stats["attribution"]
    lines = [
        "# ThatSoundLikeMe feedback report",
        "",
        f"Generated: {stats['generated_at']}",
        "",
        "## Overview",
        "",
        f"- Unique audio queries: {stats['total_queries']}",
        f"- Metadata versions: {stats['total_metadata_versions']} ({stats['updated_queries']} updated queries)",
        f"- Returned results: {results['results']}",
        f"- Rated results: {results['rated']} ({format_rate(results['rating_coverage'])} coverage)",
        f"- Likes: {results['likes']}; dislikes: {results['dislikes']} ({format_rate(results['like_rate'])} like rate among ratings)",
        f"- Results attributed to a named index: {attribution['with_explicit_index']}",
        f"- Results without an explicit index: {attribution['without_explicit_index']}",
        "",
        "## Index comparison",
        "",
    ]
    if stats["by_index"]:
        lines.extend([
            "| Index | Queries | Rated queries | Rated results | Likes | Dislikes | Like rate |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ])
        for index_id, entry in stats["by_index"].items():
            label = entry["label"]
            display = f"{label} (`{index_id}`)" if label != index_id else f"`{index_id}`"
            lines.append(
                f"| {display} | {entry['queries']} | {entry['queries_with_rating']} | {entry['rated']} | "
                f"{entry['likes']} | {entry['dislikes']} | {format_rate(entry['like_rate'])} |"
            )
    else:
        lines.append("No submissions with explicit index attribution were found.")

    lines.extend([
        "",
        "## Ratings by rank",
        "",
        "| Rank | Results | Rated | Likes | Dislikes | Like rate |",
        "|---:|---:|---:|---:|---:|---:|",
    ])
    for rank, entry in stats["by_rank"].items():
        lines.append(
            f"| {rank} | {entry['results']} | {entry['rated']} | {entry['likes']} | "
            f"{entry['dislikes']} | {format_rate(entry['like_rate'])} |"
        )
    lines.extend([
        "",
        "> Index statistics use only submissions carrying an explicit `indexId`. Older or ordinary production submissions are left unattributed rather than guessed.",
        "",
    ])
    return "\n".join(lines)


class FeedbackDownloader:
    """Download and consolidate feedback from Vercel Blob Storage."""

    def __init__(self, output_dir: Path, blob_token: Optional[str] = None):
        self.output_dir = output_dir
        self.blob_token = blob_token or os.getenv("BLOB_READ_WRITE_TOKEN")
        if not self.blob_token:
            raise ValueError("Vercel Blob token not found. Set BLOB_READ_WRITE_TOKEN or pass --token.")

        self.audio_dir = output_dir / "audio"
        self.metadata_dir = output_dir / "metadata"
        self.consolidated_dir = output_dir / "consolidated"
        for directory in (self.audio_dir, self.metadata_dir, self.consolidated_dir):
            directory.mkdir(parents=True, exist_ok=True)

    def list_blobs(self) -> List[Dict[str, Any]]:
        print("Fetching blob list from Vercel...")
        all_blobs: List[Dict[str, Any]] = []
        cursor = None
        while True:
            params: Dict[str, Any] = {"limit": 1000}
            if cursor:
                params["cursor"] = cursor
            response = requests.get(
                "https://blob.vercel-storage.com/",
                headers={"Authorization": f"Bearer {self.blob_token}"},
                params=params,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            all_blobs.extend(data.get("blobs", []))
            cursor = data.get("cursor")
            if not cursor:
                break
        print(f"Found {len(all_blobs)} total blobs")
        return all_blobs

    @staticmethod
    def download_file(url: str, output_path: Path, skip_existing: bool = True) -> bool:
        if skip_existing and output_path.exists():
            return False
        with requests.get(url, stream=True, timeout=60) as response:
            response.raise_for_status()
            with output_path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=8192):
                    output.write(chunk)
        return True

    def process_metadata(self, metadata_files: List[Path]) -> Dict[str, Dict[str, Any]]:
        print("Processing metadata and deduplicating...")
        by_audio_id: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for meta_file in metadata_files:
            try:
                with meta_file.open("r", encoding="utf-8") as handle:
                    metadata = json.load(handle)
                audio_id = metadata.get("audioId")
                if not isinstance(audio_id, str) or not audio_id:
                    print(f"Warning: no audioId in {meta_file.name}; skipping")
                    continue
                timestamp = parse_timestamp(metadata.get("createdAt"))
                metadata["_timestamp"] = timestamp.timestamp() if timestamp else float("-inf")
                metadata["_source_file"] = meta_file.name
                by_audio_id[audio_id].append(metadata)
            except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
                print(f"Warning: could not process {meta_file.name}: {error}")

        consolidated: Dict[str, Dict[str, Any]] = {}
        duplicate_count = 0
        for audio_id, versions in by_audio_id.items():
            versions.sort(key=lambda item: item["_timestamp"], reverse=True)
            latest = versions[0]
            if not str(latest.get("audioUrl", "")).startswith(("https://", "http://")):
                original_audio_url = next(
                    (
                        item.get("audioUrl")
                        for item in reversed(versions)
                        if str(item.get("audioUrl", "")).startswith(("https://", "http://"))
                    ),
                    None,
                )
                if original_audio_url:
                    latest["audioUrl"] = original_audio_url
            latest["_version_count"] = len(versions)
            consolidated[audio_id] = latest
            duplicate_count += len(versions) - 1
        print(f"Consolidated {len(metadata_files)} files into {len(consolidated)} unique queries ({duplicate_count} older versions removed)")
        return consolidated

    @staticmethod
    def restore_audio_urls(consolidated: Dict[str, Dict[str, Any]], audio_blobs: List[Dict[str, Any]]) -> int:
        """Reconnect missing/placeholder metadata URLs to the matching audio blob."""
        recovered = 0
        for audio_id, metadata in consolidated.items():
            if str(metadata.get("audioUrl", "")).startswith(("https://", "http://")):
                continue
            expected_prefix = f"feedback-audio-{audio_id}"
            match = next(
                (
                    blob.get("url")
                    for blob in audio_blobs
                    if Path(str(blob.get("pathname", ""))).name.startswith(expected_prefix)
                    and str(blob.get("url", "")).startswith(("https://", "http://"))
                ),
                None,
            )
            if match:
                metadata["audioUrl"] = match
                recovered += 1
        if recovered:
            print(f"Recovered {recovered} audio URLs from the blob listing")
        return recovered

    def generate_consolidated_output(self, consolidated: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        rows = list(iter_result_rows(consolidated))
        stats = build_statistics(consolidated)

        json_output = self.consolidated_dir / "feedback_consolidated.json"
        with json_output.open("w", encoding="utf-8") as handle:
            json.dump([public_metadata(item) for item in consolidated.values()], handle, indent=2)

        query_csv = self.consolidated_dir / "feedback_consolidated.csv"
        query_fields = ["audioId", "createdAt", "isUpdate", "versionCount", "resultCount", "routes", "indexIds", "audioUrl"]
        with query_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=query_fields)
            writer.writeheader()
            rows_by_query: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
            for row in rows:
                rows_by_query[row["audioId"]].append(row)
            for audio_id, metadata in consolidated.items():
                query_rows = rows_by_query[audio_id]
                writer.writerow({
                    "audioId": audio_id,
                    "createdAt": metadata.get("createdAt", ""),
                    "isUpdate": bool(metadata.get("isUpdate")),
                    "versionCount": metadata.get("_version_count", 1),
                    "resultCount": len(query_rows),
                    "routes": ";".join(sorted({row["route"] for row in query_rows})),
                    "indexIds": ";".join(sorted({row["indexId"] for row in query_rows if row["indexId"]})),
                    "audioUrl": metadata.get("audioUrl", ""),
                })

        result_csv = self.consolidated_dir / "feedback_results.csv"
        result_fields = ["audioId", "createdAt", "isUpdate", "versionCount", "position", "rank", "route", "indexId", "indexLabel", "freesoundUrl", "rating", "audioUrl"]
        with result_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=result_fields)
            writer.writeheader()
            writer.writerows(rows)

        stats_output = self.consolidated_dir / "stats.json"
        with stats_output.open("w", encoding="utf-8") as handle:
            json.dump(stats, handle, indent=2)

        report_output = self.consolidated_dir / "report.md"
        report_output.write_text(build_markdown_report(stats), encoding="utf-8")

        print(f"Wrote consolidated data and report to {self.consolidated_dir}")
        print(f"Unique queries: {stats['total_queries']}; rated results: {stats['results']['rated']}; explicit indices: {len(stats['by_index'])}")
        return stats

    def run(self, skip_existing: bool = True, metadata_only: bool = False) -> Dict[str, Any]:
        blobs = self.list_blobs()
        metadata_blobs = [blob for blob in blobs if blob.get("pathname", "").startswith("feedback-meta-")]
        audio_blobs = [blob for blob in blobs if blob.get("pathname", "").startswith("feedback-audio-")]
        print(f"Found {len(metadata_blobs)} metadata files and {len(audio_blobs)} audio files")

        metadata_files = []
        for blob in tqdm(metadata_blobs, desc="Metadata"):
            output_path = self.metadata_dir / Path(blob["pathname"]).name
            self.download_file(blob["url"], output_path, skip_existing)
            metadata_files.append(output_path)

        if not metadata_only:
            for blob in tqdm(audio_blobs, desc="Audio"):
                self.download_file(blob["url"], self.audio_dir / Path(blob["pathname"]).name, skip_existing)
        else:
            print("Skipping audio downloads (--metadata-only)")

        consolidated = self.process_metadata(metadata_files)
        self.restore_audio_urls(consolidated, audio_blobs)
        return self.generate_consolidated_output(consolidated)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and analyse ThatSoundLikeMe feedback")
    parser.add_argument("--output-dir", type=Path, default=Path("./feedback_data"))
    parser.add_argument("--token", help="Vercel Blob token; prefer BLOB_READ_WRITE_TOKEN to avoid shell history")
    parser.add_argument("--force", action="store_true", help="Download files even when a local copy exists")
    parser.add_argument("--metadata-only", action="store_true", help="Download metadata and generate statistics without participant audio")
    args = parser.parse_args()
    try:
        downloader = FeedbackDownloader(args.output_dir, args.token)
        downloader.run(skip_existing=not args.force, metadata_only=args.metadata_only)
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

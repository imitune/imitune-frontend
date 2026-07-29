import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from download_feedback import FeedbackDownloader, build_markdown_report, build_statistics


class FeedbackAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.downloader = FeedbackDownloader(self.root / "feedback_data", "test-token")

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_metadata(self, filename, payload):
        path = self.root / filename
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def sample_consolidated(self):
        old = self.write_metadata("old.json", {
            "audioId": "pilot-query",
            "createdAt": "2026-01-01T10:00:00Z",
            "audioUrl": "https://example.test/pilot.webm",
            "freesound_urls": ["https://freesound.org/s/1/"],
            "ratings": [None],
        })
        latest = self.write_metadata("latest.json", {
            "audioId": "pilot-query",
            "createdAt": "2026-01-02T10:00:00Z",
            "isUpdate": True,
            "audioUrl": "existing-audio-pilot-query",
            "freesound_urls": [
                "https://freesound.org/s/1/",
                "https://freesound.org/s/2/",
                "https://freesound.org/s/3/",
                "https://freesound.org/s/4/",
            ],
            "ratings": ["like", "dislike", "like", None],
            "result_contexts": [
                {"route": "dev", "indexId": "index-a", "indexLabel": "Model A", "rank": 1},
                {"route": "dev", "indexId": "index-a", "indexLabel": "Model A", "rank": 2},
                {"route": "dev", "indexId": "index-b", "indexLabel": "Model B", "rank": 1},
                {"route": "dev", "indexId": "index-b", "indexLabel": "Model B", "rank": 2},
            ],
        })
        ordinary = self.write_metadata("ordinary.json", {
            "audioId": "ordinary-query",
            "createdAt": "2026-01-03T10:00:00Z",
            "audioUrl": "https://example.test/ordinary.webm",
            "freesound_urls": [
                "https://freesound.org/s/5/",
                "https://freesound.org/s/6/",
                "https://freesound.org/s/7/",
                "https://freesound.org/s/8/",
            ],
            "ratings": ["dislike", None, None, None],
        })
        return self.downloader.process_metadata([old, latest, ordinary])

    def test_statistics_cover_indexes_ranks_updates_and_unattributed_results(self):
        consolidated = self.sample_consolidated()
        stats = build_statistics(consolidated)

        self.assertEqual(stats["total_queries"], 2)
        self.assertEqual(stats["total_metadata_versions"], 3)
        self.assertEqual(stats["updated_queries"], 1)
        self.assertEqual(stats["results"]["results"], 8)
        self.assertEqual(stats["results"]["rated"], 4)
        self.assertEqual(stats["results"]["likes"], 2)
        self.assertEqual(stats["results"]["dislikes"], 2)
        self.assertEqual(stats["results"]["like_rate"], 0.5)
        self.assertEqual(stats["attribution"]["with_explicit_index"], 4)
        self.assertEqual(stats["attribution"]["without_explicit_index"], 4)
        self.assertEqual(stats["by_index"]["index-a"]["queries"], 1)
        self.assertEqual(stats["by_index"]["index-a"]["queries_with_rating"], 1)
        self.assertEqual(stats["by_index"]["index-a"]["likes"], 1)
        self.assertEqual(stats["by_index"]["index-b"]["label"], "Model B")
        self.assertEqual(stats["by_rank"]["1"]["results"], 3)
        self.assertEqual(stats["normal_mode"]["queries"], 1)
        self.assertEqual(stats["normal_mode"]["inferred_queries"], 1)
        self.assertEqual(stats["normal_mode"]["results"], 4)
        self.assertEqual(stats["normal_mode"]["dislikes"], 1)
        self.assertEqual(stats["normal_mode"]["by_rank"]["1"]["results"], 1)
        self.assertEqual(stats["by_mode"]["dev"]["queries"], 1)
        self.assertEqual(stats["by_mode"]["dev"]["results"], 4)
        self.assertEqual(stats["by_day"]["2026-01-02"]["queries"], 1)
        self.assertEqual(consolidated["pilot-query"]["audioUrl"], "https://example.test/pilot.webm")

    def test_outputs_include_normalised_result_csv_and_report(self):
        stats = self.downloader.generate_consolidated_output(self.sample_consolidated())
        output = self.downloader.consolidated_dir

        with (output / "feedback_results.csv").open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows[0]["indexId"], "index-a")
        self.assertEqual(rows[0]["rank"], "1")

        consolidated = json.loads((output / "feedback_consolidated.json").read_text(encoding="utf-8"))
        self.assertEqual(len(consolidated), 2)
        self.assertEqual(consolidated[0]["versionCount"], 2)
        self.assertNotIn("_timestamp", consolidated[0])

        report = (output / "report.md").read_text(encoding="utf-8")
        self.assertEqual(report, build_markdown_report(stats))
        self.assertIn("Model A (`index-a`)", report)
        self.assertIn("## Normal versus dev mode", report)
        self.assertIn("## Normal/legacy ratings by rank", report)

    def test_missing_audio_url_can_be_recovered_from_blob_listing(self):
        consolidated = {
            "query-id": {
                "audioId": "query-id",
                "audioUrl": "existing-audio-query-id",
            }
        }
        blobs = [{
            "pathname": "feedback-audio-query-id-random-suffix.webm",
            "url": "https://blob.example.test/recording.webm",
        }]

        recovered = self.downloader.restore_audio_urls(consolidated, blobs)

        self.assertEqual(recovered, 1)
        self.assertEqual(consolidated["query-id"]["audioUrl"], blobs[0]["url"])

    def test_versioned_blobs_with_the_same_pathname_get_distinct_local_paths(self):
        first = {
            "pathname": "feedback-meta-query-id.json",
            "url": "https://store.public.blob.vercel-storage.com/first-version",
        }
        second = {
            "pathname": "feedback-meta-query-id.json",
            "url": "https://store.public.blob.vercel-storage.com/second-version",
        }

        first_path = self.downloader.blob_output_path(self.downloader.metadata_dir, first)
        second_path = self.downloader.blob_output_path(self.downloader.metadata_dir, second)

        self.assertNotEqual(first_path, second_path)
        self.assertEqual(first_path.parent, self.downloader.metadata_dir)
        self.assertEqual(first_path.suffix, ".json")
        self.assertEqual(first_path, self.downloader.blob_output_path(self.downloader.metadata_dir, first))


if __name__ == "__main__":
    unittest.main()

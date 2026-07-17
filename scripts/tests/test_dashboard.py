import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard import ASSET_DIR, ThreadingHTTPServer, consolidated_path, create_handler


class DashboardServerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.data_path = root / "feedback_consolidated.json"
        self.sample = [{
            "audioId": "query-id",
            "createdAt": "2026-07-17T12:00:00Z",
            "audioUrl": "https://blob.example.test/query.webm",
            "freesound_urls": ["https://freesound.org/s/123/"],
            "ratings": ["like"],
            "result_contexts": [None],
        }]
        self.data_path.write_text(json.dumps(self.sample), encoding="utf-8")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(self.data_path, ASSET_DIR))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def get(self, path):
        return urlopen(self.base_url + path, timeout=3)

    def test_serves_dashboard_data_and_security_headers(self):
        with self.get("/api/data") as response:
            payload = json.load(response)
            self.assertEqual(payload["queries"], self.sample)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])

        with self.get("/") as response:
            html = response.read().decode("utf-8")
            self.assertIn("Feedback dashboard", html)
            self.assertEqual(response.headers.get_content_type(), "text/html")

        with self.get("/app.js") as response:
            self.assertIn(b"normalizeQuery", response.read())

    def test_health_and_unknown_routes(self):
        with self.get("/health") as response:
            self.assertEqual(json.load(response), {"ok": True})
        with self.assertRaises(HTTPError) as error:
            self.get("/not-found")
        self.assertEqual(error.exception.code, 404)

    def test_consolidated_path_accepts_root_or_consolidated_directory(self):
        root = Path(self.temp_dir.name) / "root"
        nested = root / "consolidated"
        nested.mkdir(parents=True)
        nested_file = nested / "feedback_consolidated.json"
        nested_file.write_text("[]", encoding="utf-8")
        self.assertEqual(consolidated_path(root), nested_file)
        self.assertEqual(consolidated_path(nested), nested_file)


if __name__ == "__main__":
    unittest.main()

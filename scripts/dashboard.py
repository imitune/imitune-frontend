#!/usr/bin/env python3
"""Serve the local ThatSoundsLikeMe feedback dashboard."""

import argparse
import json
import threading
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Type
from urllib.parse import urlparse

from download_feedback import FeedbackDownloader


ASSET_DIR = Path(__file__).with_name("dashboard_assets")
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}
CSP = (
    "default-src 'self'; "
    "script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; media-src https:; frame-src https://freesound.org; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)


def consolidated_path(output_dir: Path) -> Path:
    """Resolve either an output root or a consolidated directory."""
    direct = output_dir / "feedback_consolidated.json"
    if direct.exists():
        return direct
    return output_dir / "consolidated" / "feedback_consolidated.json"


def load_queries(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError("feedback_consolidated.json must contain a JSON array")
    return data


def create_handler(data_path: Path, asset_dir: Path = ASSET_DIR) -> Type[BaseHTTPRequestHandler]:
    class DashboardHandler(BaseHTTPRequestHandler):
        server_version = "ThatSoundsLikeMeDashboard/1.0"

        def send_common_headers(self, content_type: str, length: int) -> None:
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")

        def send_bytes(self, content: bytes, content_type: str, status: HTTPStatus = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_common_headers(content_type, len(content))
            self.end_headers()
            self.wfile.write(content)

        def send_json(self, payload: Dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
            content = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_bytes(content, "application/json; charset=utf-8", status)

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            path = urlparse(self.path).path
            if path == "/health":
                self.send_json({"ok": True})
                return
            if path == "/api/data":
                try:
                    queries = load_queries(data_path)
                    modified = datetime.fromtimestamp(data_path.stat().st_mtime, timezone.utc).isoformat()
                    self.send_json({
                        "queries": queries,
                        "source": data_path.name,
                        "modifiedAt": modified,
                    })
                except (OSError, ValueError, json.JSONDecodeError) as error:
                    self.send_json({"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return
            asset = ASSETS.get(path)
            if asset:
                filename, content_type = asset
                try:
                    self.send_bytes((asset_dir / filename).read_bytes(), content_type)
                except OSError as error:
                    self.send_json({"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

        def log_message(self, format_string: str, *args: Any) -> None:
            return

    return DashboardHandler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the local ThatSoundsLikeMe feedback dashboard")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("./feedback_data"),
        help="Downloader output root or consolidated directory (default: ./feedback_data)",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Listening host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Listening port (default: 8765)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open the dashboard automatically")
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Allow binding beyond localhost; exposes research data to the local network",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh metadata from Vercel Blob before opening (requires BLOB_READ_WRITE_TOKEN)",
    )
    return parser


def main(argv: Optional[Any] = None) -> None:
    args = build_parser().parse_args(argv)
    if args.host not in ("127.0.0.1", "localhost") and not args.allow_network:
        raise SystemExit("Refusing a non-localhost bind without --allow-network; participant data must stay private.")
    if not 0 <= args.port <= 65535:
        raise SystemExit("--port must be between 0 and 65535")

    if args.refresh:
        FeedbackDownloader(args.data_dir).run(metadata_only=True)

    data_path = consolidated_path(args.data_dir)
    if not data_path.exists():
        raise SystemExit(
            f"Feedback data not found at {data_path}. Run download-feedback --metadata-only first, "
            "or start this command with --refresh."
        )

    server = ThreadingHTTPServer((args.host, args.port), create_handler(data_path))
    actual_host, actual_port = server.server_address[:2]
    browser_host = "127.0.0.1" if actual_host in ("0.0.0.0", "::") else actual_host
    url = f"http://{browser_host}:{actual_port}/"
    print(f"ThatSoundsLikeMe feedback dashboard: {url}")
    print(f"Data: {data_path.resolve()}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.25, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping dashboard.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue, ORIGIN};
use serde::Serialize;
use serde_json::{Value, json};
use std::time::Duration;
use tauri::{AppHandle, Manager, State, path::BaseDirectory};

const DEFAULT_BACKEND_BASE: &str = "https://imitune-backend-steel.vercel.app";
const DESKTOP_CORS_ORIGIN: &str = "https://thatsoundslike.me";
const SEARCH_ROUTE: &str = "/api/search";
const FEEDBACK_ROUTE: &str = "/api/feedback";
const SEARCH_PAYLOAD_LIMIT: usize = 512 * 1024;
const FEEDBACK_PAYLOAD_LIMIT: usize = 15 * 1024 * 1024;
const RESPONSE_LIMIT: usize = 2 * 1024 * 1024;

#[derive(Clone)]
struct BackendClient {
    client: reqwest::Client,
    base_url: String,
    client_version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitHeaders {
    limit: Option<String>,
    remaining: Option<String>,
    reset: Option<String>,
    retry_after: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiResponse {
    ok: bool,
    status: u16,
    status_text: String,
    data: Value,
    rate_limit: RateLimitHeaders,
}

impl BackendClient {
    fn new(client_version: String) -> Result<Self, String> {
        let configured_base =
            std::env::var("BACKEND_BASE").unwrap_or_else(|_| DEFAULT_BACKEND_BASE.to_owned());
        Self::for_base_url(&configured_base, client_version)
    }

    fn for_base_url(configured_base: &str, client_version: String) -> Result<Self, String> {
        let base_url = normalize_backend_base(configured_base)?;
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(60))
            .https_only(
                !base_url.starts_with("http://localhost")
                    && !base_url.starts_with("http://127.0.0.1"),
            )
            .build()
            .map_err(|error| format!("Could not initialize the HTTP client: {error}"))?;

        Ok(Self {
            client,
            base_url,
            client_version,
        })
    }

    async fn post(&self, route: &str, payload: Value, payload_limit: usize) -> ApiResponse {
        let body = match serde_json::to_vec(&payload) {
            Ok(body) if body.len() <= payload_limit => body,
            Ok(body) => {
                return local_error(format!(
                    "The API payload is too large ({} bytes).",
                    body.len()
                ));
            }
            Err(_) => return local_error("The API payload could not be serialized."),
        };

        let request = self
            .client
            .post(format!("{}{}", self.base_url, route))
            .header(ACCEPT, "application/json")
            .header(CONTENT_TYPE, "application/json")
            .header(ORIGIN, DESKTOP_CORS_ORIGIN)
            .header(
                HeaderName::from_static("x-imitune-client"),
                format!("tauri/{}", self.client_version),
            )
            .body(body)
            .send()
            .await;

        let mut response = match request {
            Ok(response) => response,
            Err(error) => {
                return local_error(if error.is_timeout() {
                    "The service took too long to respond. Please try again."
                } else {
                    "The service could not be reached. Check your internet connection and try again."
                });
            }
        };

        let status = response.status();
        let status_text = status.canonical_reason().unwrap_or_default().to_owned();
        let headers = response.headers().clone();
        if response
            .content_length()
            .is_some_and(|length| length > RESPONSE_LIMIT as u64)
        {
            return local_error("The service returned an unexpectedly large response.");
        }

        let mut contents = Vec::with_capacity(
            response
                .content_length()
                .unwrap_or_default()
                .min(RESPONSE_LIMIT as u64) as usize,
        );
        loop {
            let chunk = match response.chunk().await {
                Ok(Some(chunk)) => chunk,
                Ok(None) => break,
                Err(_) => return local_error("The service response could not be read."),
            };
            if contents.len().saturating_add(chunk.len()) > RESPONSE_LIMIT {
                return local_error("The service returned an unexpectedly large response.");
            }
            contents.extend_from_slice(&chunk);
        }
        let data = if contents.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&contents).unwrap_or_else(
                |_| json!({ "error": String::from_utf8_lossy(&contents).into_owned() }),
            )
        };

        ApiResponse {
            ok: status.is_success(),
            status: status.as_u16(),
            status_text,
            data,
            rate_limit: rate_limit_headers(&headers),
        }
    }
}

fn normalize_backend_base(raw_url: &str) -> Result<String, String> {
    let mut parsed =
        reqwest::Url::parse(raw_url).map_err(|_| "BACKEND_BASE is not a valid URL.".to_owned())?;
    let is_local_http =
        parsed.scheme() == "http" && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1"));

    if parsed.scheme() != "https" && !is_local_http {
        return Err(
            "BACKEND_BASE must use HTTPS (HTTP is only allowed for localhost development)."
                .to_owned(),
        );
    }
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(
            "BACKEND_BASE must not contain credentials, a query, or a fragment.".to_owned(),
        );
    }

    parsed.set_path("");
    Ok(parsed.as_str().trim_end_matches('/').to_owned())
}

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value: &HeaderValue| value.to_str().ok())
        .map(str::to_owned)
}

fn rate_limit_headers(headers: &HeaderMap) -> RateLimitHeaders {
    RateLimitHeaders {
        limit: header_value(headers, "x-ratelimit-limit"),
        remaining: header_value(headers, "x-ratelimit-remaining"),
        reset: header_value(headers, "x-ratelimit-reset"),
        retry_after: header_value(headers, "retry-after"),
    }
}

fn local_error(message: impl Into<String>) -> ApiResponse {
    ApiResponse {
        ok: false,
        status: 0,
        status_text: String::new(),
        data: json!({ "error": message.into() }),
        rate_limit: RateLimitHeaders {
            limit: None,
            remaining: None,
            reset: None,
            retry_after: None,
        },
    }
}

#[tauri::command]
async fn search(
    embedding: Vec<f32>,
    backend: State<'_, BackendClient>,
) -> Result<ApiResponse, String> {
    Ok(backend
        .post(
            SEARCH_ROUTE,
            json!({ "embedding": embedding }),
            SEARCH_PAYLOAD_LIMIT,
        )
        .await)
}

#[tauri::command]
async fn feedback(
    payload: Value,
    backend: State<'_, BackendClient>,
) -> Result<ApiResponse, String> {
    Ok(backend
        .post(FEEDBACK_ROUTE, payload, FEEDBACK_PAYLOAD_LIMIT)
        .await)
}

#[tauri::command]
fn open_external(raw_url: String) -> Result<bool, String> {
    let parsed = reqwest::Url::parse(&raw_url).map_err(|_| "Invalid external URL.".to_owned())?;
    if parsed.scheme() != "https" {
        return Err("Only HTTPS external links are allowed.".to_owned());
    }
    open::that(parsed.as_str())
        .map(|_| true)
        .map_err(|error| format!("Could not open the external link: {error}"))
}

fn document_filename(document: &str) -> Option<&'static str> {
    match document {
        "participant-information" => Some("participant_information_sheet.pdf"),
        "consent-form" => Some("consent_form.pdf"),
        _ => None,
    }
}

#[tauri::command]
fn open_document(app: AppHandle, document: String) -> Result<bool, String> {
    let filename =
        document_filename(&document).ok_or_else(|| "Unknown bundled document.".to_owned())?;
    let path = app
        .path()
        .resolve(format!("documents/{filename}"), BaseDirectory::Resource)
        .map_err(|error| format!("Could not resolve the bundled document: {error}"))?;
    open::that(path)
        .map(|_| true)
        .map_err(|error| format!("Could not open the bundled document: {error}"))
}

#[tauri::command]
fn open_microphone_settings() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    let settings_url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
    #[cfg(target_os = "windows")]
    let settings_url = "ms-settings:privacy-microphone";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Ok(false);

    open::that(settings_url)
        .map(|_| true)
        .map_err(|error| format!("Could not open microphone settings: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let backend = BackendClient::new(app.package_info().version.to_string())
                .map_err(std::io::Error::other)?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search,
            feedback,
            open_external,
            open_document,
            open_microphone_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ThatSoundLikeMe");
}

#[cfg(test)]
mod tests {
    use super::{
        BackendClient, SEARCH_PAYLOAD_LIMIT, SEARCH_ROUTE, document_filename,
        normalize_backend_base,
    };
    use serde_json::json;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
        time::Duration,
    };

    #[test]
    fn backend_requires_https_except_for_local_development() {
        assert_eq!(
            normalize_backend_base("https://api.example.test/").unwrap(),
            "https://api.example.test"
        );
        assert_eq!(
            normalize_backend_base("http://localhost:3000/").unwrap(),
            "http://localhost:3000"
        );
        assert!(normalize_backend_base("http://api.example.test").is_err());
    }

    #[test]
    fn backend_rejects_ambiguous_base_urls() {
        assert!(normalize_backend_base("https://user@example.test").is_err());
        assert!(normalize_backend_base("https://example.test?route=other").is_err());
    }

    #[test]
    fn only_known_research_documents_can_be_opened() {
        assert_eq!(
            document_filename("participant-information"),
            Some("participant_information_sheet.pdf")
        );
        assert_eq!(document_filename("consent-form"), Some("consent_form.pdf"));
        assert_eq!(document_filename("../../secret"), None);
    }

    #[tokio::test]
    async fn search_uses_the_fixed_route_and_preserves_rate_limit_metadata() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (request_sender, request_receiver) = mpsc::channel();

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request_bytes = vec![0_u8; 16 * 1024];
            let bytes_read = stream.read(&mut request_bytes).unwrap();
            request_sender
                .send(String::from_utf8_lossy(&request_bytes[..bytes_read]).into_owned())
                .unwrap();

            let body = r#"{"error":"Too many requests","retryAfter":42}"#;
            write!(
                stream,
                "HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\nContent-Length: {}\r\nX-RateLimit-Limit: 10\r\nX-RateLimit-Remaining: 0\r\nRetry-After: 42\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body,
            )
            .unwrap();
        });

        let backend =
            BackendClient::for_base_url(&format!("http://{address}"), "test".to_owned()).unwrap();
        let response = backend
            .post(
                SEARCH_ROUTE,
                json!({ "embedding": [0.25, -0.5] }),
                SEARCH_PAYLOAD_LIMIT,
            )
            .await;
        server.join().unwrap();

        let request = request_receiver.recv().unwrap().to_ascii_lowercase();
        assert!(request.starts_with("post /api/search http/1.1"));
        assert!(request.contains("origin: https://thatsoundslike.me"));
        assert!(request.contains("x-imitune-client: tauri/test"));
        assert!(request.contains(r#"{"embedding":[0.25,-0.5]}"#));
        assert!(!response.ok);
        assert_eq!(response.status, 429);
        assert_eq!(response.rate_limit.limit.as_deref(), Some("10"));
        assert_eq!(response.rate_limit.remaining.as_deref(), Some("0"));
        assert_eq!(response.rate_limit.retry_after.as_deref(), Some("42"));
    }
}

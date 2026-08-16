use std::fs::OpenOptions;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, RunEvent};

const DEFAULT_PORT: u16 = 47832;

struct ServerProcess(Mutex<Option<Child>>);

fn sidecar_node() -> PathBuf {
    let mut path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    path.pop();
    if cfg!(windows) {
        path.push("node.exe");
    } else {
        path.push("node");
    }
    path
}

fn origin(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if port_open(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn resolve_port() -> u16 {
    if port_open(DEFAULT_PORT) {
        return DEFAULT_PORT;
    }
    DEFAULT_PORT
}

fn js_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn set_splash_status(app: &AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!(
            "var el=document.getElementById('status'); if(el) el.textContent={};",
            js_string(message)
        ));
    }
}

fn claim_first_launch(data_dir: &Path) -> bool {
    let marker = data_dir.join("desktop-launched");
    if marker.exists() {
        return false;
    }
    let _ = std::fs::write(&marker, b"1\n");
    true
}

fn spawn_standalone(app: &AppHandle, port: u16, data_dir: &Path) -> Result<Child, String> {
    let resource_dir = app
        .path()
        .resolve("server", BaseDirectory::Resource)
        .map_err(|error| error.to_string())?;
    let server_js = resource_dir.join("server.js");
    if !server_js.exists() {
        return Err(format!(
            "Standalone server missing at {}",
            server_js.display()
        ));
    }

    let node = sidecar_node();
    if !node.exists() {
        return Err(format!(
            "Bundled Node runtime missing at {}",
            node.display()
        ));
    }

    let log_path = data_dir.join("server.log");
    let log_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|error| format!("Could not write {}: {error}", log_path.display()))?;
    let log_err = log_file
        .try_clone()
        .map_err(|error| format!("Could not clone server log: {error}"))?;

    let mut command = Command::new(node);
    command
        .arg("server.js")
        .current_dir(&resource_dir)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("PROMPT_DATA_DIR", data_dir)
        .env("PROMPT_API_URL", origin(port))
        .env("PROMPT_DESKTOP", "1")
        .env("PROMPT_AUTH_ENABLED", "false")
        .env("PROMPT_NSFW_GENERATOR_ENABLED", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn().map_err(|error| error.to_string())
}

fn navigate_to_studio(app: &AppHandle, port: u16, first_launch: bool) {
    let path = if first_launch {
        "/settings?tab=comfyui&section=connection"
    } else {
        "/"
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!(
            "window.location.replace('{}{path}')",
            origin(port)
        ));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(ServerProcess(Mutex::new(None)));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let port = resolve_port();
                let data_dir = match handle.path().app_data_dir() {
                    Ok(path) => path,
                    Err(error) => {
                        set_splash_status(&handle, &format!("Could not resolve app data dir: {error}"));
                        return;
                    }
                };
                if let Err(error) = std::fs::create_dir_all(&data_dir) {
                    set_splash_status(
                        &handle,
                        &format!("Could not create {}: {error}", data_dir.display()),
                    );
                    return;
                }
                let first_launch = claim_first_launch(&data_dir);
                if !port_open(port) {
                    set_splash_status(&handle, "Starting the local server…");
                    match spawn_standalone(&handle, port, &data_dir) {
                        Ok(child) => {
                            if let Some(state) = handle.try_state::<ServerProcess>() {
                                if let Ok(mut slot) = state.0.lock() {
                                    *slot = Some(child);
                                }
                            }
                            if !wait_for_port(port, Duration::from_secs(45)) {
                                set_splash_status(
                                    &handle,
                                    &format!(
                                        "Server did not open port {port}. See {}",
                                        data_dir.join("server.log").display()
                                    ),
                                );
                                return;
                            }
                        }
                        Err(error) => {
                            set_splash_status(&handle, &format!("Could not start server: {error}"));
                            return;
                        }
                    }
                }
                navigate_to_studio(&handle, port, first_launch);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Prompt Studio")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerProcess>() {
                    if let Ok(mut slot) = state.0.lock() {
                        if let Some(mut child) = slot.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}

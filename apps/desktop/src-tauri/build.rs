fn main() {
    println!("cargo:rerun-if-env-changed=SOTOVOR_BUILD_URL");
    tauri_build::build()
}

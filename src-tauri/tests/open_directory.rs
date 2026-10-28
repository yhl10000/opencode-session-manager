use session_manager::open_directory::explorer_directory;
use std::path::Path;

#[test]
fn forward_slashes_are_converted_before_explorer_receives_directory() {
    let temp = tempfile::tempdir().unwrap();
    let original = temp.path().to_string_lossy().replace('\\', "/");
    let actual = explorer_directory(&original).unwrap();
    assert_eq!(actual, Path::new(&original.replace('/', "\\")));
    assert!(!actual.to_string_lossy().contains('/'));
}

#[test]
fn nonexistent_directory_returns_an_error() {
    let temp = tempfile::tempdir().unwrap();
    let missing = temp.path().join("missing").to_string_lossy().into_owned();
    assert!(explorer_directory(&missing).is_err());
}

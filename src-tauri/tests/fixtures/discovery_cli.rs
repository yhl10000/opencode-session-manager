use std::{env, fs, path::Path};

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let executable = env::current_exe().unwrap();
    if executable.file_stem() == Some(std::ffi::OsStr::new("wt")) {
        let receipt = std::path::PathBuf::from(env::var_os("CLI_RECEIPT").unwrap());
        let pending = receipt.with_extension("pending");
        fs::write(&pending, args.join("\n")).unwrap();
        fs::rename(pending, receipt).unwrap();
        return;
    }
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["--version"] => println!("{}", env::var("CLI_VERSION").unwrap()),
        ["--help"] => eprintln!("{}", env::var("CLI_HELP").unwrap()),
        ["debug", "paths", "db"] if env::var("CLI_VERSION").unwrap().starts_with('2') => {
            println!("{}", Path::new(&env::var_os("CLI_DB").unwrap()).display());
        }
        ["db", "path"] if env::var("CLI_VERSION").unwrap().starts_with('1') => {
            println!("{}", Path::new(&env::var_os("CLI_DB").unwrap()).display());
        }
        _ => panic!("unexpected CLI invocation: {args:?}"),
    }
}

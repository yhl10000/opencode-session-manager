use session_manager::{
    discovery::discover,
    launcher::{self, LaunchMode},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--help") {
        println!(
            "backend_smoke [--session ID] [--launch tab|window]\nDefault reads the real catalog and one detail. Launch is explicit only."
        );
        return Ok(());
    }
    let mut requested = None;
    let mut launch = None;
    let mut arguments = args.iter();
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--session" => {
                requested = Some(arguments.next().ok_or("--session requires an ID")?.clone())
            }
            "--launch" => {
                launch = Some(match arguments.next().map(String::as_str) {
                    Some("tab") => LaunchMode::Tab,
                    Some("window") => LaunchMode::Window,
                    _ => return Err("--launch requires tab or window".into()),
                })
            }
            _ => return Err(format!("Unknown argument: {argument}").into()),
        }
    }
    let discovery = discover()?;
    let catalog = discovery.repository.catalog()?;
    let id = requested.or_else(|| catalog.sessions.first().map(|s| s.id.clone()));
    println!("{}", serde_json::to_string(&catalog)?);
    if let Some(id) = id {
        let detail = discovery.repository.detail(&id)?;
        println!("{}", serde_json::to_string(&detail)?);
        if let Some(mode) = launch {
            println!("{}", launcher::launch(&discovery, &id, mode)?);
        }
    } else if launch.is_some() {
        return Err("No session available to launch".into());
    }
    Ok(())
}

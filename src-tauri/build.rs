fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(feature = "desktop")]
    {
        let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").ok_or("OUT_DIR missing")?);
        let icon_path = out.join("app.ico");
        let mut pixels = Vec::with_capacity(4096);
        for vertical in 0..32 {
            for horizontal in 0..32 {
                let glyph = (8..12).contains(&horizontal) && (8..24).contains(&vertical)
                    || (20..24).contains(&horizontal) && (8..24).contains(&vertical)
                    || (8..24).contains(&horizontal)
                        && ((8..12).contains(&vertical) || (20..24).contains(&vertical));
                pixels.extend_from_slice(if glyph {
                    &[94, 234, 212, 255]
                } else {
                    &[24, 32, 43, 255]
                });
            }
        }
        let image = ico::IconImage::from_rgba_data(32, 32, pixels);
        let mut icon = ico::IconDir::new(ico::ResourceType::Icon);
        icon.add_entry(ico::IconDirEntry::encode(&image)?);
        icon.write(std::fs::File::create(&icon_path)?)?;
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new().window_icon_path(icon_path),
        ))?;
    }
    Ok(())
}

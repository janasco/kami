# `screenshot-studio.json`

`screenshot-studio.json` is Kami's portable project document. It stores the editable scene and export intent while keeping large image binaries outside the JSON file.

## Design principles

- **Portable:** The file can be committed to Git and opened on another machine.
- **Deterministic:** The same document and assets should produce the same output.
- **Incremental:** New capabilities are added through schema versions and migrations.
- **Composable:** Layouts, themes, assets, and output variants are referenced by stable IDs.
- **Reviewable:** Large binary data and generated export bundles are not embedded in the document.

## Top-level fields

| Field | Purpose |
| --- | --- |
| `$schema` | Local JSON Schema reference for editor and validation tooling. |
| `version` | Canonical integer schema version. |
| `revision` | Metadata for the current project revision. Git remains the history source. |
| `project` | Project identity and default locale. |
| `localization` | Locale list and text messages keyed by stable message IDs. |
| `assets` | References to screenshots, icons, fonts, and other binary assets. |
| `scene` | Global coordinate space used by slides and layers. |
| `canvases` | Ordered slide collections and their connected/isolated mode. |
| `slides` | Individual export frames and their layers. |
| `layouts` | Reusable composition definitions. |
| `themes` | Reusable color and typography tokens. |
| `outputVariants` | Selections of canvas, locale, theme, and slide set. |
| `exportProfiles` | Store-specific output formats and target dimensions. |

## Device chrome

Slides that use a framed device preset can draw a small status bar inside the screenshot aperture with a fixed `9:41` clock, cellular, Wi-Fi, and battery shapes. The shapes are local CSS/SVG, so no bitmap assets or network requests are involved and exports stay reproducible.

| Field | Type | Notes |
| --- | --- | --- |
| `deviceFrameId` | `"iphone" \| "iphone-se" \| "iphone-island" \| "iphone-island-max" \| "ipad-mini" \| "ipad-air" \| "android" \| "android-pixel" \| "android-galaxy" \| "android-tablet" \| "none" \| "canvas"` | Preset that wraps the screenshot. Each preset carries its own display resolution, bezel, corner radii, cutout, and safe area. |
| `showDeviceStatusBar` | `boolean` | Optional per slide. Defaults to `true` for framed presets and `false` for frameless presets. |
| `screenshotFit` | `"contain" \| "cover"` | Optional per slide. How the capture fills the aperture. |

Frameless presets never render the chrome, even when the flag is `true`, so a shared project file can keep the preference while switching presets.

Older spellings such as `"iphone-x"`, `"android-generic"`, and `"feature-graphic"` still open on the preset they meant. Opening a project rewrites them to the current IDs, which does not change the document `version`.

## Coordinate model

Kami uses one global pixel coordinate space for a scene. Slides and layers use frames with a top-left origin:

```json
{
  "x": 80,
  "y": 120,
  "width": 920,
  "height": 180
}
```

In `connected` mode, adjacent slide frames form one panoramic composition. In `isolated` mode, each slide is rendered as an independent clipped viewport. Layer ownership remains explicit even when a layer crosses a slide boundary.

## MVP rules

- Every image layer references an existing asset.
- Every text layer references a valid localization key.
- Every slide references an existing canvas, layout, and theme.
- Every output variant slide belongs to its canvas.
- All frames contain finite numbers and positive dimensions.
- Optional device fields such as `showDeviceStatusBar` may be absent; migrations supply deterministic defaults.
- Export profiles reference output variants rather than duplicating slide content.
- Unknown fields are preserved on read for forward compatibility, but do not override known-version semantics.

## Migration policy

1. Treat `version` as the authoritative schema version.
2. Apply migrations in sequence through pure, tested functions.
3. Validate before and after every migration.
4. Do not silently downgrade a newer document.
5. Preserve unknown fields when upgrading an older document.
6. Use stable IDs rather than array positions for references.

The first schema is `version: 1`. The editor will migrate older documents before enabling persistence.

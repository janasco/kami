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
| `revision` | Not written. An earlier version emitted `{ number: 1, createdAt: <now>, message: 'Saved from Kami editor' }`, which was never read back and made every save produce a diff. Git remains the history source. |
| `project` | Project identity and default locale. |
| `localization` | Locale list and text messages keyed by stable message IDs. |
| `assets` | References to screenshots, icons, fonts, and other binary assets. |
| `scene` | Global coordinate space used by slides and layers. |
| `canvases` | Ordered slide collections and their connected/isolated mode. |
| `slides` | Individual export frames and their layers. |
| `layouts` | Reusable composition definitions. |
| `themes` | Reusable color and typography tokens. |
| `outputVariants` | Selections of canvas, locale, theme, and slide set, each with its per-device overrides. |
| `exportProfiles` | Store-specific output formats and target dimensions. |

## Per-device export variants

One device set is one **output variant**. A variant is a *selection*, not a copy: it names the slides it renders and carries the device differences for those slides. The deck stays the single source of authoring truth, which is why a variant needs no migration and why the document `version` does not move.

| Field | Type | Notes |
| --- | --- | --- |
| `outputVariants[].slideIds` | slide id `[]` | The slides this variant renders, in any order. A variant may render a subset. |
| `outputVariants[].exportProfileId` | profile id | The store target this variant exports at. |
| `outputVariants[].enabled` | `boolean` | Required by the schema. An absent value in a hand-edited file is completed to `true` by the migration. |
| `outputVariants[].deviceOverrides[]` | record | Optional per-slide device differences. Absent means every slide uses its own fields. |
| `deviceOverrides[].slideId` | slide id | Which slide the override applies to. |
| `deviceOverrides[].deviceFrameId` | device preset id | The frame this device shows. Normalized to a current preset on save and on open. |
| `deviceOverrides[].showDeviceStatusBar` | `boolean` | Optional. Same rule as on a slide. |
| `deviceOverrides[].screenshotFit` | `"contain" \| "cover"` | Optional. Same rule as on a slide. |
| `deviceOverrides[].assetId` | asset id | The capture this device shows instead of the slide's own. |
| `deviceOverrides[].layerTransforms` | per-layer transform | Optional placement for this device. A transform equal to the slide's own is not written. |

Three decisions are load-bearing:

- **A slide with no override uses its own fields.** That single rule is what makes the feature additive. An override that names nothing is not written, and an override whose last field is cleared is removed, so a deck that never used a device variant stores no variant data beyond the one default record it has always had.
- **A variant never duplicates a slide.** Copying slides per device would inflate `slides`, break the synthetic `scene.width`, and desynchronise every consumer that reads a 1-based slide position — `preflight.slideNumbers`, the "Open slide" button, the ZIP numbering, and the deck strip. A variant's render is numbered by its position in the **authoring deck**, and a variant-scoped preflight issue appends the variant name to that number rather than introducing a second coordinate system.
- **Copy, theme, layout, and background fill are not overridable per device.** A reader looking for the words on a slide should find them in one place. Only the chrome, the capture, and the placement move per device.

`scene.width` describes the **authoring canvas**: `profile.width × slide count`. It deliberately does not count variant renders. A two-variant deck writes twice as many PNGs but authors one scene, and a `scene.width` that grew with the variants would describe a picture of the document rather than the document.

`exportProfiles[].variantIds` and `exportProfiles[].status` are derived, never authored. A profile is `ready` only when **every enabled variant targeting it** is complete; it is `needs-assets` as soon as one of them renders a slide with no capture, and a `planned` profile carries no variants at all. Before this field existed, `status` was `slides.every(s => s.screenshot)` over the base deck, which reported a profile as ready while a variant with no capture was quietly exporting a placeholder.

Which profile the editor opens on is decided in one order: `selected === true` on a profile is the authority, and only if no profile claims it does the reader fall back to the first **enabled** variant in array order. The fallback used to be "the first variant naming any known profile", which agreed with the authority only by accident while there was one variant.

A variant with a missing capture **blocks that variant's export** rather than emitting a placeholder. A placeholder PNG reaches a store review and is a rejection there, and once it is in the bundle it is indistinguishable from a finished slide.

Files in the exported ZIP are named `<profile>--<variant>--slide-NN.png`, minted in one place. Two device variants would otherwise both want `slide-01.png`, and a bundle that overwrites itself is worse than a long one. The `profile` part is the profile **id**, not its display name, so renaming a profile in the catalog does not change what a bundle written last month is called.

### An older build will flatten your variants

**An older local build re-saving a document that contains variants will silently flatten them.**

`serializeProject` is a full rewrite, not a patch. A build that predates this field ignores what it does not recognise and writes its own single `variant-en-us` record, so the second you open such a document in an older build and autosave runs, every device variant and every device override is gone, and the file is still a valid `version: 1` document.

This is silent data loss, **not** a validation error: nothing rejects the file, nothing warns, and the reopened deck looks like a deck that simply has one device. It is the same hazard the project already accepts for `showDeviceStatusBar` and `screenshotFit`, and it is accepted here because the document version is pinned and a version ladder would be a far larger cost than the hazard. The practical rule: once a document carries device variants, open it only in a build that knows about them. Keep the project JSON in Git so a flattened file is a diff you can see rather than a state you discover at upload time.

## Background fill

One optional record per slide decides what paints the back of that slide. It is absent on every project authored before the field, and absent means the theme, so a document that never touched a background keeps serializing exactly as it always did.

| Field | Type | Notes |
| --- | --- | --- |
| `backgroundFill.kind` | `"theme" \| "solid" \| "gradient" \| "image" \| "panoramic"` | Optional per slide. `theme`, `solid`, and `gradient` paint the canvas and turn the background image layer off. `image` and `panoramic` mean the existing `background-image` layer *is* the fill. |
| `backgroundFill.color` | `#rrggbb` | `solid` only. |
| `backgroundFill.gradient.angle` | `number` | `gradient` only. Degrees, CSS convention: 0 points to the top. |
| `backgroundFill.gradient.stops` | `#rrggbb[]` | `gradient` only, in order. |
| `backgroundFill.blend` | `"normal" \| "multiply" \| "screen" \| "overlay"` | `image` and `panoramic` only. `normal` is the default and is not written. |
| `layers[background-image].focalPoint.x` | `0..1` | Optional. Normalized horizontal focal point of the background image. |
| `layers[background-image].focalPoint.y` | `0..1` | Optional. Normalized vertical focal point. |
| `assets[].width`, `assets[].height` | positive `number` | Optional intrinsic pixel size, a hint for the panoramic overscan. |

Three decisions are load-bearing:

- **There is no separate "the image layer is on" flag.** The kind already says so. Two switches that could contradict each other are the kind of thing that desynchronizes a document from what the editor drew.
- **`image` and `panoramic` differ only in fit.** `image` crops the artwork to cover the frame. `panoramic` crops to cover *and* scales the artwork up past the frame, so the crop reads as a designed crop rather than an accidental edge. The bleed is at most 6%, tapering from nothing for an image exactly as wide as the frame to the full bleed for one at least twice as wide. `transform: scale()` carries it, because the PNG exporter reproduces transforms reliably and does not reproduce blend modes or filters.
- **The focal point is normalized, never pixels.** One slide exports at six profile sizes, and a pixel focal point drifts on every one of them. It is also *physical*, not logical: a right-to-left locale sets `dir="rtl"` on the canvas, and a percentage `object-position` has no direction of its own, so the Arabic export frames the artwork the same way the English one does.

`backgroundFill` is written only when `kind` is not `theme`, and `focalPoint` only when it is not the centre, so an untouched deck never grows a field. Fields that the chosen kind cannot use are dropped rather than stored, and a value that is not a `#rrggbb` colour, a finite angle, or a stop in range is a **warning**: the project still opens, with the value repaired. An unrecognised `kind` or `blend` is an **error**, because the editor cannot know which fill was meant.

`assets[].width` and `assets[].height` are strictly a hint. A hand-edited project can claim any aspect it likes, so the canvas re-measures the image when it loads and uses the measured value; with no hint and nothing measured, a panoramic fill degrades to a plain `cover` rather than to a guessed crop. An image fill also keeps the theme paint underneath the artwork, so a missing or failed image degrades to the theme instead of exporting a hole.

## Device chrome

Slides that use a framed device preset can draw a small status bar inside the screenshot aperture with a fixed `9:41` clock, cellular, Wi-Fi, and battery shapes. The shapes are local CSS/SVG, so no bitmap assets or network requests are involved and exports stay reproducible.

| Field | Type | Notes |
| --- | --- | --- |
| `deviceFrameId` | `"iphone" \| "iphone-se" \| "iphone-island" \| "iphone-island-max" \| "ipad-mini" \| "ipad-air" \| "android" \| "android-pixel" \| "android-galaxy" \| "android-tablet" \| "none" \| "canvas"` | Preset that wraps the screenshot. Each preset carries its own display resolution, bezel, corner radii, cutout, and safe area. |
| `showDeviceStatusBar` | `boolean` | Optional per slide. Defaults to `true` for framed presets and `false` for frameless presets. |
| `screenshotFit` | `"contain" \| "cover"` | Optional per slide. How the capture fills the aperture. |

Frameless presets never render the chrome, even when the flag is `true`, so a shared project file can keep the preference while switching presets.

Older spellings such as `"iphone-x"`, `"android-generic"`, and `"feature-graphic"` still open on the preset they meant. Opening a project rewrites them to the current IDs, which does not change the document `version`.

## Layer stacking

A slide draws its layers bottom to top. The order is optional, so a document that predates the field draws exactly as it always did.

| Field | Type | Notes |
| --- | --- | --- |
| `layerOrder` | `LayerId[]` | Optional per slide. Bottom-to-top stacking order. |

`layerOrder` is only written when a slide has actually reordered its layers, and an order that resolves back to the default order removes the field again. On read, unknown ids are dropped, repeats are collapsed, and any layer the list does not name is appended in the catalog order, so a partial or hand-edited list still resolves to every layer exactly once. A slide without the field, or with an order equal to the default, is left without an inline stacking override in the editor and in the export.

## Canvas guides

The Refine canvas can draw the store margin, the centre cross, and the thirds grid over the artwork. Guides are an editor aid only: they take no pointer, they are never rendered into an export, and nothing in the document or the export path records them.

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
- Every output variant device override names a slide, and its `assetId`, if present, exists.
- All frames contain finite numbers and positive dimensions.
- Optional device fields such as `showDeviceStatusBar` may be absent; migrations supply deterministic defaults.
- Optional per-device override fields may be absent; an absent one means the slide's own value.
- Optional background fields such as `backgroundFill` and a layer's `focalPoint` may be absent; absent means the theme paint and a centred crop.
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

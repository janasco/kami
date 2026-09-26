# Changelog

All notable changes to Kami are documented here. The project is currently in the Unreleased milestone.

## Unreleased

### Editor typography

- Raised the editor chrome off the 11px floor onto one deliberate type scale, declared once as `--type-*`, `--leading-*`, and `--control-*` custom properties in `styles.css` instead of being repeated as pixel literals in three stylesheets. The ladder is 12 / 13 / 14 / 15 / 16 / 18 / 22 / 28.
- Body text and form controls now sit at 13-14px, secondary text at 13px, and metadata, counters, badges, and status words at 12px, so nothing in the editor chrome is set below 12px. Headings get three clear steps above the body rather than three shades of the same size: card titles at 16px, section and panel titles at 18px, and stage and page titles at 22px.
- Applied the scale across the Guided shell, the Full Editor, the right rail, the stage panels, the Inspector and its drawer, the device picker, the translation matrix, the bulk action bar, the connected-canvas captions, and the canvas status bar.
- Gave the larger type room to sit in: line heights, button heights, form control heights, card padding, and rail and list row heights all grew, and the two editor columns, the Flowboard rail, and the top bars were widened or heightened to match.
- The exported slide design is unchanged. The artboard rules on `.slide-canvas`, `.device-status-bar`, and `.template-preview` still size type against the 1242 x 2688 export, because the readability problem is the editor around the artboard, not the artwork inside it.
- Removed the shell-scoped size override that existed only to lift the shared Inspector and canvas meta text above the old floor: those classes now read the same scale as the rest of the shell, so a size is declared in one place. The rail's type floor is now 12px.
- Contrast, focus states, responsive behaviour, and `prefers-reduced-motion` support are unchanged; no colour value and no focus or motion rule was touched.

### Guided mode

- Added Guided mode, a four-step path through work the editor already did: Add your screenshots, Choose a look, Write your words, Download. Each step has one primary action in a sticky footer alongside Back and Skip, a step progress indicator, and plain wording for screenshots, slides, phone style, show the whole screenshot or fill the frame, and download.
- Guided mode is a UI-only browser preference. A stored choice always wins; otherwise it opens as the default only for a genuinely first-time visitor, with no restored project and onboarding still outstanding, so a returning author keeps the Full Editor.
- The complex control set is moved, not removed: a More options disclosure renders the existing Flowboard stage in place, and Refine is reachable as an advanced link from Choose a look and Write your words. The stage panels come from the same hook the Full Editor uses, so there is no second renderer and no second import, export, autosave, or project path.
- Added an explicit Guided / Full editor switch to both shells, a way back to guided from the Full Editor's rail, and an "Open full editor" path out of every guided step. Undo/redo, save/open, preflight, the export gate, connected canvas mode, and the translation matrix stay in the Full Editor.
- Fixed the blocked export message: the reason is now shown as visible text in a status line that the Export button also points at, instead of living only in a title attribute on a disabled control.

### Flowboard layout and usability

- Reorganised the Full Editor into one full-width main area and a single right rail. The persistent left stage rail is gone: stage navigation moved into the rail as a compact vertical Steps list, so a stage, its state, the deck facts, and the common actions are read in one place instead of being split across two columns.
- The rail now carries the Steps list, the active stage's reason, the deck at a glance with a setup count, the up-next jump, the draft and export notices, the editor guide, the classic-editor escape hatch, and the Guided / Full editor switch. The step state is printed once, on the entry that owns it: the top bar is the project surface only, the stage header names the stage and its position, and the footer bar is a position rather than a second status.
- The rail follows the viewport: a permanent right column on a desktop, a dismissible bottom sheet with a visible Steps toggle on a tablet, and a dismissible side sheet on a phone, where a compact stage selector above the content keeps the current stage in view without opening anything. The main area is full width at every size and no new left navigation was added.
- Stage navigation keeps its keyboard behaviour: roving focus with the arrow keys and Home/End in both the rail list and the compact selector, `[` and `]` to step between stages from the main area, Escape and the scrim to close the sheet, focus moved into the sheet on open and returned to the toggle on close, and the sheet inert while it is closed.
- Split the slide card state into three structural states: the slide being edited, the slides in the bulk selection, and everything else. The edited card carries an Editing pill, a pencil corner mark, a solid ring, `aria-current`, and a state sentence in its label, while a range selection keeps a dashed ring, a tick mark, and a Selected pill, so the two can no longer be told apart by a background tint alone.
- Added an always-visible legend in the Frame and Story stages that explains both states before a second card is chosen, and renamed the single-slide panel headings to say which slide is being edited.
- Made the Refine inspector drawer reachable: the panel is now a bounded flex column with the Inspector's own scroll region doing the scrolling, so the bottom of the panel is no longer clipped, and the drawer gained a header with a close button.
- Bounded the shell body row so the rail can no longer grow past the shell and hide its own lower half, at desktop and tablet sizes alike.
- Replaced the content-count `auto-fit` stage grid with an explicit per-stage template, so a stage with a single side panel no longer reserves an empty second track. The Frame selected-capture panel and the Ship export panel now span the row, and the Intake and Refine stages keep their two real columns. Stages collapse to one column at 1023px and below.
- Unified Export enablement behind one gate shared by the top bar and the Ship stage, so a blocked or running export can no longer be shown as available in one place and blocked in the other. Blocking checks keep their slide numbers in the message, warnings stay non-blocking, and a running export reports its progress.
- Relaxed the Flowboard host constraints so the shell is no longer clipped on short or mobile viewports: the app shell keeps the viewport height instead of a 680px floor, very short windows fall back to page scrolling, and the wrapping mobile top bar grows with its content.
- Made the tablet rail sheet dismissible with a scrim, Escape, and a visible close button, with focus moved into the sheet on open and returned to the toggle on close. The panel is inert while the sheet is closed, and the existing dialog Escape handlers are untouched because the dialogs live outside the shell.
- Raised the shell type floor to 11px, replaced the failing greys with contrast tokens that clear 4.5:1 on every shell background, added a shell-scoped floor for the shared Inspector and canvas meta text, gave cards and rail entries an explicit focus ring, and honoured `prefers-reduced-motion`.

### Flowboard story stage

- Added a translation matrix to the Story stage with one row per beat and one column per supported locale, so a deck's localized copy can be read across every language at once.
- Each cell reports the headline and supporting copy it holds, marks a missing translation instead of quietly showing the English fallback, and offers inline editing or a hand-off to the normal copy editor in the Refine stage.
- Inline cell edits go through the same update path as the Inspector, so one burst of typing is one undo step, autosaves like any other edit, and lands in the project document as an ordinary locale message.
- Added a completion summary in the form `4/6 slides · 8/18 fields translated`, counting headline and supporting copy per beat and locale and leaving fields the deck never used out of the total.
- Kept the matrix in table semantics with per-cell text for screen readers, arrow-key cell navigation, Escape to close an open cell, and right-to-left badges plus `dir` on right-to-left copy.
- The column header still sets the active preview locale, and the beat strip keeps multi-select, add, duplicate, delete, move, and apply-style-to-all.

### Device frame

- Replaced the three hard-coded device frames with a parametric catalog: every preset is now data describing a display resolution, a body built from a bezel and corner radii, a cutout, an orientation, a palette, and the safe area the operating system reserves. Frames are drawn from those numbers with CSS and computed SVG paths, so there is no bundled device image, no traced manufacturer outline, and no logo.
- Added twelve presets grouped by family: iPhone, iPhone SE, iPhone (island), iPhone (island max), iPad mini, iPad Air, Android, Pixel, Galaxy, Android tablet, No frame, and a landscape Canvas for feature graphics. Handset ratios are labelled the way a display spec is written, and each option shows its ratio and resolution.
- Replaced the Inspector's device dropdown with a grouped picker that draws each frame from the same catalog geometry the slide uses, so a button and an exported slide cannot disagree. Guided mode offers a shortlist of the common frames and keeps the rest of the catalog one disclosure away.
- Applied the selected geometry in the shared slide renderer, so the preview, the connected strip, and the export draw the same body, bezel, radii, and cutout. A notch, pill, or camera hole is one computed path in display coordinates, and the capture keeps clear of it.
- Kept `iphone`, `android`, and `none` working, and made older spellings such as `iphone-x` and `feature-graphic` open on the preset they meant. A saved project only ever carries a current ID, the document version is unchanged, and a value the catalog does not know falls back to the default.
- Added an optional mobile status bar to the device frame with a fixed 9:41 clock plus cellular, Wi-Fi, and battery indicators drawn from local CSS and SVG shapes.
- Added a per-slide `showDeviceStatusBar` setting with an Inspector toggle, defaulting to on for iPhone and Android presets and off for frameless output.
- Positioned the status chrome in the device safe area inside the shared slide renderer so previews and exports match, with local shapes, no system-clock dependency, and no pointer capture that would block dragging the screenshot layer.
- Fixed imported captures rendering cropped: the screenshot now sits in its own aperture box that honours a per-slide `screenshotFit` policy of `contain` or `cover`, and `contain` is the default so a new import is never cropped without the author choosing it.
- Added an Inspector control for the screenshot fit, with a hint describing the current choice and the named capture.
- Inset the capture below the reserved status bar band and off the rounded frame edge while the chrome is visible, and revealed a neutral backdrop for the letterbox of a contained capture, dark for framed presets and light for frameless output.
- Moved the aperture into a shared `DeviceAperture` renderer used by both the editor canvas and the export stage, and added a fallback to the import prompt when a stored capture cannot be decoded.
- Persisted `screenshotFit` per slide; projects saved before the field existed restore as `contain` and documents with an unsupported value are rejected by project validation.

### Editor

- Built the current slide editor with PNG, JPG, and WebP screenshot import; reusable layouts and themes; device-frame previews; connected panoramic and isolated canvas modes; editable layers; transforms; localization previews; undo/redo; autosave; and project-file open/save support.
- Added client-side PNG ZIP export at the dimensions of the selected supported export profile.

### Landing page

- Added the public landing page with the editor entry point, workflow and feature explanations, supported profile callouts, and a disclaimer that Kami prepares image assets rather than guaranteeing store approval.
- Added canonical social metadata, crawler rules, a sitemap, web-app metadata, and a local SVG favicon for the canonical domain.

### Templates

- Added the template picker with launch, product, marketing, premium, and SaaS-oriented starting points.
- Added demo-project and template validation fixtures and checks.

### Onboarding

- Added a first-use editor guide with the ability to reopen it from the toolbar.
- Persisted completion state locally while keeping the editor usable when browser storage is unavailable.

### Validation

- Added project-document validation, migration support, fixture coverage, and repository checks for the versioned project format.
- Kept project state portable in `screenshot-studio.json` and documented its format and schema.

### Export preflight

- Added export preflight checks for supported profiles, required assets, required layers, localized copy, image data, and canvas bounds.
- Blocking issues prevent export; warnings remain visible without blocking otherwise valid exports.

### CI

- Added GitHub Actions CI for project/template/demo validation, unit tests, and the production Vite build.

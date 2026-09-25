# Changelog

All notable changes to Kami are documented here. The project is currently in the Unreleased milestone.

## Unreleased

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

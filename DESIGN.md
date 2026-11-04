# Lightngx design system

## Direction
Operate mode. A quiet, green-grey frame around a white work sheet. Typography and precise alignment carry hierarchy; green has a job: nginx identity, enabled states, and the primary action. No shadows on resting surfaces, gradients, decorative graphics, or invented telemetry.

The design-taste draw selected Framed sheet, seed 1375836007. IBM Plex Sans for interface text; IBM Plex Mono for filenames, paths and code. Self-host the fonts for offline deployments.

## Alternatives considered
Dark monitoring console (too dominant for a configuration-first tool); monochrome ledger (clear but loses the nginx identity); compact icon rail (saves width but makes destinations harder to discover). The selected labelled frame keeps context and gives content room. The product-specific signature is the site state summary tied to the real enabled and maintenance flags, next to the guarded editor workflow.

## Layout and rhythm
228px desktop navigation; 56px utility header; 8px sheet inset. 32px workspace gutter on wide screens, 24px on tablet, 16px on phone. The sidebar becomes a drawer below 1100px. Titles are 24px/600, section labels 16px/500, body 14px/400, metadata 12px. Content uses 8px spacing increments. One sheet with no unnecessary nested cards. Technical workspaces expand to the available width and height.

## Components
6px controls, 8px panels, 16px outer sheet. Neutral navigation selection, outlined secondary actions, green primary action. Status text and dots accompany colour. Consistent focus outline. Lists use fine row rules and sentence-case labels; mobile rows preserve every action and reflow. Mobile filters open in one bottom sheet with labelled, aligned status/tag fields, a reset action and a pinned results button; they do not expand into scattered inline controls. Settings use a description column and a form column, stacking on smaller screens. Every grid item has min-width: 0. Session rows use a flexible identity track beside their action, and IP addresses and times wrap inside the track. Validate nested scroll widths, including populated and long-content states. Modals and menus alone carry shadows.

## State and access
Keep all existing loading, error, empty, disabled and confirmation states. Never fabricate nginx status. Keyboard navigation, visible focus and drawer focus containment. English and French strings remain paired. Light, dark and system share semantic tokens. Motion only for feedback, disabled under reduced-motion preference.

## References
- https://vercel.com/docs/projects — clear separation of operational surfaces.
- https://linear.app/changelog/2024-12-18-personalized-sidebar — grouped navigation and settings hierarchy.

## Review
See docs/ui-redesign-review.md for browser evidence, verification and limitations.

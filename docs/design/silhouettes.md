# Silhouettes (a person who has not signed in yet)

Design, 2026-11-14. Replaces the initials in the round frames.

Markup, inside `.fv-pic`, `.mc-avatar`, `.fs-face` or `.tr-face`:

    <span class="sil" data-sil="m" aria-hidden="true"></span>   <!-- m man, f woman, x unknown (default) -->

- Files: `/assets/sil-m.svg`, `sil-f.svg`, `sil-x.svg` (also usable as a plain img, brown).
- CSS: the end of `base.css`. A mask over `currentColor`, so it follows the frame's colour in light and dark.
- Give the frame a visible name for screen readers (aria-label on the person), the silhouette is decoration.

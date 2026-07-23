# content-transform — wave-final migrated→DA transform

- `transform.mjs` — generates `content/<path>.html` DA body fragments from
  `stardust/migrated/**` (63 pages beyond the 7 archetypes). Per-class section
  dispatch + generic structural walker; sidecar roundtrip maps in `maps/`.
- `handlers.mjs` / `lib.mjs` — section handlers; manifest-backed image mapping
  (`media-supplement.json` carries rehosted externals + key remaps), href
  normalization (#_dnb on youtube, lowercased internals, percent-encoded media).
- `roundtrip-page.mjs` — whole-page block-roundtrip vs the migrated page
  (serve stardust/migrated on :8791) using the sidecar maps.
- `gate-plain.sh` / `gate-live.mjs` — atomic-contract delivery gates.

Full run log + decisions: stardust/eds-conversion-log.md (wave-final section).

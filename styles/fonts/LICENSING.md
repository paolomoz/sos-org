# Font licensing — sos.org EDS

| File | Family | Foundry / License | Status |
|---|---|---|---|
| `jost-variable.woff2` | Jost (variable, wght 100–900) | Owen Earl / indestructible type* — SIL OFL 1.1 | Self-hosted, redistribution permitted |
| `lusitana-1.woff2` | Lusitana 400 | Ana Paula Megda — SIL OFL 1.1 | Self-hosted, redistribution permitted |
| `lusitana-2.woff2` | Lusitana 700 | Ana Paula Megda — SIL OFL 1.1 | Self-hosted, redistribution permitted |
| *(not shipped)* | Adobe Caslon Pro | Adobe — commercial (Adobe Fonts / Typekit) | **Intentionally unshipped** |

## Adobe Caslon Pro — intentionally unshipped

The display stack in `styles/styles.css` names `adobe-caslon-pro` first for brand
fidelity, but the face is Adobe-licensed and may not be self-hosted or
redistributed. **Lusitana is the site's own captured fallback** and is what the
deployed site renders (with a metric-matched `Lusitana Fallback` → local Times
New Roman for zero-CLS loading).

**To activate real Caslon at go-live:** load the site's Adobe Fonts (Typekit)
kit — a licensing/account decision owned by the site, not a code change here.
No CDN load is shipped by default.

**Remove path (if any OFL face must be pulled):** delete the `.woff2` and its
`@font-face` rule in `styles/styles.css`; stacks fall back to the
metric-matched system faces (`Arial` override for Jost, `Lusitana Fallback` /
Times New Roman for the display stack).

# wave-final progress (checkpoint)

- 63 content pages generate clean (transform.mjs); media manifest + supplement complete (33 rehosted, uploaded to DA media).
- Roundtrip green (exit 0): all Task-B samples — article(finding-your-true-purpose, regions/australia), static(privacy-policy, terms-of-use), program(webinars/learn-to-meditate-series, meditation/meditation-for-beginners), institutional(science-of-spirituality, meditation-center), bio(about-skrm, benefits-of-a-spiritual-guide), listing(sos-global, videos, articles, news/*), events(find-local-programs, sant-rajinder-singh/events), form(connect) + connect-form, introductory-material-*, find-local-center, spiritual-awareness, spiritual-master, meditation, webinars/*.
- Block one-rule fixes (committed 4a3d4c6 + later): page-head byline, page-hero panel h1 flatten + panel lede, quote plain-cite, band sublabel, text kicker i===0, form multi-checkbox + note rows, page-hero photo kicker + text-rank lede.
- Remaining red pages (in progress): mission/free-eye-camp, mission/free-eye-checkup-camp, programs/women-retreat-divine-beauty.
- IN FLIGHT edits: heroFrom (lede by proto tag, .h1-date → lede, hero-meta/hero-actions → follow-up text units, sel [ds] h1), flushFlow parent-based sel, textUnit figure handling, headUnit labels-first, isLinkRunDiv text guard, cleanNode ADDRESS unwrap, OVERRIDES sponsors flowAll (women-retreat).
- Known logged deviations: blogs non-link filter chips dropped; find-local-programs location-search dynamic skipped; benefits-of-a-spiritual-guide guide-intro facade→plain link; event-venue "No Smoking Facility" label renders body.
- NEXT: regenerate + re-roundtrip 3 pages → sanitise → commit → push → deploy-batch → atomic gates → step-10 diffs → wrap-up (log + eds-deploy-report.json).

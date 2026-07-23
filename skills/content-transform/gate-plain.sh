#!/bin/zsh
# Atomic-contract .plain.html asserts for the template representatives.
# 200 / body content / exactly one h1 / zero about:error / zero /img/ srcs.
# keyFacts gate: SKIPPED — DESIGN.json has no extensions.metadata.keyFacts.
HOST="https://stardust--sos-org--paolomoz.aem.live"
fail=0
for p in "$@"; do
  f=$(mktemp)
  code=$(/usr/bin/curl -s --compressed -o "$f" -w '%{http_code}' "$HOST/$p.plain.html")
  h1=$(grep -o '<h1' "$f" | wc -l | tr -d ' ')
  err=$(grep -c 'about:error' "$f")
  imgrel=$(grep -cE 'src="/img/' "$f")
  bytes=$(wc -c < "$f" | tr -d ' ')
  gstatus=OK
  [ "$code" != "200" ] && gstatus="FAIL(code=$code)"
  [ "$h1" != "1" ] && gstatus="FAIL(h1=$h1)"
  [ "$err" != "0" ] && gstatus="FAIL(about:error=$err)"
  [ "$imgrel" != "0" ] && gstatus="FAIL(/img/=$imgrel)"
  [ "$bytes" -lt 500 ] && gstatus="FAIL(bytes=$bytes)"
  [ "$gstatus" != "OK" ] && fail=1
  echo "$p: $gstatus (code=$code h1=$h1 err=$err imgrel=$imgrel bytes=$bytes)"
  rm -f "$f"
done
exit $fail

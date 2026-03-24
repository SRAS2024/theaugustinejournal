// src/lib/cathedral-svg.js
// SVG artwork for the cathedral — resting (homepage) and ringing (emails)
// Refined traditional Catholic cathedral façade with elegant sketch-style line work

/**
 * Helper: builds the full cathedral structure SVG content (shared between resting & ringing).
 * @param {string} clr - stroke color (e.g. "currentColor" or "#8a8a99")
 * @returns {string} SVG inner content (no <svg> wrapper)
 */
function cathedralBody(clr) {
  return `
  <!-- ═══════ Ground line ═══════ -->
  <line x1="20" y1="130" x2="240" y2="130" stroke="${clr}" stroke-width="0.5" stroke-linecap="round" opacity="0.13"/>
  <!-- Light ground shadow -->
  <ellipse cx="130" cy="131" rx="90" ry="1.5" fill="${clr}" opacity="0.04"/>

  <!-- ═══════ MAIN CATHEDRAL BODY ═══════ -->
  <!-- Outer aisle walls -->
  <rect x="58" y="68" width="144" height="62" rx="0.5" stroke="${clr}" stroke-width="0.7" opacity="0.2"/>
  <!-- Inner nave walls (taller central section) -->
  <rect x="82" y="42" width="96" height="88" rx="0.5" stroke="${clr}" stroke-width="0.8" opacity="0.26"/>

  <!-- Subtle wall thickness / inner wall line on nave -->
  <line x1="84" y1="44" x2="84" y2="130" stroke="${clr}" stroke-width="0.25" opacity="0.08"/>
  <line x1="176" y1="44" x2="176" y2="130" stroke="${clr}" stroke-width="0.25" opacity="0.08"/>

  <!-- ═══════ MAIN PEDIMENT (triangular gable) ═══════ -->
  <path d="M78 44 L130 8 L182 44" stroke="${clr}" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.3" fill="none"/>
  <!-- Inner pediment line (depth / moulding) -->
  <path d="M85 44 L130 13 L175 44" stroke="${clr}" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round" opacity="0.12" fill="none"/>
  <!-- Tympanum subtle arch within pediment -->
  <path d="M100 44 Q130 22 160 44" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" opacity="0.09" fill="none"/>

  <!-- ═══════ CENTRAL CROSS FINIAL ═══════ -->
  <line x1="130" y1="-2" x2="130" y2="8" stroke="${clr}" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>
  <line x1="125.5" y1="2.5" x2="134.5" y2="2.5" stroke="${clr}" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>
  <!-- Cross base orb -->
  <circle cx="130" cy="8" r="1.2" stroke="${clr}" stroke-width="0.4" fill="none" opacity="0.2"/>

  <!-- ═══════ LEFT TOWER ═══════ -->
  <rect x="46" y="36" width="28" height="94" rx="0.5" stroke="${clr}" stroke-width="0.7" opacity="0.24"/>
  <!-- Tower inner vertical lines (pilaster detail) -->
  <line x1="50" y1="38" x2="50" y2="130" stroke="${clr}" stroke-width="0.25" opacity="0.08"/>
  <line x1="70" y1="38" x2="70" y2="130" stroke="${clr}" stroke-width="0.25" opacity="0.08"/>
  <!-- Tower cornice line -->
  <line x1="44" y1="38" x2="76" y2="38" stroke="${clr}" stroke-width="0.5" opacity="0.18"/>
  <!-- Tower spire (steeper, more elegant) -->
  <path d="M44 38 L60 12 L76 38" stroke="${clr}" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.28" fill="none"/>
  <!-- Spire inner line (depth) -->
  <path d="M48 38 L60 16 L72 38" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.1" fill="none"/>
  <!-- Left tower cross finial -->
  <line x1="60" y1="5" x2="60" y2="12" stroke="${clr}" stroke-width="0.6" stroke-linecap="round" opacity="0.32"/>
  <line x1="57" y1="8" x2="63" y2="8" stroke="${clr}" stroke-width="0.6" stroke-linecap="round" opacity="0.32"/>

  <!-- Left tower bell chamber (open arched area) -->
  <path d="M52 42 Q52 38 56 37 Q60 36 60 37 Q60 36 64 37 Q68 38 68 42" stroke="${clr}" stroke-width="0.5" stroke-linecap="round" opacity="0.2" fill="none"/>
  <!-- Bell chamber columns -->
  <line x1="52" y1="42" x2="52" y2="52" stroke="${clr}" stroke-width="0.4" stroke-linecap="round" opacity="0.18"/>
  <line x1="68" y1="42" x2="68" y2="52" stroke="${clr}" stroke-width="0.4" stroke-linecap="round" opacity="0.18"/>
  <!-- Bell chamber sill -->
  <line x1="50" y1="52" x2="70" y2="52" stroke="${clr}" stroke-width="0.45" stroke-linecap="round" opacity="0.16"/>
  <!-- Small dividing column in bell chamber -->
  <line x1="60" y1="37" x2="60" y2="52" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" opacity="0.1"/>

  <!-- Left tower tall arched windows (pair) -->
  <path d="M52 60 Q52 56 56 55 Q60 56 60 60 L60 72 L52 72 Z" stroke="${clr}" stroke-width="0.4" opacity="0.14" fill="none"/>
  <path d="M60 60 Q60 56 64 55 Q68 56 68 60 L68 72 L60 72 Z" stroke="${clr}" stroke-width="0.4" opacity="0.14" fill="none"/>
  <!-- Lower tower windows -->
  <path d="M52 82 Q52 78 56 77 Q60 78 60 82 L60 92 L52 92 Z" stroke="${clr}" stroke-width="0.35" opacity="0.12" fill="none"/>
  <path d="M60 82 Q60 78 64 77 Q68 78 68 82 L68 92 L60 92 Z" stroke="${clr}" stroke-width="0.35" opacity="0.12" fill="none"/>

  <!-- ═══════ RIGHT TOWER ═══════ -->
  <rect x="186" y="36" width="28" height="94" rx="0.5" stroke="${clr}" stroke-width="0.7" opacity="0.24"/>
  <!-- Tower inner vertical lines (pilaster detail) -->
  <line x1="190" y1="38" x2="190" y2="130" stroke="${clr}" stroke-width="0.25" opacity="0.08"/>
  <line x1="210" y1="38" x2="210" y2="130" stroke="${clr}" stroke-width="0.25" opacity="0.08"/>
  <!-- Tower cornice line -->
  <line x1="184" y1="38" x2="216" y2="38" stroke="${clr}" stroke-width="0.5" opacity="0.18"/>
  <!-- Tower spire -->
  <path d="M184 38 L200 12 L216 38" stroke="${clr}" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.28" fill="none"/>
  <!-- Spire inner line -->
  <path d="M188 38 L200 16 L212 38" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.1" fill="none"/>
  <!-- Right tower cross finial -->
  <line x1="200" y1="5" x2="200" y2="12" stroke="${clr}" stroke-width="0.6" stroke-linecap="round" opacity="0.32"/>
  <line x1="197" y1="8" x2="203" y2="8" stroke="${clr}" stroke-width="0.6" stroke-linecap="round" opacity="0.32"/>

  <!-- Right tower bell chamber -->
  <path d="M192 42 Q192 38 196 37 Q200 36 200 37 Q200 36 204 37 Q208 38 208 42" stroke="${clr}" stroke-width="0.5" stroke-linecap="round" opacity="0.2" fill="none"/>
  <line x1="192" y1="42" x2="192" y2="52" stroke="${clr}" stroke-width="0.4" stroke-linecap="round" opacity="0.18"/>
  <line x1="208" y1="42" x2="208" y2="52" stroke="${clr}" stroke-width="0.4" stroke-linecap="round" opacity="0.18"/>
  <line x1="190" y1="52" x2="210" y2="52" stroke="${clr}" stroke-width="0.45" stroke-linecap="round" opacity="0.16"/>
  <line x1="200" y1="37" x2="200" y2="52" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" opacity="0.1"/>

  <!-- Right tower tall arched windows (pair) -->
  <path d="M192 60 Q192 56 196 55 Q200 56 200 60 L200 72 L192 72 Z" stroke="${clr}" stroke-width="0.4" opacity="0.14" fill="none"/>
  <path d="M200 60 Q200 56 204 55 Q208 56 208 60 L208 72 L200 72 Z" stroke="${clr}" stroke-width="0.4" opacity="0.14" fill="none"/>
  <!-- Lower tower windows -->
  <path d="M192 82 Q192 78 196 77 Q200 78 200 82 L200 92 L192 92 Z" stroke="${clr}" stroke-width="0.35" opacity="0.12" fill="none"/>
  <path d="M200 82 Q200 78 204 77 Q208 78 208 82 L208 92 L200 92 Z" stroke="${clr}" stroke-width="0.35" opacity="0.12" fill="none"/>

  <!-- ═══════ ROSE WINDOW ═══════ -->
  <!-- Outer ring -->
  <circle cx="130" cy="55" r="10" stroke="${clr}" stroke-width="0.6" opacity="0.24" fill="none"/>
  <!-- Middle ring -->
  <circle cx="130" cy="55" r="7" stroke="${clr}" stroke-width="0.4" opacity="0.16" fill="none"/>
  <!-- Inner ring (centre medallion) -->
  <circle cx="130" cy="55" r="3.5" stroke="${clr}" stroke-width="0.35" opacity="0.14" fill="none"/>
  <!-- Centre dot -->
  <circle cx="130" cy="55" r="0.8" fill="${clr}" opacity="0.1"/>
  <!-- Rose window spokes (8 directions) -->
  <line x1="130" y1="45" x2="130" y2="65" stroke="${clr}" stroke-width="0.3" opacity="0.12"/>
  <line x1="120" y1="55" x2="140" y2="55" stroke="${clr}" stroke-width="0.3" opacity="0.12"/>
  <line x1="122.9" y1="47.9" x2="137.1" y2="62.1" stroke="${clr}" stroke-width="0.25" opacity="0.09"/>
  <line x1="137.1" y1="47.9" x2="122.9" y2="62.1" stroke="${clr}" stroke-width="0.25" opacity="0.09"/>
  <!-- Additional petal hints between spokes -->
  <line x1="124" y1="46.5" x2="130" y2="48.5" stroke="${clr}" stroke-width="0.2" opacity="0.07"/>
  <line x1="136" y1="46.5" x2="130" y2="48.5" stroke="${clr}" stroke-width="0.2" opacity="0.07"/>
  <line x1="124" y1="63.5" x2="130" y2="61.5" stroke="${clr}" stroke-width="0.2" opacity="0.07"/>
  <line x1="136" y1="63.5" x2="130" y2="61.5" stroke="${clr}" stroke-width="0.2" opacity="0.07"/>

  <!-- ═══════ CENTRAL ARCHED DOORWAY (Gothic pointed arch) ═══════ -->
  <path d="M118 130 L118 98 Q118 85 130 80 Q142 85 142 98 L142 130" stroke="${clr}" stroke-width="0.8" stroke-linecap="round" opacity="0.28" fill="none"/>
  <!-- Doorway inner arch (recessed moulding) -->
  <path d="M121 130 L121 100 Q121 88 130 84 Q139 88 139 100 L139 130" stroke="${clr}" stroke-width="0.35" stroke-linecap="round" opacity="0.12" fill="none"/>
  <!-- Door division line (double door) -->
  <line x1="130" y1="130" x2="130" y2="84" stroke="${clr}" stroke-width="0.25" opacity="0.1"/>
  <!-- Doorway archivolt detail -->
  <path d="M116 98 Q116 83 130 77 Q144 83 144 98" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" opacity="0.1" fill="none"/>
  <!-- Small tympanum cross above door -->
  <line x1="130" y1="78" x2="130" y2="82" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" opacity="0.12"/>
  <line x1="128.5" y1="80" x2="131.5" y2="80" stroke="${clr}" stroke-width="0.3" stroke-linecap="round" opacity="0.12"/>

  <!-- ═══════ FLANKING ARCHED DOORWAYS / PORTALS ═══════ -->
  <!-- Left portal -->
  <path d="M90 130 L90 110 Q90 103 97 100 Q104 103 104 110 L104 130" stroke="${clr}" stroke-width="0.5" stroke-linecap="round" opacity="0.18" fill="none"/>
  <!-- Left portal inner line -->
  <path d="M92 130 L92 111 Q92 105 97 103 Q102 105 102 111 L102 130" stroke="${clr}" stroke-width="0.25" opacity="0.08" fill="none"/>
  <!-- Right portal -->
  <path d="M156 130 L156 110 Q156 103 163 100 Q170 103 170 110 L170 130" stroke="${clr}" stroke-width="0.5" stroke-linecap="round" opacity="0.18" fill="none"/>
  <!-- Right portal inner line -->
  <path d="M158 130 L158 111 Q158 105 163 103 Q168 105 168 111 L168 130" stroke="${clr}" stroke-width="0.25" opacity="0.08" fill="none"/>

  <!-- ═══════ NAVE WINDOWS (tall lancet arches flanking rose) ═══════ -->
  <!-- Left lancet -->
  <path d="M96 70 Q96 64 103 62 Q110 64 110 70 L110 88 L96 88 Z" stroke="${clr}" stroke-width="0.45" opacity="0.16" fill="none"/>
  <!-- Left lancet inner frame -->
  <path d="M98 72 Q98 67 103 65 Q108 67 108 72 L108 86 L98 86 Z" stroke="${clr}" stroke-width="0.2" opacity="0.07" fill="none"/>
  <!-- Right lancet -->
  <path d="M150 70 Q150 64 157 62 Q164 64 164 70 L164 88 L150 88 Z" stroke="${clr}" stroke-width="0.45" opacity="0.16" fill="none"/>
  <!-- Right lancet inner frame -->
  <path d="M152 72 Q152 67 157 65 Q162 67 162 72 L162 86 L152 86 Z" stroke="${clr}" stroke-width="0.2" opacity="0.07" fill="none"/>

  <!-- ═══════ HORIZONTAL STRING COURSES / CORNICES ═══════ -->
  <!-- Upper cornice (below pediment) -->
  <line x1="78" y1="44" x2="182" y2="44" stroke="${clr}" stroke-width="0.45" opacity="0.15"/>
  <!-- Mid-level string course -->
  <line x1="58" y1="68" x2="82" y2="68" stroke="${clr}" stroke-width="0.3" opacity="0.1"/>
  <line x1="178" y1="68" x2="202" y2="68" stroke="${clr}" stroke-width="0.3" opacity="0.1"/>
  <!-- Lower string course above portals -->
  <line x1="82" y1="96" x2="178" y2="96" stroke="${clr}" stroke-width="0.3" opacity="0.1"/>

  <!-- ═══════ FLYING BUTTRESSES ═══════ -->
  <!-- Left buttress (outer aisle to ground) -->
  <line x1="46" y1="80" x2="34" y2="130" stroke="${clr}" stroke-width="0.4" opacity="0.1"/>
  <line x1="46" y1="80" x2="38" y2="80" stroke="${clr}" stroke-width="0.35" opacity="0.08"/>
  <!-- Left buttress pier -->
  <line x1="34" y1="120" x2="34" y2="130" stroke="${clr}" stroke-width="0.4" opacity="0.1"/>
  <!-- Right buttress -->
  <line x1="214" y1="80" x2="226" y2="130" stroke="${clr}" stroke-width="0.4" opacity="0.1"/>
  <line x1="214" y1="80" x2="222" y2="80" stroke="${clr}" stroke-width="0.35" opacity="0.08"/>
  <line x1="226" y1="120" x2="226" y2="130" stroke="${clr}" stroke-width="0.4" opacity="0.1"/>

  <!-- ═══════ ROOFLINE DEFINITION ═══════ -->
  <!-- Nave ridge line hint -->
  <line x1="82" y1="42" x2="78" y2="44" stroke="${clr}" stroke-width="0.4" opacity="0.15"/>
  <line x1="178" y1="42" x2="182" y2="44" stroke="${clr}" stroke-width="0.4" opacity="0.15"/>
  <!-- Aisle roof slope hints -->
  <line x1="58" y1="68" x2="82" y2="44" stroke="${clr}" stroke-width="0.3" opacity="0.09"/>
  <line x1="202" y1="68" x2="178" y2="44" stroke="${clr}" stroke-width="0.3" opacity="0.09"/>

  <!-- ═══════ SUBTLE HATCHING & SHADOW ACCENTS ═══════ -->
  <!-- Ground shadow hatching beneath towers -->
  <line x1="48" y1="128" x2="54" y2="128" stroke="${clr}" stroke-width="0.2" opacity="0.05"/>
  <line x1="50" y1="129" x2="56" y2="129" stroke="${clr}" stroke-width="0.2" opacity="0.04"/>
  <line x1="206" y1="128" x2="212" y2="128" stroke="${clr}" stroke-width="0.2" opacity="0.05"/>
  <line x1="204" y1="129" x2="210" y2="129" stroke="${clr}" stroke-width="0.2" opacity="0.04"/>
  <!-- Shadow on left side of nave -->
  <line x1="83" y1="46" x2="83" y2="94" stroke="${clr}" stroke-width="0.3" opacity="0.06"/>
  <!-- Shadow under pediment -->
  <line x1="86" y1="45" x2="174" y2="45" stroke="${clr}" stroke-width="0.25" opacity="0.06"/>
  <!-- Tower shadow accents -->
  <line x1="47" y1="40" x2="47" y2="128" stroke="${clr}" stroke-width="0.25" opacity="0.06"/>
  <line x1="215" y1="40" x2="215" y2="128" stroke="${clr}" stroke-width="0.2" opacity="0.04"/>`;
}

/**
 * Classical Catholic cathedral SVG with bell in resting state.
 * Used on the homepage.
 */
export const cathedralRestingSvg = `<svg viewBox="0 0 260 140" fill="none" xmlns="http://www.w3.org/2000/svg">
${cathedralBody("currentColor")}

  <!-- ═══════ BELL (resting, housed in left tower bell chamber) ═══════ -->
  <g opacity="0.28">
    <!-- Bell yoke / mount bar -->
    <line x1="55" y1="44" x2="65" y2="44" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>
    <!-- Bell crown -->
    <path d="M58 44 Q58 43.5 60 43 Q62 43.5 62 44" stroke="currentColor" stroke-width="0.35" fill="none" stroke-linecap="round"/>
    <!-- Bell body (resting upright) -->
    <path d="M57 44 Q57 47 55.5 50 L64.5 50 Q63 47 63 44" stroke="currentColor" stroke-width="0.5" fill="none" stroke-linecap="round"/>
    <!-- Bell rim (lip) -->
    <line x1="54.5" y1="50" x2="65.5" y2="50" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/>
    <!-- Bell waist detail -->
    <path d="M57.5 46 Q60 45.5 62.5 46" stroke="currentColor" stroke-width="0.2" fill="none" opacity="0.5"/>
    <!-- Clapper -->
    <line x1="60" y1="45" x2="60" y2="49.5" stroke="currentColor" stroke-width="0.35" stroke-linecap="round"/>
  </g>
</svg>`;

/**
 * Classical Catholic cathedral SVG with bell in ringing (tilted) state.
 * Used in emails. Returns an inline-friendly SVG string.
 */
export const cathedralRingingSvg = `<svg viewBox="0 0 260 140" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:260px;height:auto;">
${cathedralBody("#8a8a99")}

  <!-- ═══════ BELL (RINGING — tilted ~15° to the right, in left tower bell chamber) ═══════ -->
  <g opacity="0.34" transform="rotate(15, 60, 44)">
    <!-- Bell yoke / mount bar -->
    <line x1="55" y1="44" x2="65" y2="44" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round"/>
    <!-- Bell crown -->
    <path d="M58 44 Q58 43.5 60 43 Q62 43.5 62 44" stroke="#8a8a99" stroke-width="0.35" fill="none" stroke-linecap="round"/>
    <!-- Bell body -->
    <path d="M57 44 Q57 47 55.5 50 L64.5 50 Q63 47 63 44" stroke="#8a8a99" stroke-width="0.5" fill="none" stroke-linecap="round"/>
    <!-- Bell rim -->
    <line x1="54.5" y1="50" x2="65.5" y2="50" stroke="#8a8a99" stroke-width="0.6" stroke-linecap="round"/>
    <!-- Bell waist detail -->
    <path d="M57.5 46 Q60 45.5 62.5 46" stroke="#8a8a99" stroke-width="0.2" fill="none" opacity="0.5"/>
    <!-- Clapper (swung to right) -->
    <line x1="60" y1="45" x2="61.5" y2="49.5" stroke="#8a8a99" stroke-width="0.35" stroke-linecap="round"/>
  </g>

  <!-- Motion lines for ringing bell — two on each side, symmetrical to tilt -->
  <!-- Inner pair (smaller, closer to bell) -->
  <line x1="48" y1="42" x2="46" y2="45.5" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.22"/>
  <line x1="73" y1="40" x2="75" y2="43.5" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.22"/>
  <!-- Outer pair (slightly larger, slightly fainter) -->
  <line x1="44" y1="40" x2="41" y2="44.5" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.14"/>
  <line x1="77" y1="38" x2="80" y2="42.5" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.14"/>
</svg>`;

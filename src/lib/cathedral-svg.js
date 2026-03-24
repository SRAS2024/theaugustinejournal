// src/lib/cathedral-svg.js
// SVG artwork for the cathedral — resting (homepage) and ringing (emails)

/**
 * Classical Catholic cathedral SVG with bell in resting state.
 * Used on the homepage.
 */
export const cathedralRestingSvg = `<svg viewBox="0 0 260 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Ground line -->
  <line x1="30" y1="130" x2="230" y2="130" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.12"/>

  <!-- Main cathedral body -->
  <rect x="70" y="62" width="120" height="68" rx="1" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>

  <!-- Central nave (taller section) -->
  <rect x="95" y="42" width="70" height="88" rx="1" stroke="currentColor" stroke-width="0.7" opacity="0.28"/>

  <!-- Main pediment / triangular roof -->
  <path d="M90 44 L130 14 L170 44" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>

  <!-- Cross at apex -->
  <line x1="130" y1="3" x2="130" y2="14" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.38"/>
  <line x1="125.5" y1="7" x2="134.5" y2="7" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.38"/>

  <!-- Left tower -->
  <rect x="62" y="40" width="22" height="90" rx="1" stroke="currentColor" stroke-width="0.6" opacity="0.22"/>
  <!-- Left tower cap (pointed) -->
  <path d="M60 42 L73 22 L86 42" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.25"/>
  <!-- Left tower cross -->
  <line x1="73" y1="16" x2="73" y2="22" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>
  <line x1="70.5" y1="18.5" x2="75.5" y2="18.5" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>

  <!-- Right tower -->
  <rect x="176" y="40" width="22" height="90" rx="1" stroke="currentColor" stroke-width="0.6" opacity="0.22"/>
  <!-- Right tower cap (pointed) -->
  <path d="M174 42 L187 22 L200 42" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.25"/>
  <!-- Right tower cross -->
  <line x1="187" y1="16" x2="187" y2="22" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>
  <line x1="184.5" y1="18.5" x2="189.5" y2="18.5" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>

  <!-- Rose window (circular, centered) -->
  <circle cx="130" cy="58" r="8" stroke="currentColor" stroke-width="0.6" opacity="0.22"/>
  <circle cx="130" cy="58" r="4" stroke="currentColor" stroke-width="0.4" opacity="0.15"/>
  <!-- Rose window spokes -->
  <line x1="130" y1="50" x2="130" y2="66" stroke="currentColor" stroke-width="0.3" opacity="0.12"/>
  <line x1="122" y1="58" x2="138" y2="58" stroke="currentColor" stroke-width="0.3" opacity="0.12"/>
  <line x1="124.3" y1="52.3" x2="135.7" y2="63.7" stroke="currentColor" stroke-width="0.3" opacity="0.1"/>
  <line x1="135.7" y1="52.3" x2="124.3" y2="63.7" stroke="currentColor" stroke-width="0.3" opacity="0.1"/>

  <!-- Central arched doorway (Gothic pointed arch) -->
  <path d="M120 130 L120 100 Q120 88 130 85 Q140 88 140 100 L140 130" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.25"/>

  <!-- Left arched window -->
  <path d="M100 90 A6 6 0 0 1 112 90 L112 105 L100 105 Z" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.16"/>

  <!-- Right arched window -->
  <path d="M148 90 A6 6 0 0 1 160 90 L160 105 L148 105 Z" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" opacity="0.16"/>

  <!-- Left tower windows -->
  <path d="M69 60 A4 4 0 0 1 77 60 L77 70 L69 70 Z" stroke="currentColor" stroke-width="0.4" opacity="0.14"/>
  <path d="M69 80 A4 4 0 0 1 77 80 L77 90 L69 90 Z" stroke="currentColor" stroke-width="0.4" opacity="0.14"/>

  <!-- Right tower windows -->
  <path d="M183 60 A4 4 0 0 1 191 60 L191 70 L183 70 Z" stroke="currentColor" stroke-width="0.4" opacity="0.14"/>
  <path d="M183 80 A4 4 0 0 1 191 80 L191 90 L183 90 Z" stroke="currentColor" stroke-width="0.4" opacity="0.14"/>

  <!-- Bell (resting, centered in bell chamber area beneath left tower cap) -->
  <g opacity="0.26">
    <!-- Bell mount bar -->
    <line x1="69" y1="48" x2="77" y2="48" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"/>
    <!-- Bell body (resting upright) -->
    <path d="M70.5 48 Q70.5 52 69 55 L77 55 Q75.5 52 75.5 48" stroke="currentColor" stroke-width="0.5" fill="none" stroke-linecap="round"/>
    <!-- Bell rim -->
    <line x1="68" y1="55" x2="78" y2="55" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/>
    <!-- Clapper -->
    <line x1="73" y1="49" x2="73" y2="54" stroke="currentColor" stroke-width="0.35" stroke-linecap="round"/>
  </g>

  <!-- Subtle flying buttresses -->
  <line x1="62" y1="90" x2="50" y2="130" stroke="currentColor" stroke-width="0.35" opacity="0.1"/>
  <line x1="198" y1="90" x2="210" y2="130" stroke="currentColor" stroke-width="0.35" opacity="0.1"/>

  <!-- Side entrance arches -->
  <path d="M75 118 A5 5 0 0 1 85 118 L85 130 L75 130 Z" stroke="currentColor" stroke-width="0.4" opacity="0.13"/>
  <path d="M175 118 A5 5 0 0 1 185 118 L185 130 L175 130 Z" stroke="currentColor" stroke-width="0.4" opacity="0.13"/>
</svg>`;

/**
 * Classical Catholic cathedral SVG with bell in ringing (tilted) state.
 * Used in emails. The bell is tilted and has motion lines.
 * Returns an inline-friendly SVG string suitable for embedding in HTML emails.
 */
export const cathedralRingingSvg = `<svg viewBox="0 0 260 140" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:260px;height:auto;">
  <!-- Ground line -->
  <line x1="30" y1="130" x2="230" y2="130" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.12"/>

  <!-- Main cathedral body -->
  <rect x="70" y="62" width="120" height="68" rx="1" stroke="#8a8a99" stroke-width="0.7" opacity="0.25"/>

  <!-- Central nave (taller section) -->
  <rect x="95" y="42" width="70" height="88" rx="1" stroke="#8a8a99" stroke-width="0.7" opacity="0.28"/>

  <!-- Main pediment / triangular roof -->
  <path d="M90 44 L130 14 L170 44" stroke="#8a8a99" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>

  <!-- Cross at apex -->
  <line x1="130" y1="3" x2="130" y2="14" stroke="#8a8a99" stroke-width="0.8" stroke-linecap="round" opacity="0.38"/>
  <line x1="125.5" y1="7" x2="134.5" y2="7" stroke="#8a8a99" stroke-width="0.8" stroke-linecap="round" opacity="0.38"/>

  <!-- Left tower -->
  <rect x="62" y="40" width="22" height="90" rx="1" stroke="#8a8a99" stroke-width="0.6" opacity="0.22"/>
  <!-- Left tower cap (pointed) -->
  <path d="M60 42 L73 22 L86 42" stroke="#8a8a99" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.25"/>
  <!-- Left tower cross -->
  <line x1="73" y1="16" x2="73" y2="22" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>
  <line x1="70.5" y1="18.5" x2="75.5" y2="18.5" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>

  <!-- Right tower -->
  <rect x="176" y="40" width="22" height="90" rx="1" stroke="#8a8a99" stroke-width="0.6" opacity="0.22"/>
  <!-- Right tower cap (pointed) -->
  <path d="M174 42 L187 22 L200 42" stroke="#8a8a99" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.25"/>
  <!-- Right tower cross -->
  <line x1="187" y1="16" x2="187" y2="22" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>
  <line x1="184.5" y1="18.5" x2="189.5" y2="18.5" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.28"/>

  <!-- Rose window -->
  <circle cx="130" cy="58" r="8" stroke="#8a8a99" stroke-width="0.6" opacity="0.22"/>
  <circle cx="130" cy="58" r="4" stroke="#8a8a99" stroke-width="0.4" opacity="0.15"/>
  <line x1="130" y1="50" x2="130" y2="66" stroke="#8a8a99" stroke-width="0.3" opacity="0.12"/>
  <line x1="122" y1="58" x2="138" y2="58" stroke="#8a8a99" stroke-width="0.3" opacity="0.12"/>
  <line x1="124.3" y1="52.3" x2="135.7" y2="63.7" stroke="#8a8a99" stroke-width="0.3" opacity="0.1"/>
  <line x1="135.7" y1="52.3" x2="124.3" y2="63.7" stroke="#8a8a99" stroke-width="0.3" opacity="0.1"/>

  <!-- Central arched doorway -->
  <path d="M120 130 L120 100 Q120 88 130 85 Q140 88 140 100 L140 130" stroke="#8a8a99" stroke-width="0.7" stroke-linecap="round" opacity="0.25"/>

  <!-- Left arched window -->
  <path d="M100 90 A6 6 0 0 1 112 90 L112 105 L100 105 Z" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.16"/>

  <!-- Right arched window -->
  <path d="M148 90 A6 6 0 0 1 160 90 L160 105 L148 105 Z" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round" opacity="0.16"/>

  <!-- Left tower windows -->
  <path d="M69 60 A4 4 0 0 1 77 60 L77 70 L69 70 Z" stroke="#8a8a99" stroke-width="0.4" opacity="0.14"/>
  <path d="M69 80 A4 4 0 0 1 77 80 L77 90 L69 90 Z" stroke="#8a8a99" stroke-width="0.4" opacity="0.14"/>

  <!-- Right tower windows -->
  <path d="M183 60 A4 4 0 0 1 191 60 L191 70 L183 70 Z" stroke="#8a8a99" stroke-width="0.4" opacity="0.14"/>
  <path d="M183 80 A4 4 0 0 1 191 80 L191 90 L183 90 Z" stroke="#8a8a99" stroke-width="0.4" opacity="0.14"/>

  <!-- Bell (RINGING — tilted ~15 degrees to the right) -->
  <g opacity="0.32" transform="rotate(15, 73, 48)">
    <!-- Bell mount bar -->
    <line x1="69" y1="48" x2="77" y2="48" stroke="#8a8a99" stroke-width="0.5" stroke-linecap="round"/>
    <!-- Bell body -->
    <path d="M70.5 48 Q70.5 52 69 55 L77 55 Q75.5 52 75.5 48" stroke="#8a8a99" stroke-width="0.5" fill="none" stroke-linecap="round"/>
    <!-- Bell rim -->
    <line x1="68" y1="55" x2="78" y2="55" stroke="#8a8a99" stroke-width="0.6" stroke-linecap="round"/>
    <!-- Clapper (swung) -->
    <line x1="73" y1="49" x2="74.5" y2="54" stroke="#8a8a99" stroke-width="0.35" stroke-linecap="round"/>
  </g>

  <!-- Motion lines for ringing bell -->
  <!-- Inner pair (smaller, closer) -->
  <line x1="62" y1="46" x2="60" y2="49" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.22"/>
  <line x1="85" y1="44" x2="87" y2="47" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.22"/>
  <!-- Outer pair (larger, fainter) -->
  <line x1="58" y1="44" x2="55" y2="48" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.14"/>
  <line x1="88" y1="42" x2="91" y2="46" stroke="#8a8a99" stroke-width="0.4" stroke-linecap="round" opacity="0.14"/>

  <!-- Subtle flying buttresses -->
  <line x1="62" y1="90" x2="50" y2="130" stroke="#8a8a99" stroke-width="0.35" opacity="0.1"/>
  <line x1="198" y1="90" x2="210" y2="130" stroke="#8a8a99" stroke-width="0.35" opacity="0.1"/>

  <!-- Side entrance arches -->
  <path d="M75 118 A5 5 0 0 1 85 118 L85 130 L75 130 Z" stroke="#8a8a99" stroke-width="0.4" opacity="0.13"/>
  <path d="M175 118 A5 5 0 0 1 185 118 L185 130 L175 130 Z" stroke="#8a8a99" stroke-width="0.4" opacity="0.13"/>
</svg>`;

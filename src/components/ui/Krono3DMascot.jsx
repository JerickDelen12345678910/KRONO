export function Krono3DMascot({ variant = 'titan', action = 'idle', size = 110, className = '' }) {
  const uid = `${variant}-${action}`;

  return (
    <div
      className={`krono-true-3d-rig is-${variant} is-action-${action} ${className}`.trim()}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 220" width="100%" height="100%" fill="none" overflow="visible">
        <defs>
          {/* 3D Spherical Body & Limb Lighting */}
          <radialGradient id={`bodyGrad-${uid}`} cx="36%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#B8D4F0" />
            <stop offset="45%" stopColor="#6E8EB2" />
            <stop offset="85%" stopColor="#3B516E" />
            <stop offset="100%" stopColor="#233247" />
          </radialGradient>

          <radialGradient id={`suitGrad-${uid}`} cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#4A607A" />
            <stop offset="55%" stopColor="#2B394D" />
            <stop offset="100%" stopColor="#182230" />
          </radialGradient>

          <radialGradient id={`orangeGrad-${uid}`} cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#FFB067" />
            <stop offset="55%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#9A3412" />
          </radialGradient>

          <radialGradient id={`limbGrad-${uid}`} cx="32%" cy="26%" r="74%">
            <stop offset="0%" stopColor="#9BB9D9" />
            <stop offset="55%" stopColor="#567294" />
            <stop offset="100%" stopColor="#26364D" />
          </radialGradient>

          <radialGradient id={`metalGrad-${uid}`} cx="30%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="50%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1E293B" />
          </radialGradient>

          <linearGradient id={`holoGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.88" />
            <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0.82" />
          </linearGradient>
        </defs>

        {/* Ground contact oval only directly under feet (no outer edge shading) */}
        <ellipse className="rig-floor-shadow" cx="100" cy="204" rx="36" ry="7" fill="rgba(2, 6, 23, 0.45)" />

        {/* Articulated Left & Right Legs + Feet */}
        <g className="rig-leg-left">
          <rect x="74" y="152" width="18" height="38" rx="9" fill={`url(#limbGrad-${uid})`} />
          <rect x="68" y="182" width="25" height="14" rx="7" fill={`url(#limbGrad-${uid})`} />
        </g>

        <g className="rig-leg-right">
          <rect x="108" y="152" width="18" height="38" rx="9" fill={`url(#limbGrad-${uid})`} />
          <rect x="107" y="182" width="25" height="14" rx="7" fill={`url(#limbGrad-${uid})`} />
        </g>

        {/* Backpack for Atlas */}
        {variant === 'atlas' && (
          <g className="rig-backpack">
            <rect x="132" y="84" width="26" height="58" rx="12" fill={`url(#suitGrad-${uid})`} />
            <rect x="136" y="74" width="22" height="14" rx="7" fill={`url(#orangeGrad-${uid})`} />
          </g>
        )}

        {/* Back/Left Arm */}
        <g className="rig-arm-left">
          <path
            d="M 56 102 C 34 102, 28 84, 34 66"
            stroke={`url(#limbGrad-${uid})`}
            strokeWidth="16"
            strokeLinecap="round"
          />
          <circle cx="34" cy="64" r="10" fill={`url(#limbGrad-${uid})`} />
          {variant === 'titan' && (
            <g className="rig-dumbbell-left">
              <rect x="14" y="59" width="40" height="8" rx="4" fill={`url(#metalGrad-${uid})`} />
              <rect x="12" y="47" width="9" height="32" rx="4" fill={`url(#suitGrad-${uid})`} />
              <rect x="47" y="47" width="9" height="32" rx="4" fill={`url(#suitGrad-${uid})`} />
            </g>
          )}
          {variant === 'atlas' && (
            <g className="rig-pin-beacon">
              <ellipse cx="32" cy="54" rx="12" ry="4" fill="#38BDF8" />
              <path
                d="M 32 16 C 22 16, 15 23, 15 32 C 15 43, 32 53, 32 53 C 32 53, 49 43, 49 32 C 49 23, 42 16, 32 16 Z"
                fill={`url(#orangeGrad-${uid})`}
              />
              <circle cx="32" cy="31" r="5.5" fill="#1E293B" />
            </g>
          )}
        </g>

        {/* 3D Capsule Torso & Head */}
        <g className="rig-torso">
          <rect x="52" y="34" width="96" height="132" rx="48" fill={`url(#bodyGrad-${uid})`} />
          {/* 3D Suit / Overalls */}
          <path
            d="M 52 104 C 52 146, 68 166, 100 166 C 132 166, 148 146, 148 104 L 148 116 C 148 148, 130 166, 100 166 C 70 166, 52 148, 52 116 Z"
            fill={`url(#suitGrad-${uid})`}
          />
          <path
            d="M 53 102 C 66 116, 134 116, 147 102 L 147 124 C 147 150, 128 166, 100 166 C 72 166, 53 150, 53 124 Z"
            fill={`url(#suitGrad-${uid})`}
          />

          {/* Variant Headgear */}
          {variant === 'titan' && (
            <path
              d="M 53 66 C 74 56, 126 56, 147 66 L 146 80 C 126 70, 74 70, 54 80 Z"
              fill={`url(#orangeGrad-${uid})`}
            />
          )}

          {variant === 'atlas' && (
            <g className="rig-cap">
              <path d="M 52 72 C 52 40, 148 40, 148 72 Z" fill={`url(#suitGrad-${uid})`} />
              <circle cx="100" cy="37" r="6" fill={`url(#orangeGrad-${uid})`} />
              <rect x="82" y="64" width="36" height="10" rx="5" fill={`url(#orangeGrad-${uid})`} />
              <path d="M 142 66 L 166 71 C 168 75, 156 78, 142 75 Z" fill={`url(#orangeGrad-${uid})`} />
            </g>
          )}

          {/* Expressive 3D Face */}
          <g className="rig-face">
            {variant === 'titan' ? (
              <>
                <path d="M 74 88 Q 81 80 88 88" stroke="#1E293B" strokeWidth="4.5" strokeLinecap="round" />
                <path d="M 112 88 Q 119 80 126 88" stroke="#1E293B" strokeWidth="4.5" strokeLinecap="round" />
                <path d="M 89 96 Q 100 112 111 96 Z" fill="#1E293B" />
                <ellipse cx="100" cy="103" rx="6" ry="3.5" fill="#FB7185" />
              </>
            ) : (
              <>
                <ellipse cx="83" cy="88" rx="6.5" ry="9" fill="#1E293B" />
                <circle cx="81" cy="84" r="2.2" fill="#E0F2FE" />
                <ellipse cx="117" cy="88" rx="6.5" ry="9" fill="#1E293B" />
                <circle cx="115" cy="84" r="2.2" fill="#E0F2FE" />
                <path d="M 93 99 Q 100 105 107 99" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" />
              </>
            )}

            {/* Chrono 3D Glasses */}
            {variant === 'chrono' && (
              <g className="rig-glasses">
                <circle cx="83" cy="88" r="16" stroke="#334155" strokeWidth="4.5" fill="rgba(186, 230, 253, 0.14)" />
                <circle cx="117" cy="88" r="16" stroke="#334155" strokeWidth="4.5" fill="rgba(186, 230, 253, 0.14)" />
                <line x1="99" y1="88" x2="101" y2="88" stroke="#334155" strokeWidth="4.5" />
              </g>
            )}
          </g>
        </g>

        {/* Front/Right Arm (Waves when action="wave", swings naturally when action="walk", lifts when action="lift") */}
        <g className="rig-arm-right">
          {action === 'wave' ? (
            <>
              <path
                d="M 144 102 C 166 96, 176 74, 172 52"
                stroke={`url(#limbGrad-${uid})`}
                strokeWidth="16"
                strokeLinecap="round"
              />
              {/* 3D Open Waving Hand */}
              <g className="rig-wave-fingers">
                <circle cx="172" cy="48" r="10.5" fill={`url(#limbGrad-${uid})`} />
                <rect x="163" y="34" width="4.5" height="12" rx="2.2" fill={`url(#limbGrad-${uid})`} />
                <rect x="169" y="31" width="4.5" height="14" rx="2.2" fill={`url(#limbGrad-${uid})`} />
                <rect x="175" y="33" width="4.5" height="13" rx="2.2" fill={`url(#limbGrad-${uid})`} />
                <rect x="180" y="37" width="4.5" height="11" rx="2.2" fill={`url(#limbGrad-${uid})`} />
              </g>
            </>
          ) : (
            <>
              <path
                d="M 144 102 C 166 102, 172 84, 166 66"
                stroke={`url(#limbGrad-${uid})`}
                strokeWidth="16"
                strokeLinecap="round"
              />
              <circle cx="166" cy="64" r="10" fill={`url(#limbGrad-${uid})`} />
              {variant === 'titan' && (
                <g className="rig-dumbbell-right">
                  <rect x="146" y="59" width="40" height="8" rx="4" fill={`url(#metalGrad-${uid})`} />
                  <rect x="144" y="47" width="9" height="32" rx="4" fill={`url(#suitGrad-${uid})`} />
                  <rect x="179" y="47" width="9" height="32" rx="4" fill={`url(#suitGrad-${uid})`} />
                </g>
              )}
            </>
          )}
        </g>

        {/* Holographic 3D Glass Tablet for Chrono */}
        {variant === 'chrono' && (
          <g className="rig-holo-tablet">
            <rect
              x="66"
              y="112"
              width="68"
              height="44"
              rx="8"
              fill={`url(#holoGrad-${uid})`}
              stroke="#7DD3FC"
              strokeWidth="2"
            />
            <circle cx="75" cy="120" r="2.2" fill="#FB923C" />
            <circle cx="82" cy="120" r="2.2" fill="#38BDF8" />
            <line x1="75" y1="132" x2="122" y2="132" stroke="#E0F2FE" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="75" y1="141" x2="108" y2="141" stroke="#BAE6FD" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
}

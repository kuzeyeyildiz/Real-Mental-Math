type LogoVariant = 'primary' | 'on-dark' | 'mono';
type LogoLayout = 'horizontal' | 'stacked';

interface LogoMarkProps {
  size?: number;
  variant?: LogoVariant;
}

interface LogoProps {
  size?: number;
  variant?: LogoVariant;
  layout?: LogoLayout;
  showWordmark?: boolean;
  showKicker?: boolean;
}

const GLYPH_RATIO = 0.34;
const RADIUS_RATIO = 0.25;

function getColors(variant: LogoVariant) {
  if (variant === 'on-dark') {
    return {
      bg: '#ffffff',
      primary: '#4b40d6',
      secondary: '#a59bff',
      wordmark: '#ffffff',
      period: '#a59bff',
      kicker: '#9a9db2',
    };
  }
  if (variant === 'mono') {
    return {
      bg: '#1b1d2a',
      primary: '#ffffff',
      secondary: '#9a9db2',
      wordmark: '#1b1d2a',
      period: '#1b1d2a',
      kicker: '#9a9db2',
    };
  }
  return {
    bg: '#4b40d6',
    primary: '#ffffff',
    secondary: '#c9c3ff',
    wordmark: '#1b1d2a',
    period: '#4b40d6',
    kicker: '#9a9db2',
  };
}

export function LogoMark({ size = 76, variant = 'primary' }: LogoMarkProps) {
  const colors = getColors(variant);
  const radius = Math.round(size * RADIUS_RATIO);
  const gSize = Math.round(size * GLYPH_RATIO);
  const gSizeSm = Math.round(size * GLYPH_RATIO * 0.92);
  const shadow = variant === 'primary' ? '0 6px 18px rgba(75,64,214,.32)' : undefined;
  const half = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Numo logo mark"
    >
      <rect width={size} height={size} rx={radius} fill={colors.bg} />
      {shadow && (
        <defs>
          <filter id="logo-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(75,64,214,.32)" />
          </filter>
        </defs>
      )}
      {/* + top-left – primary */}
      <text
        x={half * 0.5}
        y={half * 0.62}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight="700"
        fontSize={gSize}
        fill={colors.primary}
      >+</text>
      {/* − top-right – secondary */}
      <text
        x={half * 1.5}
        y={half * 0.62}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight="700"
        fontSize={gSize}
        fill={colors.secondary}
      >−</text>
      {/* × bottom-left – secondary */}
      <text
        x={half * 0.5}
        y={half * 1.52}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight="700"
        fontSize={gSizeSm}
        fill={colors.secondary}
      >×</text>
      {/* ÷ bottom-right – primary */}
      <text
        x={half * 1.5}
        y={half * 1.52}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight="700"
        fontSize={gSizeSm}
        fill={colors.primary}
      >÷</text>
    </svg>
  );
}

export function Wordmark({
  variant = 'primary',
  fontSize = 34,
}: {
  variant?: LogoVariant;
  fontSize?: number;
}) {
  const colors = getColors(variant);
  return (
    <span
      style={{
        font: `800 ${fontSize}px 'Albert Sans', sans-serif`,
        color: colors.wordmark,
        letterSpacing: '-0.01em',
        lineHeight: 1,
      }}
    >
      Numo<span style={{ color: colors.period }}>.</span>
    </span>
  );
}

export function Logo({
  size = 76,
  variant = 'primary',
  layout = 'horizontal',
  showWordmark = true,
  showKicker = false,
}: LogoProps) {
  const wordmarkSize = Math.round(size * 0.45);
  const kickerSize = Math.max(9, Math.round(size * 0.13));
  const colors = getColors(variant);
  const gap = Math.round(size * 0.24);

  if (layout === 'stacked') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
        <LogoMark size={size} variant={variant} />
        {showWordmark && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <Wordmark variant={variant} fontSize={wordmarkSize} />
            {showKicker && (
              <span
                style={{
                  font: `600 ${kickerSize}px 'Albert Sans', sans-serif`,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: colors.kicker,
                }}
              >
                Mental Math
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <LogoMark size={size} variant={variant} />
      {showWordmark && <Wordmark variant={variant} fontSize={wordmarkSize} />}
    </div>
  );
}

export default Logo;

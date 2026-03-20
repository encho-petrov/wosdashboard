export function FoundryIcon({ size = 24, className, ...props }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            {...props}
        >
            {/* Cannon Base/Mount */}
            <path d="M5 21h10" />
            <path d="M7 21v-4l2-2" />

            {/* Main Thick Barrel (Angled) */}
            <line x1="6" y1="16" x2="17" y2="7" strokeWidth="6" />

            {/* Muzzle Flare */}
            <line x1="16" y1="4" x2="20" y2="8" strokeWidth="3" />

            {/* Wheel Outer Rim */}
            <circle cx="11" cy="15" r="5" fill="var(--tw-colors-gray-900, #111827)" />

            {/* Wheel Inner Hub */}
            <circle cx="11" cy="15" r="1.5" />

            {/* Wheel Spokes */}
            <path d="M11 10v3.5 M11 16.5v3.5 M6 15h3.5 M12.5 15h3.5" />

            {/* Diagonal Spokes */}
            <path d="M8 12l2 2 M14 18l-2-2 M14 12l-2 2 M8 18l2-2" />
        </svg>
    );
}
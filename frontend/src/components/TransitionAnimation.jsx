import React, { useEffect, useState, useRef } from 'react';

const TransitionAnimation = ({ isActive, onMidPoint, onComplete }) => {
    const [stage, setStage] = useState('idle'); // idle, animating
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        setDimensions({
            width: window.innerWidth,
            height: window.innerHeight
        });
    }, []);

    const { width, height } = dimensions;

    // Generate Golden Spiral Path
    // Logarithmic spiral: r = a * e^(b * theta)
    // Golden spiral b = ln(phi) / (pi/2) approx 0.3063489
    const generateSpiralPath = () => {
        if (!width) return '';

        const centerX = width / 2;
        const centerY = height / 2;
        // Scale factor to cover screen
        const maxRadius = Math.sqrt(width * width + height * height) * 0.2;
        const b = 0.3063489;
        const rotations = 3;
        const points = [];

        // We want to spiral IN from outside, or OUT from center?
        // "Fly across the screen defining a sort of fibonacci spiral"
        // Let's spiral across. Start far left, spiral through center, end far right?
        // Or standard golden spiral: starts at a point and expands.
        // Let's do a spiral that starts off-screen and spirals in to center then out?
        // Simpler: A spiral that starts small and gets big, traversing the screen.

        // Let's generate points for a spiral starting from center-ish
        for (let i = 0; i <= 100; i++) {
            const t = (i / 100) * (Math.PI * rotations);
            // Reverse direction to spiral inward-out or just big spiral
            // Let's do a large spiral entering from bottom left
            const angle = t + 2.5; // Rotate to start nicely
            const radius = maxRadius * (i / 100);

            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            points.push(`${x},${y}`);
        }

        // Construct smooth curve through points
        // For simplicity, using a polyline-like path with many segments looks smooth enough
        // or we can just use L (line to) for dense points
        return `M ${points[0]} L ${points.slice(1).join(' ')}`;
    };

    const pathString = React.useMemo(() => generateSpiralPath(), [width, height]);

    useEffect(() => {
        if (isActive) {
            setStage('animating');

            // Timing constants
            const totalDuration = 1800;
            const midPoint = totalDuration * 1;

            // Trigger content switch at midpoint
            const midTimer = setTimeout(() => {
                if (onMidPoint) onMidPoint();
            }, midPoint);

            // Cleanup at end
            const endTimer = setTimeout(() => {
                if (onComplete) onComplete();
            }, totalDuration);

            return () => {
                clearTimeout(midTimer);
                clearTimeout(endTimer);
            };
        } else {
            // Reset stage when not active
            const resetTimer = setTimeout(() => setStage('idle'), 300); // Wait for fade out
            return () => clearTimeout(resetTimer);
        }
    }, [isActive, onMidPoint, onComplete]);

    if (!isActive && stage === 'idle') return null;

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
            {/* Backdrop blur effect */}
            <div className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${stage === 'animating' && isActive ? 'opacity-100' : 'opacity-0'}`} />

            {/* SVG Container for the Line */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#34d399" /> {/* emerald-400 */}
                        <stop offset="100%" stopColor="#064e3b" /> {/* emerald-900 */}
                    </linearGradient>
                </defs>
                {pathString && (
                    <path
                        d={pathString}
                        fill="none"
                        stroke="url(#emeraldGradient)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        pathLength="1"
                        className={stage === 'animating' ? 'animate-draw-tail' : 'opacity-0'}
                    />
                )}
            </svg>

            {/* The Football */}
            {pathString && (
                <div
                    className={`absolute top-0 left-0 w-16 h-16 ${stage === 'animating' ? 'animate-follow-path' : 'opacity-0'}`}
                    style={{
                        offsetPath: `path('${pathString}')`,
                        offsetRotate: 'auto',
                        offsetAnchor: 'center', // Ensure center follows path
                    }}
                >
                    <img
                        src="/logo.png"
                        alt="Football"
                        className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(16,185,129,0.6)] animate-spin-fast"
                    />
                </div>
            )}

            <style jsx>{`
                /*
                   Create a "comet tail" effect:
                   stroke-dasharray: [length of dash] [length of gap]
                   We want a dash that is maybe 0.3 (30%) long.
                   We animate stroke-dashoffset to move it.
                   To make it "disappear", we can start with it visible and move it off,
                   or have the gap consume it.

                   Actually, to have it "follow" the ball and disappear:
                   The ball is at the 'head' of the dash.
                   So we need the dash to move from 0 to 1+tail_length.
                */
                .animate-draw-tail {
                    stroke-dasharray: 0.4 1; /* 40% visible tail */
                    stroke-dashoffset: 0.4; /* Start with tail hidden before start */
                    animation: 
                        draw-tail 2.0s cubic-bezier(0.4, 0, 0.2, 1) forwards,
                        fade-out-end 2.0s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }

                .animate-follow-path {
                    offset-distance: 0%;
                    animation: 
                        follow-path 2.0s cubic-bezier(0.4, 0, 0.2, 1) forwards,
                        fade-out-end 2.0s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }

                @keyframes draw-tail {
                    from { stroke-dashoffset: 0.4; }
                    to { stroke-dashoffset: -0.6; } /* Move dash so tip is exactly at end */
                }

                @keyframes follow-path {
                    from { offset-distance: 0%; }
                    to { offset-distance: 100%; }
                }

                @keyframes fade-out-end {
                    0%, 80% { opacity: 1; }
                    100% { opacity: 0; }
                }
                
                @keyframes spin-fast {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(720deg); }
                }
                
                .animate-spin-fast {
                    animation: spin-fast 2.0s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default TransitionAnimation;

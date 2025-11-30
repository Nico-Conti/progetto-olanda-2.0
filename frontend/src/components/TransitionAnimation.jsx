import React, { useEffect, useState } from 'react';

const TransitionAnimation = ({ isActive, onMidPoint, onComplete }) => {
    const [stage, setStage] = useState('idle'); // idle, animating

    useEffect(() => {
        if (isActive) {
            setStage('animating');

            // Timing constants
            const totalDuration = 1000;
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
            {/* Backdrop blur effect that fades in/out */}
            <div className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-1${stage === 'animating' && isActive ? 'opacity-100' : 'opacity-0'}`} />

            {/* The Spiral Container */}
            <div className="relative w-full h-full">
                {/* The Football */}
                <div className="absolute w-16 h-16 top-1/2 left-1/2 -ml-8 -mt-8 animate-spiral-fly">
                    <img
                        src="/logo.png"
                        alt="Football"
                        className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(16,185,129,0.6)] animate-spin-fast"
                    />
                </div>

                {/* Optional: Trail particles or effect could go here */}
            </div>

            <style jsx>{`
                @keyframes spiral-fly {
                    0% {
                        transform: translate(-50vw, 50vh) scale(0.5);
                        opacity: 0;
                    }
                    20% {
                        transform: translate(-30vw, 20vh) scale(0.8);
                        opacity: 1;
                    }
                    40% {
                        transform: translate(-10vw, -10vh) scale(1.2);
                    }
                    50% {
                        transform: translate(0, 0) scale(1.5);
                    }
                    60% {
                        transform: translate(10vw, 10vh) scale(1.2);
                    }
                    80% {
                        transform: translate(30vw, -20vh) scale(0.8);
                    }
                    100% {
                        transform: translate(50vw, -50vh) scale(0.5);
                        opacity: 0;
                    }
                }
                
                @keyframes spin-fast {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(720deg); }
                }

                .animate-spiral-fly {
                    animation: spiral-fly 1.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }
                
                .animate-spin-fast {
                    animation: spin-fast 1.25s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default TransitionAnimation;

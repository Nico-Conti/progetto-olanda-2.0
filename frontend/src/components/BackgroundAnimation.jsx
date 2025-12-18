import React, { useState } from 'react';

const BackgroundAnimation = () => {
    // Track which logos are currently "popped"
    const [poppedIndices, setPoppedIndices] = useState(new Set());

    // Generate random positions for the footballs
    const shapes = [
        { top: '10%', left: '5%', size: 64, delay: 0, duration: 15 },
        { top: '20%', left: '85%', size: 96, delay: 2, duration: 20 },
        { top: '60%', left: '15%', size: 48, delay: 5, duration: 18 },
        { top: '80%', left: '70%', size: 80, delay: 1, duration: 25 },
        { top: '40%', left: '90%', size: 56, delay: 3, duration: 22 },
        { top: '15%', left: '50%', size: 72, delay: 4, duration: 19 },
    ];

    const handlePop = (index) => {
        if (poppedIndices.has(index)) return;

        // Visual pop
        setPoppedIndices(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
        });

        // Play pop sound (first 1 second of malepisello.mp3)
        const audio = new Audio('/sounds/malepisello.mp3');
        audio.volume = 0.5;
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise.catch(() => { }); // Ignore error if file missing or autoplay blocked
        }

        // Stop after 1 second
        setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
        }, 1000);

        // Reappear after 3 seconds
        setTimeout(() => {
            setPoppedIndices(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }, 3000);
    };

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            {shapes.map((shape, index) => {
                const isPopped = poppedIndices.has(index);
                return (
                    <div
                        key={index}
                        onClick={() => handlePop(index)}
                        className={`absolute animate-float text-white pointer-events-auto cursor-pointer transition-all duration-300 ease-out
                            ${isPopped
                                ? 'scale-150 opacity-0'
                                : 'opacity-10 scale-100 hover:opacity-40 hover:scale-110 active:scale-95'
                            }`}
                        style={{
                            top: shape.top,
                            left: shape.left,
                            width: `${shape.size}px`,
                            height: `${shape.size}px`,
                            animationDelay: `${shape.delay}s`,
                            animationDuration: `${shape.duration}s`,
                        }}
                    >
                        <img
                            src="/logo.png"
                            alt="Floating Logo"
                            className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        />
                    </div>
                );
            })}
        </div>
    );
};

export default BackgroundAnimation;

import React from 'react';

const FootballIcon = ({ className, style }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
        <path d="M12 2v20" />
        <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.1" />
    </svg>
);

const BackgroundAnimation = () => {
    // Generate random positions for the footballs
    const shapes = [
        { top: '10%', left: '5%', size: 64, delay: 0, duration: 15 },
        { top: '20%', left: '85%', size: 96, delay: 2, duration: 20 },
        { top: '60%', left: '15%', size: 48, delay: 5, duration: 18 },
        { top: '80%', left: '70%', size: 80, delay: 1, duration: 25 },
        { top: '40%', left: '90%', size: 56, delay: 3, duration: 22 },
        { top: '15%', left: '50%', size: 72, delay: 4, duration: 19 },
    ];

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            {shapes.map((shape, index) => (
                <div
                    key={index}
                    className="absolute animate-float opacity-10 text-white"
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
                        className="w-full h-full object-contain"
                    />
                </div>
            ))}
        </div>
    );
};

export default BackgroundAnimation;

import React from 'react';

import GlassPanel from './ui/GlassPanel';
import ToggleSwitch from './ui/ToggleSwitch';

const Header = ({
    logoSrc = "/logo.png",
    onLogoClick,
    title,
    showBackendStatus = false,
    isBackendOnline = false,
    children,
    showSound = false,
    showAnimationToggle = false,
    isAnimationEnabled,
    onToggleAnimation,
    showBetSlip = false,
    betsCount = 0,
    onOpenBetSlip,
    pageName = '',
}) => {
    const playSound = () => {
        const audio = new Audio('/sounds/malepisello.mp3');
        audio.playbackRate = Math.random() * (1.5 - 0.5) + 0.5;
        audio.play().catch(e => console.log("Audio play failed (file might be missing):", e));
    };

    return (
        <GlassPanel className="sticky top-0 z-50 border-b border-white/5 mb-8 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between relative">
                {/* Left Section: Logo & Title */}
                <div
                    className={`flex flex-col items-center gap-0.5 ${onLogoClick ? 'cursor-pointer group' : ''}`}
                    onClick={onLogoClick}
                >
                    {logoSrc && (
                        <img
                            src={logoSrc}
                            alt="Logo"
                            className="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-transform group-hover:scale-105"
                        />
                    )}

                    {title}

                    {showBackendStatus && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${isBackendOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isBackendOnline ? 'text-emerald-500' : 'text-red-500'}`}>
                                {isBackendOnline ? 'Backend Online' : 'Backend Offline'}
                            </span>
                        </div>
                    )}
                </div>

                {pageName && (
                    <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        {pageName}
                    </div>
                )}
                {/* Right Section: Controls */}
                <div className="flex items-center gap-2 md:gap-4">
                    {children}

                    <div className="hidden md:flex items-center gap-4">
                        {showSound && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playSound();
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                title="Play Sound"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="w-5 h-5"
                                >
                                    <path d="M10 13V6a2 2 0 0 1 4 0v7" />
                                    <circle cx="8" cy="15" r="3" />
                                    <circle cx="16" cy="15" r="3" />
                                </svg>
                            </button>
                        )}

                        {showAnimationToggle && (
                            <ToggleSwitch
                                isOn={isAnimationEnabled}
                                onToggle={onToggleAnimation}
                            />
                        )}
                    </div>

                    {showBetSlip && (
                        <button
                            onClick={onOpenBetSlip}
                            className="relative p-2 bg-zinc-900 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:border-emerald-500/50 transition-all group"
                        >
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                                {betsCount}
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 group-hover:scale-110 transition-transform">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </GlassPanel>
    );
};

export default Header;

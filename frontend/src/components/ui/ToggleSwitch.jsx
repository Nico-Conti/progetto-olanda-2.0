import React from 'react';

const ToggleSwitch = ({ isOn, onToggle, label }) => {
    return (
        <div className="flex items-center gap-3">
            {label && <span className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{label}</span>}
            <button
                onClick={onToggle}
                className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 focus:outline-none ${isOn ? 'bg-emerald-500' : 'bg-zinc-600'
                    }`}
                title={label || "Toggle"}
            >
                <div
                    className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${isOn ? 'translate-x-6' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    );
};

export default ToggleSwitch;

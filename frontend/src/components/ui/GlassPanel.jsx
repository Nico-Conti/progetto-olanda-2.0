import React from 'react';

const GlassPanel = ({ children, className = "" }) => {
    return (
        <div className={`glass-panel ${className}`}>
            {children}
        </div>
    );
};

export default GlassPanel;

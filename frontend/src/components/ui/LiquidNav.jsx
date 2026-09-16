import React from 'react';

/**
 * Floating bottom bar whose active item rises into a circle sitting in a notch
 * cut out of the bar ("liquid navigation", `.liquid-nav` in index.css).
 * `items` are `{ id, label, Icon }`; a `value` matching none hides the circle.
 */
const LiquidNav = ({ items, value, onChange }) => {
    const index = items.findIndex(item => item.id === value);
    return (
        <nav
            className="liquid-nav"
            style={{ '--n': items.length, '--i': index }}
            data-empty={index < 0 || undefined}
        >
            <span className="liquid-nav-bar" aria-hidden="true" />
            <span className="liquid-nav-blob" aria-hidden="true" />
            {items.map(item => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    aria-current={item.id === value ? 'page' : undefined}
                    className="liquid-nav-item"
                >
                    <item.Icon className="liquid-nav-icon" />
                    <span className="liquid-nav-label">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

export default LiquidNav;

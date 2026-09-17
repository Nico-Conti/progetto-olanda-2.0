/**
 * Props that make a non-button element behave like one. A row that holds its
 * own button - a TeamBadge opening the team page - cannot BE a <button>, so it
 * gets the role, the tab stop and the keyboard handling instead. TeamBadge
 * stops its own click, so the row keeps its action.
 */
export const clickable = (onClick) => ({
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
});

export default clickable;
